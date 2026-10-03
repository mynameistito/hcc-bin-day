const CACHE_PREFIX = "hcc-bin-day-shell-";
const BUILD_ID = "development";
const BUILD_ASSETS = [];
const NOTIFICATION_CACHE = "hcc-bin-day-notification-delivery-v1";
const NOTIFICATION_CONSENT_KEY = new URL(
  "/__notification-consent__",
  self.location.origin
).href;
const activeNotificationDeliveries = new Map();
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-192.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png",
  ...BUILD_ASSETS,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(APP_SHELL);
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data?.type === "NOTIFICATION_CONSENT") {
    event.waitUntil(
      (async () => {
        const cache = await caches.open(NOTIFICATION_CACHE);
        await (event.data.enabled === true
          ? cache.put(NOTIFICATION_CONSENT_KEY, new Response("enabled"))
          : cache.delete(NOTIFICATION_CONSENT_KEY));
      })()
    );
  }
});

const isBoundedString = (value, minimum, maximum) =>
  // SAFETY: Push payload JSON is untrusted and must be narrowed before use.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  typeof value === "string" &&
  value.length >= minimum &&
  value.length <= maximum;

const isCollectionDate = (value) => {
  if (!isBoundedString(value, 10, 10) || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};

const isValidPushPayload = (payload) => {
  // SAFETY: JSON.parse yields untrusted data, so runtime type checks are required here.
  // oxlint-disable-next-line anti-slop/no-runtime-typeof
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const checks = [
    payload.version === 1,
    isBoundedString(payload.notificationId, 1, 256),
    isCollectionDate(payload.collectionDate),
    [0, 1, 2, 7].includes(payload.leadDays),
    isBoundedString(payload.title, 1, 80),
    isBoundedString(payload.body, 1, 240),
  ];
  return checks.every(Boolean);
};

const parsePushPayload = (event) => {
  try {
    const payload = event.data?.json();
    if (!isValidPushPayload(payload)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
};

const showPushNotificationOnce = async (cache, payload) => {
  const deliveredKey = new URL(
    `/__notification-delivered__/${encodeURIComponent(payload.notificationId)}`,
    self.location.origin
  );
  const activeDelivery = activeNotificationDeliveries.get(
    payload.notificationId
  );
  if (activeDelivery) {
    await activeDelivery;
    return;
  }

  const delivery = (async () => {
    if (
      !(await cache.match(NOTIFICATION_CONSENT_KEY)) ||
      (await cache.match(deliveredKey))
    ) {
      return;
    }
    try {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        data: { url: "/" },
        renotify: false,
        tag: payload.notificationId,
      });
      await cache.put(deliveredKey, new Response(String(Date.now())));
    } catch {
      console.warn("Unable to display or record a bin-day notification.");
    }
  })();
  activeNotificationDeliveries.set(payload.notificationId, delivery);
  try {
    await delivery;
  } finally {
    activeNotificationDeliveries.delete(payload.notificationId);
  }
};

self.addEventListener("push", (event) => {
  const payload = parsePushPayload(event);
  if (!payload) {
    return;
  }

  event.waitUntil(
    (async () => {
      const cache = await caches.open(NOTIFICATION_CACHE);
      if (!(await cache.match(NOTIFICATION_CONSENT_KEY))) {
        return;
      }

      const cutoff = Date.now() - 400 * 24 * 60 * 60 * 1000;
      const entries = await cache.keys();
      const cleanup = [];
      for (const entry of entries) {
        if (entry.url !== NOTIFICATION_CONSENT_KEY) {
          cleanup.push(
            (async () => {
              const response = await cache.match(entry);
              const deliveredAt = Number(await response?.text());
              if (!Number.isFinite(deliveredAt) || deliveredAt < cutoff) {
                await cache.delete(entry);
              }
            })()
          );
        }
      }
      await Promise.all(cleanup);
      await showPushNotificationOnce(cache, payload);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url ?? "/"));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      const deletions = [];
      for (const key of keys) {
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) {
          deletions.push(caches.delete(key));
        }
      }
      await Promise.all(deletions);
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, response.clone());
          }
          return response;
        } catch {
          const cached =
            (await caches.match(request)) ?? (await caches.match("/"));
          return cached ?? Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cached = await caches.match(request);
        return cached ?? Response.error();
      }
    })()
  );
});

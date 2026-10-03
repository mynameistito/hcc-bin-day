import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

const readAppFile = (relativePath: string): Promise<string> =>
  readFile(new URL(relativePath, import.meta.url), "utf-8");

describe("PWA app shell", () => {
  test("declares install metadata and registers the root service worker", async () => {
    const [manifestSource, html, main, buildScript, networkStatus] =
      await Promise.all([
        readAppFile("../../public/manifest.webmanifest"),
        readAppFile("../../index.html"),
        readAppFile("../main.tsx"),
        readAppFile("../../../../scripts/build-web.ts"),
        readAppFile("../hooks/use-network-status.ts"),
      ]);
    const manifest: {
      readonly display: string;
      readonly icons: readonly {
        readonly purpose?: string;
        readonly sizes: string;
        readonly src: string;
        readonly type: string;
      }[];
      readonly name: string;
      readonly short_name: string;
      readonly start_url: string;
      readonly theme_color: string;
    } = JSON.parse(manifestSource);

    expect(manifest).toMatchObject({
      display: "standalone",
      name: "Hamilton Bin Day",
      short_name: "Bin Day",
      start_url: "/",
      theme_color: "#171d19",
    });
    expect(manifest.icons).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ sizes: "512x512", type: "image/png" }),
        expect.objectContaining({ purpose: "maskable", sizes: "192x192" }),
        expect.objectContaining({ purpose: "maskable", sizes: "512x512" }),
      ])
    );
    expect({
      hasManifest: html.includes('rel="manifest" href="/manifest.webmanifest"'),
      safeIosStatusBar:
        /<meta\s+name="apple-mobile-web-app-status-bar-style"\s+content="black"\s*\/>/u.test(
          html
        ),
      registersServiceWorker: main.includes('.register("/sw.js")'),
      detectsWaitingUpdates:
        main.includes("if (registration.waiting)") &&
        main.includes("let updatePending = false"),
      sortsBuildAssets: buildScript.includes("assetFiles.sort()"),
      validatesPlaceholders: buildScript.includes(
        "Expected exactly one service-worker placeholder"
      ),
      seedsFromBrowserNetworkState: networkStatus.includes(
        'let isOnline = typeof navigator !== "undefined" && navigator.onLine;'
      ),
    }).toStrictEqual({
      hasManifest: true,
      safeIosStatusBar: true,
      registersServiceWorker: true,
      detectsWaitingUpdates: true,
      sortsBuildAssets: true,
      validatesPlaceholders: true,
      seedsFromBrowserNetworkState: true,
    });
  });

  test("precaches the app shell and falls back to it for offline navigation", async () => {
    const serviceWorker = await readAppFile("../../public/sw.js");

    expect({
      precachesRoot: serviceWorker.includes('"/"'),
      handlesNavigations: serviceWorker.includes(
        'if (request.mode === "navigate")'
      ),
      cachesNavigationsByRequest: serviceWorker.includes(
        "await cache.put(request, response.clone())"
      ),
      fallsBackToMatchingNavigation: serviceWorker.includes(
        "(await caches.match(request))"
      ),
      fallsBackToRoot: serviceWorker.includes('await caches.match("/")'),
      returnsNetworkErrorWhenUncached: serviceWorker.includes(
        "return cached ?? Response.error()"
      ),
      bypassesApi: serviceWorker.includes('url.pathname.startsWith("/api/")'),
    }).toStrictEqual({
      precachesRoot: true,
      handlesNavigations: true,
      cachesNavigationsByRequest: true,
      fallsBackToMatchingNavigation: true,
      fallsBackToRoot: true,
      returnsNetworkErrorWhenUncached: true,
      bypassesApi: true,
    });
  });

  test("requests permission only from explicit reminder opt-in and syncs consent to the worker", async () => {
    const [settings, deliveryHook, serviceWorker] = await Promise.all([
      readAppFile("../components/notification-settings.tsx"),
      readAppFile("../hooks/use-reminder-delivery.ts"),
      readAppFile("../../public/sw.js"),
    ]);
    const enableStart = deliveryHook.indexOf("const enableReminders = async");
    const disableStart = deliveryHook.indexOf("const disableReminders = async");
    const enableAction = deliveryHook.slice(enableStart, disableStart);

    expect({
      hasExplicitOptIn:
        settings.includes('type="checkbox"') &&
        settings.includes("event.target.checked") &&
        settings.includes("void enableReminders()"),
      hasLocalTime: settings.includes('type="time"'),
      hasDayBeforeOption: settings.includes("The day before"),
      showsPermissionState: deliveryHook.includes("Notification.permission"),
      permissionPromptLivesInOptInAction:
        enableAction.includes("requestBrowserNotificationPermission(") &&
        deliveryHook.includes(
          "const requestBrowserNotificationPermission = async"
        ) &&
        deliveryHook.includes("Notification.requestPermission()") &&
        !settings.includes("Notification.requestPermission"),
      syncsOptInToServiceWorker:
        deliveryHook.includes("registration.active?.postMessage({") &&
        deliveryHook.includes('type: "NOTIFICATION_CONSENT"') &&
        serviceWorker.includes('type === "NOTIFICATION_CONSENT"'),
      handlesPushEvents: serviceWorker.includes('addEventListener("push"'),
    }).toStrictEqual({
      hasExplicitOptIn: true,
      hasLocalTime: true,
      hasDayBeforeOption: true,
      showsPermissionState: true,
      permissionPromptLivesInOptInAction: true,
      syncsOptInToServiceWorker: true,
      handlesPushEvents: true,
    });
  });
});

import {
  decodeUnknownSync,
  String as SchemaString,
  Struct,
} from "effect/Schema";
import { useEffect, useRef, useState } from "react";

import { resolveNotificationPermissionState } from "@/lib/notifications";
import type {
  NotificationPreferences,
  NotificationPermissionState,
} from "@/lib/notifications";
import {
  decodeApplicationServerKey,
  deletePushReminder,
  enqueuePushMutation,
  forgetPushEndpoint,
  readStoredPushEndpoint,
  rememberPushEndpoint,
  savePushReminder,
} from "@/lib/push-reminders";
import type { ScheduleResponse } from "@/lib/schedule";

const readDeviceTimeZone = (): string =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;
const parsePublicKey = decodeUnknownSync(Struct({ publicKey: SchemaString }));

const readPermissionState = (): NotificationPermissionState => {
  const hasNotification = "Notification" in window;
  return resolveNotificationPermissionState({
    hasNotification,
    hasPushManager: "PushManager" in window,
    hasServiceWorker: "serviceWorker" in navigator,
    permission: hasNotification ? Notification.permission : "default",
    secureContext: window.isSecureContext,
  });
};

const isInstalledIosApp = (): boolean => {
  const isIos = /iPad|iPhone|iPod/u.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator && navigator.standalone === true);
  return !isIos || isStandalone;
};

const validateReminderEnable = (
  schedule: ScheduleResponse | null,
  setPermission: (permission: NotificationPermissionState) => void,
  setDeliveryMessage: (message: string) => void
): schedule is ScheduleResponse => {
  if (!schedule) {
    setDeliveryMessage("Look up your address before enabling reminders.");
    return false;
  }
  if (!isInstalledIosApp()) {
    setDeliveryMessage(
      "On iPhone or iPad, add this app to your Home Screen and open it there before enabling web push."
    );
    return false;
  }
  const support = readPermissionState();
  setPermission(support);
  if (
    support === "unsupported" ||
    support === "insecure" ||
    support === "denied"
  ) {
    setDeliveryMessage(
      "Reminders cannot be enabled with this browser's current notification settings."
    );
    return false;
  }
  return true;
};

const requestBrowserNotificationPermission = async (
  isCurrent: () => boolean,
  setPermission: (permission: NotificationPermissionState) => void,
  setDeliveryMessage: (message: string) => void
): Promise<boolean> => {
  const permission = await Notification.requestPermission();
  if (!isCurrent()) {
    return false;
  }
  setPermission(permission);
  if (permission === "granted") {
    return true;
  }
  setDeliveryMessage(
    permission === "denied"
      ? "Notifications are blocked. Change this site's permission in browser settings to enable reminders."
      : "Notification permission was not granted, so reminders remain off."
  );
  return false;
};

const serializeSubscription = (subscription: PushSubscription) => {
  const json = subscription.toJSON();
  const auth = json.keys?.auth;
  const p256dh = json.keys?.p256dh;
  if (!(auth && p256dh)) {
    return null;
  }
  return {
    endpoint: subscription.endpoint,
    expirationTime: subscription.expirationTime,
    keys: { auth, p256dh },
  };
};

const PUSH_CLEANUP = {
  missingEndpoint: "missing-endpoint",
  removed: "removed",
  serverFailed: "server-failed",
} as const;
type PushCleanupResult = (typeof PUSH_CLEANUP)[keyof typeof PUSH_CLEANUP];
const STORAGE_CLEANUP_FAILED =
  "Browser storage is unavailable and the server could not remove the subscription. It remains enabled; try again.";
const REMINDER_ENABLED_MESSAGE =
  "Reminders are enabled for the schedule shown. The server stores the push subscription and schedule preferences, not your address.";

/** Delete the server record and browser subscription using the active or cached endpoint. */
const cleanupPushSubscription = async (
  subscription: PushSubscription | null,
  isCurrent: () => boolean = () => true
): Promise<PushCleanupResult> => {
  const endpoint = subscription?.endpoint ?? readStoredPushEndpoint();
  if (!endpoint) {
    return PUSH_CLEANUP.missingEndpoint;
  }
  if (!(await deletePushReminder(endpoint))) {
    return PUSH_CLEANUP.serverFailed;
  }
  if (subscription && isCurrent()) {
    try {
      await subscription.unsubscribe();
    } catch {
      // Server deletion is already confirmed, so a local browser error must not keep reminders enabled.
    }
  }
  if (isCurrent()) {
    forgetPushEndpoint();
  }
  return PUSH_CLEANUP.removed;
};

const cleanupAndDisable = async (
  subscription: PushSubscription | null,
  preferences: NotificationPreferences,
  savePreferences: (next: NotificationPreferences) => boolean,
  isCurrent: () => boolean = () => true
): Promise<PushCleanupResult> => {
  const cleanup = await cleanupPushSubscription(subscription, isCurrent);
  if (cleanup === PUSH_CLEANUP.removed && isCurrent()) {
    savePreferences({ ...preferences, enabled: false });
  }
  return cleanup;
};

const reportMissingSubscription = (
  cleanup: PushCleanupResult,
  active: boolean,
  setDeliveryActive: (active: boolean) => void,
  setDeliveryMessage: (message: string) => void
): void => {
  if (!active) {
    return;
  }
  if (cleanup === PUSH_CLEANUP.removed) {
    setDeliveryActive(false);
    setDeliveryMessage(
      "No browser push subscription exists, so its server-side reminder was removed and reminders are off."
    );
    return;
  }
  setDeliveryMessage(
    cleanup === PUSH_CLEANUP.missingEndpoint
      ? "No browser push subscription exists and server cleanup cannot be confirmed. Reminders remain on."
      : "No browser push subscription exists and the server could not remove its reminder. It remains enabled; try again."
  );
};

interface EnrollmentOutcome {
  readonly active: boolean;
  readonly message: string;
}

const enrollReminder = async (
  subscription: PushSubscription,
  schedule: ScheduleResponse,
  preferences: NotificationPreferences,
  savePreferences: (next: NotificationPreferences) => boolean
): Promise<EnrollmentOutcome> => {
  const nextPreferences = { ...preferences, enabled: true };
  try {
    const serialized = serializeSubscription(subscription);
    if (!serialized) {
      const cleanup = await cleanupPushSubscription(subscription);
      if (cleanup !== PUSH_CLEANUP.removed) {
        savePreferences(nextPreferences);
      }
      return {
        active: cleanup !== PUSH_CLEANUP.removed,
        message:
          cleanup === PUSH_CLEANUP.removed
            ? "This browser could not provide a complete push subscription. Any saved reminder was removed."
            : "This browser could not provide a complete push subscription, and server cleanup failed. Reminders remain on.",
      };
    }
    if (!rememberPushEndpoint(subscription.endpoint)) {
      const cleanup = await cleanupPushSubscription(subscription);
      if (cleanup !== PUSH_CLEANUP.removed) {
        savePreferences(nextPreferences);
        return {
          active: true,
          message:
            "Browser storage is unavailable and server cleanup failed. Reminders remain on until cleanup succeeds.",
        };
      }
      return {
        active: false,
        message:
          "Browser storage is unavailable, so the server subscription was removed and reminders remain off.",
      };
    }
    const saved = await savePushReminder(
      serialized,
      schedule,
      nextPreferences,
      readDeviceTimeZone()
    );
    if (!saved) {
      const cleanup = await cleanupPushSubscription(subscription);
      if (cleanup !== PUSH_CLEANUP.removed) {
        savePreferences(nextPreferences);
        return {
          active: true,
          message:
            "The server could not confirm or remove the subscription. Reminders remain on until cleanup succeeds.",
        };
      }
      return {
        active: false,
        message:
          "The subscription could not be saved on the server. Reminders remain off.",
      };
    }
    if (savePreferences(nextPreferences)) {
      return { active: true, message: REMINDER_ENABLED_MESSAGE };
    }
    const cleanup = await cleanupPushSubscription(subscription);
    if (cleanup === PUSH_CLEANUP.removed) {
      savePreferences({ ...nextPreferences, enabled: false });
      return {
        active: false,
        message:
          "Browser storage is unavailable, so the server subscription was removed and reminders remain off.",
      };
    }
    savePreferences(nextPreferences);
    return { active: true, message: STORAGE_CLEANUP_FAILED };
  } catch {
    const cleanup = await cleanupPushSubscription(subscription);
    if (cleanup === PUSH_CLEANUP.removed) {
      return {
        active: false,
        message:
          "Reminders could not be set up. Check your connection and try again.",
      };
    }
    rememberPushEndpoint(subscription.endpoint);
    savePreferences(nextPreferences);
    return {
      active: true,
      message:
        "Setup could not finish and server cleanup failed. Reminders remain enabled; try turning them off again.",
    };
  }
};

const readPublicKey = async (): Promise<string | null> => {
  const response = await fetch("/api/reminders/public-key");
  if (!response.ok) {
    return null;
  }
  try {
    const value: unknown = await response.json();
    return parsePublicKey(value).publicKey;
  } catch {
    return null;
  }
};

const getOrCreatePushSubscription = async (
  registration: ServiceWorkerRegistration,
  isCurrent: () => boolean,
  setDeliveryMessage: (message: string) => void
): Promise<PushSubscription | null> => {
  const existing = await registration.pushManager.getSubscription();
  if (!isCurrent()) {
    return null;
  }
  if (existing) {
    return existing;
  }
  const publicKey = await readPublicKey();
  if (!publicKey) {
    if (isCurrent()) {
      setDeliveryMessage(
        "Background delivery is not configured on the server yet. No reminder was saved."
      );
    }
    return null;
  }
  // oxlint-disable-next-line react-doctor/effect-needs-cleanup -- SAFETY: The subscription is unsubscribed if consent changes before enrollment completes.
  const created = await registration.pushManager.subscribe({
    applicationServerKey: decodeApplicationServerKey(publicKey),
    userVisibleOnly: true,
  });
  if (!isCurrent()) {
    await created.unsubscribe();
    return null;
  }
  return created;
};

/** Manage explicit browser push consent and synchronize the address-free delivery snapshot. */
export const useReminderDelivery = (
  schedule: ScheduleResponse | null,
  cancelMissingSchedule: boolean,
  preferences: NotificationPreferences,
  savePreferences: (next: NotificationPreferences) => boolean
) => {
  const [permission, setPermission] =
    useState<NotificationPermissionState>(readPermissionState);
  const [deliveryMessage, setDeliveryMessage] = useState("");
  const [deliveryActive, setDeliveryActive] = useState(false);
  const mutationVersion = useRef(0);

  useEffect(() => {
    const refreshPermission = () => setPermission(readPermissionState());
    window.addEventListener("focus", refreshPermission);
    return () => window.removeEventListener("focus", refreshPermission);
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }
    const updateConsent = async () => {
      try {
        const registration = await navigator.serviceWorker.ready;
        registration.active?.postMessage({
          enabled: preferences.enabled,
          type: "NOTIFICATION_CONSENT",
        });
      } catch {
        // Server registration remains manageable if local Cache Storage is unavailable.
      }
    };
    void updateConsent();
  }, [preferences.enabled]);

  const enableReminders = async () => {
    mutationVersion.current += 1;
    const operationVersion = mutationVersion.current;
    if (!validateReminderEnable(schedule, setPermission, setDeliveryMessage)) {
      return;
    }

    let subscription: PushSubscription | null = null;
    try {
      const hasPermission = await requestBrowserNotificationPermission(
        () => operationVersion === mutationVersion.current,
        setPermission,
        setDeliveryMessage
      );
      if (!hasPermission) {
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      subscription = await getOrCreatePushSubscription(
        registration,
        () => operationVersion === mutationVersion.current,
        setDeliveryMessage
      );
      if (!subscription) {
        return;
      }
      const currentSubscription = subscription;
      if (!currentSubscription) {
        return;
      }
      const outcome = await enqueuePushMutation(() => {
        if (operationVersion !== mutationVersion.current) {
          return Promise.resolve(null);
        }
        return enrollReminder(
          currentSubscription,
          schedule,
          preferences,
          savePreferences
        );
      });
      if (!outcome || operationVersion !== mutationVersion.current) {
        return;
      }
      setDeliveryActive(outcome.active);
      setDeliveryMessage(outcome.message);
    } catch {
      if (operationVersion !== mutationVersion.current) {
        return;
      }
      if (subscription) {
        const cleanup = await enqueuePushMutation(() =>
          cleanupPushSubscription(
            subscription,
            () => operationVersion === mutationVersion.current
          )
        );
        if (operationVersion !== mutationVersion.current) {
          return;
        }
        if (cleanup !== PUSH_CLEANUP.removed) {
          rememberPushEndpoint(subscription.endpoint);
          savePreferences({ ...preferences, enabled: true });
          setDeliveryActive(true);
          setDeliveryMessage(
            "Setup could not finish and server cleanup failed. Reminders remain enabled; try turning them off again."
          );
          return;
        }
      }
      setDeliveryMessage(
        "Reminders could not be set up. Check your connection and try again."
      );
    }
  };

  const disableReminders = async () => {
    mutationVersion.current += 1;
    const operationVersion = mutationVersion.current;
    await enqueuePushMutation(async () => {
      if (operationVersion !== mutationVersion.current) {
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (operationVersion !== mutationVersion.current) {
          return;
        }
        const cleanup = await cleanupPushSubscription(
          subscription,
          () => operationVersion === mutationVersion.current
        );
        if (operationVersion !== mutationVersion.current) {
          return;
        }
        if (cleanup === PUSH_CLEANUP.missingEndpoint) {
          setDeliveryMessage(
            "No browser subscription or saved endpoint is available to confirm server cleanup. Reminders remain on."
          );
          return;
        }
        if (cleanup === PUSH_CLEANUP.serverFailed) {
          setDeliveryMessage(
            "The server could not remove this reminder. It remains enabled; try again."
          );
          return;
        }
        savePreferences({ ...preferences, enabled: false });
        setDeliveryActive(false);
        setDeliveryMessage(
          "Reminders are off and the server-side subscription was removed."
        );
      } catch {
        if (operationVersion === mutationVersion.current) {
          setDeliveryMessage(
            "Reminders could not be disabled. Check your connection and try again."
          );
        }
      }
    });
  };

  useEffect(() => {
    if (!preferences.enabled) {
      return;
    }
    let active = true;
    mutationVersion.current += 1;
    const operationVersion = mutationVersion.current;
    if (!schedule) {
      if (!cancelMissingSchedule) {
        return;
      }
      const removeMissingSchedule = async () => {
        await enqueuePushMutation(async () => {
          if (!active || operationVersion !== mutationVersion.current) {
            return;
          }
          try {
            const registration = await navigator.serviceWorker.ready;
            const subscription =
              await registration.pushManager.getSubscription();
            if (!active || operationVersion !== mutationVersion.current) {
              return;
            }
            const cleanup = await cleanupPushSubscription(
              subscription,
              () => active && operationVersion === mutationVersion.current
            );
            if (!active || operationVersion !== mutationVersion.current) {
              return;
            }
            if (cleanup === PUSH_CLEANUP.missingEndpoint) {
              setDeliveryMessage(
                "The reminder could not be cancelled because no browser subscription or saved endpoint is available for server cleanup."
              );
              return;
            }
            if (cleanup === PUSH_CLEANUP.serverFailed) {
              setDeliveryMessage(
                "The server could not cancel the reminder because the new address has no matching schedule."
              );
              return;
            }
            savePreferences({ ...preferences, enabled: false });
            setDeliveryActive(false);
            setDeliveryMessage(
              "The reminder was cancelled because the new lookup has no collection schedule."
            );
          } catch {
            if (active && operationVersion === mutationVersion.current) {
              setDeliveryMessage(
                "The old reminder could not be cancelled. Turn reminders off and try again."
              );
            }
          }
        });
      };
      void removeMissingSchedule();
      return () => {
        active = false;
      };
    }
    const syncSchedule = async () => {
      await enqueuePushMutation(async () => {
        if (!active || operationVersion !== mutationVersion.current) {
          return;
        }
        try {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await registration.pushManager.getSubscription();
          if (!active || operationVersion !== mutationVersion.current) {
            return;
          }
          const serialized =
            subscription && serializeSubscription(subscription);
          if (!serialized || !subscription) {
            const cleanup = await cleanupAndDisable(
              null,
              preferences,
              savePreferences,
              () => active && operationVersion === mutationVersion.current
            );
            reportMissingSubscription(
              cleanup,
              active && operationVersion === mutationVersion.current,
              setDeliveryActive,
              setDeliveryMessage
            );
            return;
          }
          if (
            !savePreferences(preferences) ||
            !rememberPushEndpoint(subscription.endpoint)
          ) {
            const cleanup = await cleanupAndDisable(
              subscription,
              preferences,
              savePreferences,
              () => active && operationVersion === mutationVersion.current
            );
            if (!active || operationVersion !== mutationVersion.current) {
              return;
            }
            if (cleanup === PUSH_CLEANUP.removed) {
              setDeliveryActive(false);
              setDeliveryMessage(
                "Browser storage is unavailable, so the server subscription was removed and reminders were turned off."
              );
            } else {
              setDeliveryActive(true);
              setDeliveryMessage(STORAGE_CLEANUP_FAILED);
            }
            return;
          }
          const saved = await savePushReminder(
            serialized,
            schedule,
            preferences,
            readDeviceTimeZone()
          );
          if (!active || operationVersion !== mutationVersion.current) {
            return;
          }
          if (saved) {
            setDeliveryActive(true);
          } else {
            setDeliveryActive(false);
            setDeliveryMessage(
              "Your reminder update could not be saved. Any previous server subscription remains unchanged; reminders stay on in this browser. Try changing the setting again."
            );
          }
        } catch {
          if (active && operationVersion === mutationVersion.current) {
            setDeliveryActive(false);
            setDeliveryMessage(
              "The server could not confirm your reminder status. Reminders stay on in this browser; any existing server subscription was not intentionally removed."
            );
          }
        }
      });
    };
    void syncSchedule();
    return () => {
      active = false;
    };
  }, [cancelMissingSchedule, preferences, savePreferences, schedule]);

  return {
    deliveryActive,
    deliveryMessage,
    disableReminders,
    enableReminders,
    permission,
  };
};

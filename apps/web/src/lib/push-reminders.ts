import type { PushSubscription } from "@block65/webcrypto-web-push";

import type { NotificationPreferences } from "@/lib/notifications";
import type { ScheduleResponse } from "@/lib/schedule";

export const PUSH_ENDPOINT_STORAGE_KEY = "hcc-bin-day-push-endpoint-v1";

/** A queue that executes browser push mutations in the order they were submitted. */
export type PushMutationQueue = <T>(operation: () => Promise<T>) => Promise<T>;

const noop = (): undefined => undefined;

/** Create a per-component queue that applies browser push mutations in call order. */
export const createPushMutationQueue = (): PushMutationQueue => {
  let tail = Promise.resolve();
  return async <T>(operation: () => Promise<T>) => {
    let resolveCurrent: () => void = noop;
    // SAFETY: This deferred promise serializes operations; its resolver is called in the finally block.
    // oxlint-disable-next-line promise/avoid-new
    const current = new Promise<void>((resolve) => {
      resolveCurrent = resolve;
    });
    const previous = tail;
    tail = current;
    await previous;
    try {
      return await operation();
    } finally {
      resolveCurrent();
    }
  };
};

const pushMutationQueue = createPushMutationQueue();

/** Serialize subscription mutations across reminder components in this tab. */
export const enqueuePushMutation: PushMutationQueue = (operation) =>
  pushMutationQueue(operation);

/** Read the last endpoint locally so server cleanup still works if PushManager loses it. */
export const readStoredPushEndpoint = (): string | null => {
  try {
    return window.localStorage.getItem(PUSH_ENDPOINT_STORAGE_KEY);
  } catch {
    return null;
  }
};

/** Keep the opaque push endpoint in this browser only for later unsubscribe requests. */
export const rememberPushEndpoint = (endpoint: string): boolean => {
  try {
    window.localStorage.setItem(PUSH_ENDPOINT_STORAGE_KEY, endpoint);
    return true;
  } catch {
    return false;
  }
};

/** Forget the locally retained endpoint after server-side deletion succeeds. */
export const forgetPushEndpoint = (): boolean => {
  try {
    window.localStorage.removeItem(PUSH_ENDPOINT_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
};

/** Convert a VAPID base64url public key to the bytes expected by PushManager. */
export const decodeApplicationServerKey = (
  value: string
): Uint8Array<ArrayBuffer> => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(
    normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")
  );
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.codePointAt(index) ?? 0;
  }
  return bytes;
};

const snapshotFor = (schedule: ScheduleResponse) => ({
  collectionDate: schedule.nextCollection.date,
  followingDate:
    schedule.nextCollection.type === "red"
      ? schedule.yellowBin
      : schedule.redBin,
  collectionType: schedule.nextCollection.type,
  redDate: schedule.redBin,
  yellowDate: schedule.yellowBin,
});

/** Persist a push subscription and the minimum schedule/preference snapshot needed by the sender. */
export const savePushReminder = async (
  subscription: PushSubscription,
  schedule: ScheduleResponse,
  preferences: NotificationPreferences,
  timeZone: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> => {
  try {
    const response = await fetcher("/api/reminders/subscription", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription,
        schedule: snapshotFor(schedule),
        preferences: { ...preferences, enabled: true },
        timeZone,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
};

/** Delete server-side subscription data before the browser subscription is removed. */
export const deletePushReminder = async (
  endpoint: string,
  fetcher: typeof fetch = fetch
): Promise<boolean> => {
  try {
    const response = await fetcher("/api/reminders/subscription", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${endpoint}` },
    });
    return response.ok;
  } catch {
    return false;
  }
};

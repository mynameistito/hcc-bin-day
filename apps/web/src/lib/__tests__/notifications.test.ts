import { afterEach, describe, expect, test, vi } from "vitest";

import {
  calculateReminderSchedule,
  NOTIFICATION_PREFERENCES_KEY,
  parseNotificationPreferences,
  readNotificationPreferences,
  resolveNotificationPermissionState,
  saveNotificationPreferences,
} from "@/lib/notifications";
import type { NotificationPreferences } from "@/lib/notifications";

const enabledPreferences = (
  overrides: Partial<NotificationPreferences> = {}
): NotificationPreferences => ({
  enabled: true,
  leadDays: 1,
  localTime: "19:00",
  ...overrides,
});

describe("notification preference persistence", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("defaults to disabled and rejects malformed stored values", () => {
    expect(parseNotificationPreferences(null)).toStrictEqual({
      enabled: false,
      leadDays: 1,
      localTime: "19:00",
    });
    expect(
      parseNotificationPreferences({
        enabled: true,
        leadDays: 3,
        localTime: "25:70",
      })
    ).toStrictEqual({ enabled: false, leadDays: 1, localTime: "19:00" });
  });

  test("persists only the reminder choice, lead time, and local time", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const preferences = enabledPreferences({ leadDays: 7, localTime: "08:15" });

    expect(saveNotificationPreferences(preferences)).toBeTruthy();
    expect(values.get(NOTIFICATION_PREFERENCES_KEY)).toBe(
      JSON.stringify(preferences)
    );
    expect(readNotificationPreferences()).toStrictEqual(preferences);
  });

  test("fails safely when browser storage is unavailable", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(readNotificationPreferences().enabled).toBeFalsy();
    expect(saveNotificationPreferences(enabledPreferences())).toBeFalsy();
  });
});

describe(resolveNotificationPermissionState, () => {
  const supportedBrowser = {
    hasNotification: true,
    hasPushManager: true,
    hasServiceWorker: true,
    permission: "default" as const,
    secureContext: true,
  };

  test("distinguishes unsupported, insecure, undecided, granted, and denied states", () => {
    expect(
      resolveNotificationPermissionState({
        ...supportedBrowser,
        hasPushManager: false,
      })
    ).toBe("unsupported");
    expect(
      resolveNotificationPermissionState({
        ...supportedBrowser,
        secureContext: false,
      })
    ).toBe("insecure");
    expect(resolveNotificationPermissionState(supportedBrowser)).toBe(
      "default"
    );
    expect(
      resolveNotificationPermissionState({
        ...supportedBrowser,
        permission: "granted",
      })
    ).toBe("granted");
    expect(
      resolveNotificationPermissionState({
        ...supportedBrowser,
        permission: "denied",
      })
    ).toBe("denied");
  });
});

describe(calculateReminderSchedule, () => {
  test("calculates a day-before reminder by local calendar date", () => {
    const schedule = calculateReminderSchedule(
      "2026-10-05",
      enabledPreferences({ localTime: "19:00" }),
      "Pacific/Auckland"
    );

    expect(schedule).toMatchObject({
      collectionDate: "2026-10-05",
      localDate: "2026-10-04",
      localTime: "19:00",
      timeZone: "Pacific/Auckland",
    });
    expect(schedule?.scheduledAt.toISOString()).toBe(
      "2026-10-04T06:00:00.000Z"
    );
  });

  test("supports same-day, multiple-day, and one-week lead times", () => {
    expect(
      calculateReminderSchedule(
        "2026-07-10",
        enabledPreferences({ leadDays: 0 }),
        "Pacific/Auckland"
      )?.localDate
    ).toBe("2026-07-10");
    expect(
      calculateReminderSchedule(
        "2026-07-10",
        enabledPreferences({ leadDays: 2 }),
        "Pacific/Auckland"
      )?.localDate
    ).toBe("2026-07-08");
    expect(
      calculateReminderSchedule(
        "2026-07-10",
        enabledPreferences({ leadDays: 7 }),
        "Pacific/Auckland"
      )?.localDate
    ).toBe("2026-07-03");
  });

  test("uses the device timezone even when the local time is on the prior UTC date", () => {
    const schedule = calculateReminderSchedule(
      "2026-06-15",
      enabledPreferences({ leadDays: 0, localTime: "08:30" }),
      "Pacific/Auckland"
    );

    expect(schedule?.scheduledAt.toISOString()).toBe(
      "2026-06-14T20:30:00.000Z"
    );
  });

  test("handles the spring-forward gap by choosing the next valid local minute", () => {
    const schedule = calculateReminderSchedule(
      "2026-09-28",
      enabledPreferences({ leadDays: 1, localTime: "02:30" }),
      "Pacific/Auckland"
    );

    expect(schedule?.scheduledAt.toISOString()).toBe(
      "2026-09-26T14:00:00.000Z"
    );
    expect(schedule?.scheduledLocalTime).toBe("03:00");
  });

  test("chooses the first occurrence of a repeated fall-back local time", () => {
    const schedule = calculateReminderSchedule(
      "2026-04-06",
      enabledPreferences({ leadDays: 1, localTime: "02:30" }),
      "Pacific/Auckland"
    );

    expect(schedule?.scheduledAt.toISOString()).toBe(
      "2026-04-04T13:30:00.000Z"
    );
  });

  test("changes the de-duplication identity with the collection or preference", () => {
    const first = calculateReminderSchedule(
      "2026-10-05",
      enabledPreferences(),
      "Pacific/Auckland"
    );
    const changedPreference = calculateReminderSchedule(
      "2026-10-05",
      enabledPreferences({ leadDays: 2 }),
      "Pacific/Auckland"
    );
    const changedCollection = calculateReminderSchedule(
      "2026-10-12",
      enabledPreferences(),
      "Pacific/Auckland"
    );

    expect(first?.notificationId).not.toBe(changedPreference?.notificationId);
    expect(first?.notificationId).not.toBe(changedCollection?.notificationId);
  });

  test("does not calculate reminders when disabled or given invalid dates/zones", () => {
    expect(
      calculateReminderSchedule(
        "2026-10-05",
        { ...enabledPreferences(), enabled: false },
        "Pacific/Auckland"
      )
    ).toBeNull();
    expect(
      calculateReminderSchedule(
        "2026-02-30",
        enabledPreferences(),
        "Pacific/Auckland"
      )
    ).toBeNull();
    expect(
      calculateReminderSchedule(
        "2026-13-01",
        enabledPreferences(),
        "Pacific/Auckland"
      )
    ).toBeNull();
    expect(
      calculateReminderSchedule(
        "2026-10-05",
        enabledPreferences(),
        "Not/A-Timezone"
      )
    ).toBeNull();
  });
});

import {
  Boolean as SchemaBoolean,
  decodeUnknownSync,
  isPattern,
  Literal,
  String as SchemaString,
  Struct,
  Union,
} from "effect/Schema";

export const NOTIFICATION_PREFERENCES_KEY = "hcc-bin-day-notifications-v1";

/** Supported number of days before collection for a reminder. */
export type ReminderLeadDays = 0 | 1 | 2 | 7;

/** Browser permission and delivery-support state shown in the reminder controls. */
export type NotificationPermissionState =
  | "unsupported"
  | "insecure"
  | "default"
  | "granted"
  | "denied";

/** Browser capabilities used to describe reminder permission state. */
export interface NotificationCapabilities {
  readonly secureContext: boolean;
  readonly hasNotification: boolean;
  readonly hasServiceWorker: boolean;
  readonly hasPushManager: boolean;
  readonly permission: "default" | "granted" | "denied";
}

/** User-controlled reminder preferences stored on this device. */
export interface NotificationPreferences {
  readonly enabled: boolean;
  readonly leadDays: ReminderLeadDays;
  readonly localTime: string;
}

/** Reminder date and instant resolved in the device's local timezone. */
export interface ReminderSchedule {
  readonly collectionDate: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly timeZone: string;
  readonly scheduledAt: Date;
  readonly scheduledLocalDate: string;
  readonly scheduledLocalTime: string;
  readonly notificationId: string;
}

/** Resolve the browser support state without prompting for permission. */
export const resolveNotificationPermissionState = (
  capabilities: NotificationCapabilities
): NotificationPermissionState => {
  if (!capabilities.secureContext) {
    return "insecure";
  }
  if (
    !capabilities.hasNotification ||
    !capabilities.hasServiceWorker ||
    !capabilities.hasPushManager
  ) {
    return "unsupported";
  }
  return capabilities.permission;
};

const NotificationPreferencesSchema = Struct({
  enabled: SchemaBoolean,
  leadDays: Union([Literal(0), Literal(1), Literal(2), Literal(7)]),
  localTime: SchemaString.check(isPattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)),
});
const parsePreferences = decodeUnknownSync(NotificationPreferencesSchema);

interface ZonedDateParts {
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly month: number;
  readonly year: number;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  enabled: false,
  leadDays: 1,
  localTime: "19:00",
};

/** Parse persisted preferences without trusting local storage contents. */
export const parseNotificationPreferences = (
  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- SAFETY: localStorage JSON is untrusted and is decoded by the Effect Schema parser below.
  value: unknown
): NotificationPreferences => {
  try {
    return parsePreferences(value);
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

/** Read notification preferences from local storage, returning safe defaults on failure. */
export const readNotificationPreferences = (): NotificationPreferences => {
  try {
    const stored = window.localStorage.getItem(NOTIFICATION_PREFERENCES_KEY);
    return stored === null
      ? DEFAULT_PREFERENCES
      : parseNotificationPreferences(JSON.parse(stored));
  } catch {
    return DEFAULT_PREFERENCES;
  }
};

/** Persist notification preferences on this device. */
export const saveNotificationPreferences = (
  preferences: NotificationPreferences
): boolean => {
  try {
    const parsedPreferences = parsePreferences(preferences);
    window.localStorage.setItem(
      NOTIFICATION_PREFERENCES_KEY,
      JSON.stringify(parsedPreferences)
    );
    return true;
  } catch {
    return false;
  }
};

const parseDate = (date: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date)) {
    return null;
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().slice(0, 10) === date ? parsed : null;
};

const shiftDate = (date: Date, days: number): string => {
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
};

const partsFor = (instant: Date, timeZone: string): ZonedDateParts => {
  const formattedParts = new Intl.DateTimeFormat("en-NZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = new Map<string, number>();
  for (const part of formattedParts) {
    if (part.type !== "literal") {
      values.set(part.type, Number(part.value));
    }
  }
  return {
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
    month: values.get("month") ?? 0,
    year: values.get("year") ?? 0,
  };
};

const localDateTimeMatches = (
  instant: Date,
  date: string,
  time: string,
  timeZone: string
): boolean => {
  const parts = partsFor(instant, timeZone);
  const expected = `${date} ${time}`;
  const actual = `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  return actual === expected;
};

const offsetAt = (instant: Date, timeZone: string): number => {
  const parts = partsFor(instant, timeZone);
  const localAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute
  );
  return localAsUtc - Math.floor(instant.getTime() / 60_000) * 60_000;
};

const matchingInstants = (
  date: string,
  time: string,
  timeZone: string
): Date[] => {
  const wallTime = Date.parse(`${date}T${time}:00.000Z`);
  const offsets = new Set<number>();
  for (const offsetHours of [-36, -24, -12, 0, 12, 24, 36]) {
    offsets.add(
      offsetAt(new Date(wallTime + offsetHours * 3_600_000), timeZone)
    );
  }
  const candidates: Date[] = [];
  for (const offset of offsets) {
    const instant = new Date(wallTime - offset);
    if (localDateTimeMatches(instant, date, time, timeZone)) {
      candidates.push(instant);
    }
  }
  let earliest: Date | null = null;
  for (const candidate of candidates) {
    if (!earliest || candidate.getTime() < earliest.getTime()) {
      earliest = candidate;
    }
  }
  return earliest ? [earliest] : [];
};

const resolveLocalInstant = (
  date: string,
  time: string,
  timeZone: string
): Date | null => {
  try {
    const exact = matchingInstants(date, time, timeZone);
    if (exact.length > 0) {
      // During a fall-back overlap, use the first occurrence of the chosen time.
      return exact[0] ?? null;
    }

    // A spring-forward gap has no matching instant. Move to the first valid
    // local minute after the requested time rather than silently sending early.
    const wallTime = Date.parse(`${date}T${time}:00.000Z`);
    for (let minutes = 1; minutes <= 180; minutes += 1) {
      const shifted = new Date(wallTime + minutes * 60_000);
      const shiftedDate = shifted.toISOString().slice(0, 10);
      const shiftedTime = shifted.toISOString().slice(11, 16);
      const candidates = matchingInstants(shiftedDate, shiftedTime, timeZone);
      if (candidates[0]) {
        return candidates[0];
      }
    }
    return null;
  } catch {
    return null;
  }
};

/** Calculate a deterministic, timezone-aware reminder time for a collection. */
export const calculateReminderSchedule = (
  collectionDate: string,
  preferences: NotificationPreferences,
  timeZone: string
): ReminderSchedule | null => {
  const parsedDate = parseDate(collectionDate);
  if (!preferences.enabled || !parsedDate) {
    return null;
  }

  const localDate = shiftDate(parsedDate, preferences.leadDays);
  const scheduledAt = resolveLocalInstant(
    localDate,
    preferences.localTime,
    timeZone
  );
  if (!scheduledAt) {
    return null;
  }
  const scheduledParts = partsFor(scheduledAt, timeZone);
  const scheduledLocalDate = `${String(scheduledParts.year).padStart(4, "0")}-${String(scheduledParts.month).padStart(2, "0")}-${String(scheduledParts.day).padStart(2, "0")}`;
  const scheduledLocalTime = `${String(scheduledParts.hour).padStart(2, "0")}:${String(scheduledParts.minute).padStart(2, "0")}`;

  return {
    collectionDate,
    localDate,
    localTime: preferences.localTime,
    timeZone,
    scheduledAt,
    scheduledLocalDate,
    scheduledLocalTime,
    notificationId: `${collectionDate}:${preferences.leadDays}:${preferences.localTime}:${timeZone}`,
  };
};

import { buildPushPayload, vapidHeaders } from "@block65/webcrypto-web-push";
import type { PushSubscription, VapidKeys } from "@block65/webcrypto-web-push";
import { z } from "zod";

import { calculateReminderSchedule } from "@/lib/notifications";
import type {
  NotificationPreferences,
  ReminderLeadDays,
} from "@/lib/notifications";

const isCalendarDate = (value: string): boolean => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const CollectionDate = z.iso.date().refine(isCalendarDate);
const PushSubscriptionSchema = z.strictObject({
  endpoint: z.url().max(2048),
  expirationTime: z.number().nullable().optional(),
  keys: z.strictObject({
    auth: z.string().check(z.regex(/^[A-Za-z0-9_-]{22}$/u)),
    p256dh: z.string().check(z.regex(/^[A-Za-z0-9_-]{87}$/u)),
  }),
});
const SubscriptionRequest = z.strictObject({
  subscription: PushSubscriptionSchema,
  schedule: z.strictObject({
    collectionDate: CollectionDate,
    followingDate: CollectionDate,
    collectionType: z.enum(["red", "yellow"]),
    redDate: CollectionDate,
    yellowDate: CollectionDate,
  }),
  preferences: z.strictObject({
    enabled: z.literal(true),
    leadDays: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(7)]),
    localTime: z.string().check(z.regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)),
  }),
  timeZone: z.string().min(1).max(128),
});

interface D1Result {
  readonly meta?: { readonly changes?: number };
}

interface D1Statement {
  readonly bind: (
    ...values: readonly (string | number | null)[]
  ) => D1Statement;
  readonly first: <T>() => Promise<T | null>;
  readonly run: () => Promise<D1Result>;
  readonly all: <T>() => Promise<{ readonly results: readonly T[] }>;
}

/** The minimum D1 surface required by reminder routes and the scheduled sender. */
export interface ReminderDatabase {
  /** Prepare a parameterized SQL statement. */
  readonly prepare: (query: string) => D1Statement;
}

/** Cloudflare bindings used by the reminder API and sender. */
export interface ReminderEnvironment {
  /** D1 database containing only subscription and schedule reminder data. */
  readonly REMINDERS?: ReminderDatabase;
  /** VAPID public key; set with the corresponding private key before enabling delivery. */
  readonly VAPID_PUBLIC_KEY?: string;
  /** VAPID private key, provisioned as a Cloudflare Worker secret. */
  readonly VAPID_PRIVATE_KEY?: string;
  /** VAPID subject, for example a mailto: contact address. */
  readonly VAPID_SUBJECT?: string;
}

interface ReminderRecord {
  readonly endpoint: string;
  readonly subscription_json: string;
  readonly collection_date: string;
  readonly following_date: string;
  readonly collection_type: "red" | "yellow";
  readonly lead_days: ReminderLeadDays;
  readonly local_time: string;
  readonly time_zone: string;
  readonly scheduled_at: string;
  readonly notification_id: string;
  readonly claim_until: string | null;
}

const PUSH_SERVICE_SUFFIXES = [
  ".push.apple.com",
  ".notify.windows.com",
  ".push.services.mozilla.com",
] as const;
const validPushOrigin = (endpoint: string): boolean => {
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.port || url.username || url.password) {
    return false;
  }
  const host = url.hostname.toLowerCase();
  const knownProvider =
    host === "fcm.googleapis.com" ||
    host === "updates.push.services.mozilla.com";
  return (
    knownProvider ||
    PUSH_SERVICE_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
};

const vapidKeys = (environment: ReminderEnvironment): VapidKeys | null => {
  const { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } = environment;
  if (!(VAPID_PRIVATE_KEY && VAPID_PUBLIC_KEY && VAPID_SUBJECT)) {
    return null;
  }
  return {
    privateKey: VAPID_PRIVATE_KEY,
    publicKey: VAPID_PUBLIC_KEY,
    subject: VAPID_SUBJECT,
  };
};

const jsonError = (status: number, error: string): Response =>
  Response.json({ error }, { status });
const DELIVERY_UNAVAILABLE = "Reminder delivery is not configured";

/** Respond with a public key only when the complete VAPID configuration exists. */
export const handleReminderPublicKey = (
  environment: ReminderEnvironment
): Response => {
  const keys = vapidKeys(environment);
  return keys && environment.REMINDERS
    ? Response.json({ publicKey: keys.publicKey })
    : jsonError(503, DELIVERY_UNAVAILABLE);
};

const parseTimeZone = (value: string): string | null => {
  try {
    return new Intl.DateTimeFormat("en-NZ", {
      timeZone: value,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
};

const HAMILTON_DATE_FORMATTER = new Intl.DateTimeFormat("en-NZ", {
  timeZone: "Pacific/Auckland",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const currentHamiltonDate = (now: Date): string => {
  const parts = new Map(
    HAMILTON_DATE_FORMATTER.formatToParts(now).map((part) => [
      part.type,
      part.value,
    ])
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
};

const daysBetween = (left: string, right: string): number =>
  (Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) /
  86_400_000;

const bearerEndpoint = (request: Request): string | null => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  const endpoint = authorization.slice("Bearer ".length);
  try {
    return validPushOrigin(endpoint) ? endpoint : null;
  } catch {
    return null;
  }
};

/** Check that a mutation request originates from this site's own origin. */
export const isSameOriginRequest = (request: Request): boolean => {
  const origin = request.headers.get("origin");
  return origin === null || origin === new URL(request.url).origin;
};

const MAX_SUBSCRIPTION_BODY_BYTES = 16 * 1024;

const readBoundedJson = async (
  request: Request
): Promise<z.infer<typeof SubscriptionRequest> | null> => {
  if (
    request.headers.get("content-type")?.split(";")[0]?.trim() !==
    "application/json"
  ) {
    return null;
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return null;
  }
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- SAFETY: A stream reader must be consumed sequentially so each chunk is counted before buffering.
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    byteLength += value.byteLength;
    if (byteLength > MAX_SUBSCRIPTION_BODY_BYTES) {
      // oxlint-disable-next-line no-await-in-loop -- SAFETY: Cancel the active reader before rejecting an oversized request body.
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const parsed = SubscriptionRequest.safeParse(
    JSON.parse(new TextDecoder().decode(bytes))
  );
  return parsed.success ? parsed.data : null;
};

const parseRequest = async (request: Request, now: Date) => {
  try {
    const parsed = await readBoundedJson(request);
    if (!parsed || !validPushOrigin(parsed.subscription.endpoint)) {
      return null;
    }
    const timeZone = parseTimeZone(parsed.timeZone);
    const {
      collectionDate,
      followingDate,
      collectionType,
      redDate,
      yellowDate,
    } = parsed.schedule;
    const dateForType = collectionType === "red" ? redDate : yellowDate;
    const expectedFollowingDate =
      collectionType === "red" ? yellowDate : redDate;
    const today = currentHamiltonDate(now);
    const invalidSnapshot =
      collectionDate !== dateForType ||
      followingDate !== expectedFollowingDate ||
      daysBetween(collectionDate, followingDate) < 1 ||
      daysBetween(collectionDate, followingDate) > 14;
    const invalidHorizon =
      collectionDate < today || daysBetween(today, collectionDate) > 21;
    if (!timeZone || invalidSnapshot || invalidHorizon) {
      return null;
    }
    return { ...parsed, timeZone };
  } catch {
    return null;
  }
};

const scheduleFor = (
  collectionDate: string,
  leadDays: ReminderLeadDays,
  localTime: string,
  timeZone: string
) =>
  calculateReminderSchedule(
    collectionDate,
    { enabled: true, leadDays, localTime } satisfies NotificationPreferences,
    timeZone
  );

const collectionTypeAfter = (type: "red" | "yellow"): "red" | "yellow" =>
  type === "red" ? "yellow" : "red";

const advanceDate = (date: string, days: number): string => {
  const instant = new Date(`${date}T00:00:00.000Z`);
  instant.setUTCDate(instant.getUTCDate() + days);
  return instant.toISOString().slice(0, 10);
};

/** Create/update an opt-in subscription without receiving or retaining an address. */
export const handleReminderSubscribe = async (
  request: Request,
  environment: ReminderEnvironment,
  now = new Date()
): Promise<Response> => {
  if (!isSameOriginRequest(request)) {
    return jsonError(403, "Cross-origin reminder requests are not allowed");
  }
  const database = environment.REMINDERS;
  if (!(database && vapidKeys(environment))) {
    return jsonError(503, DELIVERY_UNAVAILABLE);
  }
  const input = await parseRequest(request, now);
  if (!input) {
    return jsonError(400, "Invalid reminder subscription or schedule");
  }
  const keys = vapidKeys(environment);
  if (!keys) {
    return jsonError(503, DELIVERY_UNAVAILABLE);
  }
  const pushSubscription = {
    ...input.subscription,
    expirationTime: input.subscription.expirationTime ?? null,
  } satisfies PushSubscription;
  try {
    await vapidHeaders(pushSubscription, keys);
  } catch {
    return jsonError(503, "Web Push configuration is invalid");
  }
  const date = currentHamiltonDate(now);
  const deferWeeklyReminder =
    input.preferences.leadDays === 7 &&
    daysBetween(date, input.schedule.collectionDate) < 7;
  const collectionDate = deferWeeklyReminder
    ? input.schedule.followingDate
    : input.schedule.collectionDate;
  const followingDate = deferWeeklyReminder
    ? advanceDate(input.schedule.followingDate, 7)
    : input.schedule.followingDate;
  const collectionType = deferWeeklyReminder
    ? collectionTypeAfter(input.schedule.collectionType)
    : input.schedule.collectionType;
  if (collectionDate < date) {
    return jsonError(400, "Collection date is no longer current");
  }
  const reminder = scheduleFor(
    collectionDate,
    input.preferences.leadDays,
    input.preferences.localTime,
    input.timeZone
  );
  if (!reminder) {
    return jsonError(400, "Reminder time could not be resolved");
  }
  const nextDue = reminder.scheduledAt.getTime() <= now.getTime();
  const scheduledAt = nextDue
    ? now.toISOString()
    : reminder.scheduledAt.toISOString();
  const notificationId = `${collectionDate}:${input.preferences.leadDays}:${input.preferences.localTime}:${input.timeZone}`;
  try {
    await database
      .prepare(
        `INSERT INTO reminder_subscriptions
          (endpoint, subscription_json, collection_date, following_date, collection_type,
           lead_days, local_time, time_zone, scheduled_at, notification_id, claim_until,
            updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(endpoint) DO UPDATE SET
           subscription_json = excluded.subscription_json,
           collection_date = excluded.collection_date,
           following_date = excluded.following_date,
           collection_type = excluded.collection_type,
           lead_days = excluded.lead_days,
           local_time = excluded.local_time,
           time_zone = excluded.time_zone,
           scheduled_at = excluded.scheduled_at,
           notification_id = excluded.notification_id,
           claim_until = NULL,
           updated_at = excluded.updated_at`
      )
      .bind(
        input.subscription.endpoint,
        JSON.stringify(pushSubscription),
        collectionDate,
        followingDate,
        collectionType,
        input.preferences.leadDays,
        input.preferences.localTime,
        input.timeZone,
        scheduledAt,
        notificationId,
        now.toISOString()
      )
      .run();
    return Response.json({ saved: true });
  } catch {
    return jsonError(503, "Reminder subscription could not be saved");
  }
};

/** Remove the subscription identified by its unguessable push endpoint. */
export const handleReminderUnsubscribe = async (
  request: Request,
  environment: ReminderEnvironment
): Promise<Response> => {
  if (!isSameOriginRequest(request)) {
    return jsonError(403, "Cross-origin reminder requests are not allowed");
  }
  const endpoint = bearerEndpoint(request);
  if (!endpoint) {
    return jsonError(401, "A valid subscription credential is required");
  }
  if (!environment.REMINDERS) {
    return jsonError(503, "Reminder storage is unavailable");
  }
  try {
    await environment.REMINDERS.prepare(
      "DELETE FROM reminder_subscriptions WHERE endpoint = ?"
    )
      .bind(endpoint)
      .run();
    return Response.json({ removed: true });
  } catch {
    return jsonError(503, "Reminder subscription could not be removed");
  }
};

const SUBSCRIPTION_ENDPOINT_SQL =
  "DELETE FROM reminder_subscriptions WHERE endpoint = ?";
const CLEAR_CLAIM_SQL =
  "UPDATE reminder_subscriptions SET claim_until = NULL WHERE endpoint = ? AND notification_id = ?";

const removeSubscription = async (
  database: ReminderDatabase,
  endpoint: string
): Promise<void> => {
  await database.prepare(SUBSCRIPTION_ENDPOINT_SQL).bind(endpoint).run();
};

const releaseClaim = async (
  database: ReminderDatabase,
  record: ReminderRecord
): Promise<void> => {
  await database
    .prepare(CLEAR_CLAIM_SQL)
    .bind(record.endpoint, record.notification_id)
    .run();
};

const advanceSubscription = async (
  database: ReminderDatabase,
  record: ReminderRecord,
  now: Date
): Promise<void> => {
  const nextDate = record.following_date;
  const nextFollowingDate = advanceDate(nextDate, 7);
  const nextType = collectionTypeAfter(record.collection_type);
  const nextReminder = scheduleFor(
    nextDate,
    record.lead_days,
    record.local_time,
    record.time_zone
  );
  if (!nextReminder) {
    await removeSubscription(database, record.endpoint);
    return;
  }
  const nextNotificationId = `${nextDate}:${record.lead_days}:${record.local_time}:${record.time_zone}`;
  await database
    .prepare(
      `UPDATE reminder_subscriptions SET collection_date = ?, following_date = ?,
         collection_type = ?, scheduled_at = ?, notification_id = ?, claim_until = NULL,
         updated_at = ? WHERE endpoint = ? AND notification_id = ?`
    )
    .bind(
      nextDate,
      nextFollowingDate,
      nextType,
      nextReminder.scheduledAt.toISOString(),
      nextNotificationId,
      now.toISOString(),
      record.endpoint,
      record.notification_id
    )
    .run();
};

const sendDueRecord = async (
  database: ReminderDatabase,
  record: ReminderRecord,
  keys: VapidKeys,
  now: Date,
  claimedThrough: string,
  send: (
    subscription: PushSubscription,
    payload: string,
    keys: VapidKeys
  ) => Promise<Response>
): Promise<void> => {
  const nowIso = now.toISOString();
  const claim = await database
    .prepare(
      `UPDATE reminder_subscriptions SET claim_until = ?
       WHERE endpoint = ? AND notification_id = ? AND scheduled_at <= ?
         AND (claim_until IS NULL OR claim_until <= ?)`
    )
    .bind(
      claimedThrough,
      record.endpoint,
      record.notification_id,
      nowIso,
      nowIso
    )
    .run();
  if (claim.meta?.changes !== 1) {
    return;
  }

  let storedSubscription: unknown;
  try {
    storedSubscription = JSON.parse(record.subscription_json);
  } catch {
    await removeSubscription(database, record.endpoint);
    return;
  }
  const subscription = PushSubscriptionSchema.safeParse(storedSubscription);
  if (!subscription.success) {
    await removeSubscription(database, record.endpoint);
    return;
  }

  const daysText = record.lead_days === 1 ? "day" : "days";
  const reminderText =
    record.lead_days === 0
      ? "Bins are collected today."
      : `Bins are collected in ${record.lead_days} ${daysText}.`;
  const body = JSON.stringify({
    version: 1,
    notificationId: record.notification_id,
    collectionDate: record.collection_date,
    leadDays: record.lead_days,
    title: "Bin collection reminder",
    body: reminderText,
  });
  try {
    // SAFETY: PushSubscriptionSchema verified the endpoint, key strings, and optional expiration field before passing the value to the Web Push library.
    const response = await send(
      subscription.data as PushSubscription,
      body,
      keys
    );
    if (response.status === 404 || response.status === 410) {
      await removeSubscription(database, record.endpoint);
    } else if (response.ok) {
      await advanceSubscription(database, record, now);
    } else {
      await releaseClaim(database, record);
    }
  } catch {
    await releaseClaim(database, record);
  }
};

/** Send due notifications once, advance the two-week schedule snapshot, and remove expired subscriptions. */
export const sendDueReminders = async (
  environment: ReminderEnvironment,
  now = new Date(),
  send: (
    subscription: PushSubscription,
    payload: string,
    keys: VapidKeys
  ) => Promise<Response> = async (subscription, data, keys) => {
    const payload = await buildPushPayload(
      { data, options: { ttl: 60 * 60 * 24 } },
      subscription,
      keys
    );
    return fetch(subscription.endpoint, { ...payload, redirect: "manual" });
  }
): Promise<void> => {
  const database = environment.REMINDERS;
  const keys = vapidKeys(environment);
  if (!database) {
    return;
  }
  const nowIso = now.toISOString();
  await database
    .prepare("DELETE FROM reminder_subscriptions WHERE updated_at < ?")
    .bind(new Date(now.getTime() - 90 * 24 * 60 * 60_000).toISOString())
    .run();
  if (!keys) {
    return;
  }
  const claimedThrough = new Date(now.getTime() + 30 * 60_000).toISOString();
  const { results } = await database
    .prepare(
      `SELECT endpoint, subscription_json, collection_date, following_date, collection_type,
              lead_days, local_time, time_zone, scheduled_at, notification_id, claim_until
       FROM reminder_subscriptions
       WHERE scheduled_at <= ? AND (claim_until IS NULL OR claim_until <= ?)
       ORDER BY scheduled_at LIMIT 100`
    )
    .bind(nowIso, nowIso)
    .all<ReminderRecord>();

  await Promise.all(
    results.map((record) =>
      sendDueRecord(database, record, keys, now, claimedThrough, send)
    )
  );
};

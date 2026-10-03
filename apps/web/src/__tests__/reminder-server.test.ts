import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

import type { PushSubscription } from "@block65/webcrypto-web-push";
import { afterEach, describe, expect, test, vi } from "vitest";

import {
  handleReminderPublicKey,
  handleReminderSubscribe,
  handleReminderUnsubscribe,
  sendDueReminders,
} from "@/lib/reminder-server";
import type { ReminderDatabase } from "@/lib/reminder-server";

const migration = readFileSync(
  new URL("../../migrations/0001_reminder_subscriptions.sql", import.meta.url),
  "utf-8"
);

class SQLiteReminderDatabase implements ReminderDatabase {
  readonly sqlite = new DatabaseSync(":memory:");

  constructor() {
    this.sqlite.exec(migration);
  }

  prepare(query: string) {
    let values: readonly (string | number | null)[] = [];
    const statement = this.sqlite.prepare(query);
    const api = {
      bind: (...nextValues: readonly (string | number | null)[]) => {
        values = nextValues;
        return api;
      },
      first: <T>() => {
        // SAFETY: The SQL query and its caller specify the selected test row.
        const result = statement.get(...values) as T | undefined;
        return Promise.resolve(result ?? null);
      },
      run: () => {
        const result = statement.run(...values);
        return Promise.resolve({ meta: { changes: Number(result.changes) } });
      },
      all: <T>() => {
        // SAFETY: The SQL query and its caller specify the selected test rows.
        const results = statement.all(...values) as T[];
        return Promise.resolve({ results });
      },
    };
    return api;
  }

  close() {
    this.sqlite.close();
  }
}

const database = new SQLiteReminderDatabase();

const testKeyPair = await crypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"]
);
const testPrivateJwk = await crypto.subtle.exportKey(
  "jwk",
  testKeyPair.privateKey
);
if (!(testPrivateJwk.x && testPrivateJwk.y && testPrivateJwk.d)) {
  throw new Error("The generated Web Push test key is incomplete");
}
const testPublicKey = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(testPrivateJwk.x, "base64url"),
  Buffer.from(testPrivateJwk.y, "base64url"),
]).toString("base64url");
const clientKeyPair = await crypto.subtle.generateKey(
  { name: "ECDH", namedCurve: "P-256" },
  true,
  ["deriveBits"]
);
const clientPublicKey = Buffer.from(
  await crypto.subtle.exportKey("raw", clientKeyPair.publicKey)
).toString("base64url");
const clientAuthSecret = Buffer.from(
  crypto.getRandomValues(new Uint8Array(16))
).toString("base64url");

const environment = {
  REMINDERS: database,
  VAPID_PUBLIC_KEY: testPublicKey,
  VAPID_PRIVATE_KEY: testPrivateJwk.d,
  VAPID_SUBJECT: "mailto:contact@example.test",
};

const schedule = {
  collectionDate: "2026-10-05",
  followingDate: "2026-10-12",
  collectionType: "red",
  redDate: "2026-10-05",
  yellowDate: "2026-10-12",
} as const;

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/unguessable-subscription",
  expirationTime: null,
  keys: { auth: clientAuthSecret, p256dh: clientPublicKey },
};

interface SubscriptionOverrides {
  readonly subscription?: unknown;
  readonly schedule?: unknown;
  readonly preferences?: unknown;
  readonly timeZone?: unknown;
}

const subscriptionRequest = (overrides: SubscriptionOverrides = {}) =>
  new Request("https://example.test/api/reminders/subscription", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription,
      schedule,
      preferences: { enabled: true, leadDays: 1, localTime: "19:00" },
      timeZone: "Pacific/Auckland",
      ...overrides,
    }),
  });

describe("reminder delivery database behavior", () => {
  afterEach(() => {
    database.sqlite.exec("DELETE FROM reminder_subscriptions");
    vi.unstubAllGlobals();
  });

  describe("reminder subscription API", () => {
    test("keeps delivery disabled until the complete VAPID configuration is available", async () => {
      expect(handleReminderPublicKey({}).status).toBe(503);
      const response = await handleReminderSubscribe(
        subscriptionRequest(),
        { REMINDERS: database },
        new Date("2026-10-01T00:00:00.000Z")
      );
      expect(response.status).toBe(503);
    });

    test("stores only a validated subscription, schedule snapshot, timezone, and preferences", async () => {
      const response = await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toStrictEqual({ saved: true });
      // SAFETY: The query result uses the declared SQLite migration columns.
      const row = database.sqlite
        .prepare("SELECT * FROM reminder_subscriptions")
        .get() as {
        collection_date: string;
        following_date: string;
        local_time: string;
        time_zone: string;
        subscription_json: string;
      };
      expect(row).toMatchObject({
        collection_date: schedule.collectionDate,
        following_date: schedule.followingDate,
        local_time: "19:00",
        time_zone: "Pacific/Auckland",
      });
      expect(JSON.stringify(row)).not.toContain("address");
      expect(JSON.parse(String(row.subscription_json))).toStrictEqual(
        subscription
      );
    });

    test("rejects unsafe push endpoints and mismatched or malformed schedule data", async () => {
      const unsafe = await handleReminderSubscribe(
        subscriptionRequest({
          subscription: {
            ...subscription,
            endpoint: "https://127.0.0.1/private",
          },
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      const mismatchedDate = await handleReminderSubscribe(
        subscriptionRequest({
          schedule: { ...schedule, collectionDate: "2026-10-06" },
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(unsafe.status).toBe(400);
      expect(mismatchedDate.status).toBe(400);
    });

    test("bounds subscription payload reads before parsing or storage", async () => {
      const response = await handleReminderSubscribe(
        new Request("https://example.test/api/reminders/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: " ".repeat(16 * 1024 + 1),
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(response.status).toBe(400);
      expect(
        database.sqlite
          .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
          .get()
      ).toMatchObject({ count: 0 });
    });

    test("rejects cross-origin writes before touching the subscription store", async () => {
      const response = await handleReminderSubscribe(
        new Request("https://example.test/api/reminders/subscription", {
          method: "POST",
          headers: { Origin: "https://attacker.test" },
          body: "{}",
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(response.status).toBe(403);
      expect(
        database.sqlite
          .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
          .get()
      ).toMatchObject({ count: 0 });
    });

    test("updates the saved schedule for a changed collection date without retaining an address", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      const changed = await handleReminderSubscribe(
        subscriptionRequest({
          schedule: {
            collectionDate: "2026-10-12",
            followingDate: "2026-10-19",
            collectionType: "yellow",
            redDate: "2026-10-19",
            yellowDate: "2026-10-12",
          },
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(changed.status).toBe(200);
      // SAFETY: The query result uses the declared SQLite migration columns.
      const row = database.sqlite
        .prepare(
          "SELECT collection_date, following_date, collection_type FROM reminder_subscriptions"
        )
        .get() as {
        collection_date: string;
        following_date: string;
        collection_type: string;
      };
      expect(row).toMatchObject({
        collection_date: "2026-10-12",
        following_date: "2026-10-19",
        collection_type: "yellow",
      });
    });

    test("schedules a seven-day reminder against the following collection when the next is too close", async () => {
      const response = await handleReminderSubscribe(
        subscriptionRequest({
          preferences: { enabled: true, leadDays: 7, localTime: "19:00" },
        }),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      expect(response.status).toBe(200);
      expect(
        database.sqlite
          .prepare(
            "SELECT collection_date, following_date, collection_type, scheduled_at, notification_id FROM reminder_subscriptions"
          )
          .get()
      ).toMatchObject({
        collection_date: "2026-10-12",
        following_date: "2026-10-19",
        collection_type: "yellow",
        scheduled_at: "2026-10-05T06:00:00.000Z",
        notification_id: "2026-10-12:7:19:00:Pacific/Auckland",
      });
    });

    test("requires the unguessable subscription endpoint and removes its record", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      const unauthorized = await handleReminderUnsubscribe(
        new Request("https://example.test/api/reminders/subscription", {
          method: "DELETE",
        }),
        environment
      );
      const removed = await handleReminderUnsubscribe(
        new Request("https://example.test/api/reminders/subscription", {
          method: "DELETE",
          headers: { Authorization: `Bearer ${subscription.endpoint}` },
        }),
        environment
      );

      expect(unauthorized.status).toBe(401);
      expect(removed.status).toBe(200);
      expect(
        database.sqlite
          .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
          .get()
      ).toMatchObject({ count: 0 });
    });
  });

  test("does not store a subscription when VAPID signing configuration is invalid", async () => {
    const response = await handleReminderSubscribe(
      subscriptionRequest(),
      { ...environment, VAPID_PRIVATE_KEY: "not-a-key" },
      new Date("2026-10-01T00:00:00.000Z")
    );

    expect(response.status).toBe(503);
    expect(
      database.sqlite
        .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
        .get()
    ).toMatchObject({ count: 0 });
  });

  describe("scheduled reminder delivery", () => {
    test("encrypts the due payload and sends it only to the push service endpoint", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response(null, { status: 201 }));
      vi.stubGlobal("fetch", fetcher);

      await sendDueReminders(environment, new Date("2026-10-04T08:00:00.000Z"));

      expect(fetcher).toHaveBeenCalledOnce();
      const [call] = fetcher.mock.calls;
      if (!call) {
        throw new Error("Expected a push-service fetch call");
      }
      const [url, requestInit] = call;
      expect(url).toBe(subscription.endpoint);
      expect(requestInit).toMatchObject({
        method: "post",
        redirect: "manual",
        headers: {
          "content-encoding": "aes128gcm",
          "content-type": "application/octet-stream",
          ttl: "86400",
        },
      });
      const body = requestInit?.body;
      if (!(body instanceof Uint8Array)) {
        throw new Error("Expected an encrypted binary push payload");
      }
      expect(body.byteLength).toBe(4096);
    });

    test("sends one due push, advances the schedule, and suppresses duplicate cron runs", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      let sends = 0;
      let sentPayload = "";
      const send = (_subscription: PushSubscription, payload: string) => {
        sends += 1;
        sentPayload = payload;
        return Promise.resolve(new Response(null, { status: 201 }));
      };
      const now = new Date("2026-10-04T08:00:00.000Z");

      await sendDueReminders(environment, now, send);
      await sendDueReminders(environment, now, send);

      expect(sends).toBe(1);
      expect(JSON.parse(sentPayload)).toMatchObject({
        notificationId: "2026-10-05:1:19:00:Pacific/Auckland",
      });
      expect(
        database.sqlite
          .prepare(
            "SELECT collection_date, following_date, collection_type FROM reminder_subscriptions"
          )
          .get()
      ).toMatchObject({
        collection_date: "2026-10-12",
        following_date: "2026-10-19",
        collection_type: "yellow",
      });
    });

    test("claims a due subscription before an overlapping cron can send it", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      const sendGate = Promise.withResolvers<Response>();
      const sendStarted = Promise.withResolvers<undefined>();
      let sends = 0;
      const send = () => {
        sends += 1;
        sendStarted.resolve();
        return sendGate.promise;
      };
      const now = new Date("2026-10-04T08:00:00.000Z");

      const firstRun = sendDueReminders(environment, now, send);
      await sendStarted;
      await sendDueReminders(environment, now, send);

      expect(sends).toBe(1);
      sendGate.resolve(new Response(null, { status: 201 }));
      await firstRun;
    });

    test.each([404, 410])(
      "deletes subscriptions invalidated by push status %s",
      async (status) => {
        await handleReminderSubscribe(
          subscriptionRequest(),
          environment,
          new Date("2026-10-01T00:00:00.000Z")
        );
        await sendDueReminders(
          environment,
          new Date("2026-10-04T08:00:00.000Z"),
          () => Promise.resolve(new Response(null, { status }))
        );

        expect(
          database.sqlite
            .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
            .get()
        ).toMatchObject({ count: 0 });
      }
    );

    test("retries a transient push failure on the next cron instead of suppressing delivery", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );
      let attempts = 0;
      const send = () => {
        attempts += 1;
        return Promise.resolve(
          new Response(null, { status: attempts === 1 ? 503 : 201 })
        );
      };
      const now = new Date("2026-10-04T08:00:00.000Z");
      await sendDueReminders(environment, now, send);
      await sendDueReminders(environment, now, send);

      expect(attempts).toBe(2);
      expect(
        database.sqlite
          .prepare("SELECT collection_date FROM reminder_subscriptions")
          .get()
      ).toMatchObject({ collection_date: "2026-10-12" });
    });

    test("prunes inactive records after 90 days even when VAPID delivery is disabled", async () => {
      await handleReminderSubscribe(
        subscriptionRequest(),
        environment,
        new Date("2026-10-01T00:00:00.000Z")
      );

      await sendDueReminders(
        { REMINDERS: database },
        new Date("2027-01-05T00:00:00.000Z")
      );

      expect(
        database.sqlite
          .prepare("SELECT count(*) AS count FROM reminder_subscriptions")
          .get()
      ).toMatchObject({ count: 0 });
    });
  });
});

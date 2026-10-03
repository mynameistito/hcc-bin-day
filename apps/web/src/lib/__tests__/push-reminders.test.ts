import { afterEach, describe, expect, test, vi } from "vitest";

import {
  createPushMutationQueue,
  decodeApplicationServerKey,
  deletePushReminder,
  forgetPushEndpoint,
  PUSH_ENDPOINT_STORAGE_KEY,
  readStoredPushEndpoint,
  rememberPushEndpoint,
  savePushReminder,
} from "@/lib/push-reminders";

const schedule = {
  address: "12 Grey Street",
  collectionDayName: "Monday",
  nextCollection: {
    bins: ["red bin"],
    date: "2026-10-05",
    type: "red" as const,
  },
  redBin: "2026-10-05",
  yellowBin: "2026-10-12",
};

const preferences = { enabled: true, leadDays: 1 as const, localTime: "19:00" };

describe("push reminder client requests", () => {
  afterEach(() => vi.unstubAllGlobals());

  test("retains only the opaque endpoint locally until server deletion", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    const endpoint = "https://fcm.googleapis.com/fcm/send/secret";

    expect(rememberPushEndpoint(endpoint)).toBeTruthy();
    expect(values).toStrictEqual(
      new Map([[PUSH_ENDPOINT_STORAGE_KEY, endpoint]])
    );
    expect(readStoredPushEndpoint()).toBe(endpoint);
    expect(forgetPushEndpoint()).toBeTruthy();
    expect(readStoredPushEndpoint()).toBeNull();
  });

  test("handles blocked browser storage without throwing", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        removeItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    });

    expect(readStoredPushEndpoint()).toBeNull();
    expect(rememberPushEndpoint("endpoint")).toBeFalsy();
    expect(forgetPushEndpoint()).toBeFalsy();
  });

  test("serializes server mutations in submission order", async () => {
    const enqueue = createPushMutationQueue();
    const calls: string[] = [];
    const firstGate = Promise.withResolvers<undefined>();
    const first = enqueue(async () => {
      calls.push("first-start");
      await firstGate.promise;
      calls.push("first-finish");
    });
    const second = enqueue(() => {
      calls.push("second");
      return Promise.resolve();
    });

    await Promise.resolve();
    expect(calls).toStrictEqual(["first-start"]);
    firstGate.resolve();
    await Promise.all([first, second]);

    expect(calls).toStrictEqual(["first-start", "first-finish", "second"]);
  });

  test("decodes a base64url VAPID application server key", () => {
    expect([...decodeApplicationServerKey("AQID-_8")]).toStrictEqual([
      1, 2, 3, 251, 255,
    ]);
  });

  test("sends only the subscription and minimum schedule/preferences to storage", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ saved: true }));
    const result = await savePushReminder(
      {
        endpoint: "https://fcm.googleapis.com/fcm/send/secret",
        expirationTime: null,
        keys: { auth: "a".repeat(22), p256dh: "p".repeat(87) },
      },
      schedule,
      preferences,
      "Pacific/Auckland",
      fetcher
    );

    expect(result).toBeTruthy();
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body).toStrictEqual({
      subscription: {
        endpoint: "https://fcm.googleapis.com/fcm/send/secret",
        expirationTime: null,
        keys: { auth: "a".repeat(22), p256dh: "p".repeat(87) },
      },
      schedule: {
        collectionDate: "2026-10-05",
        followingDate: "2026-10-12",
        collectionType: "red",
        redDate: "2026-10-05",
        yellowDate: "2026-10-12",
      },
      preferences,
      timeZone: "Pacific/Auckland",
    });
    expect(JSON.stringify(body)).not.toContain("Grey Street");
  });

  test("sends unsubscribe authorization with the endpoint capability", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ removed: true }));
    const result = await deletePushReminder(
      "https://fcm.googleapis.com/fcm/send/secret",
      fetcher
    );

    expect(result).toBeTruthy();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: "DELETE",
      headers: {
        Authorization: "Bearer https://fcm.googleapis.com/fcm/send/secret",
      },
    });
  });

  test("returns failure rather than claiming a failed persistence operation succeeded", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 503 }));
    await expect(
      savePushReminder(
        {
          endpoint: "https://fcm.googleapis.com/fcm/send/secret",
          expirationTime: null,
          keys: { auth: "a".repeat(22), p256dh: "p".repeat(87) },
        },
        schedule,
        preferences,
        "Pacific/Auckland",
        fetcher
      )
    ).resolves.toBeFalsy();
  });
});

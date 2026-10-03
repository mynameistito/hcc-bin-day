import { afterEach, describe, expect, test, vi } from "vitest";

import worker, { handleLookup } from "@/worker";

const addressResult = [{ Collection_Address: "12 Grey Street" }];
const collectionResult = [
  {
    Address: "12 Grey Street",
    CollectionDay: 1,
    CollectionWeek: 1,
    RedBin: "2026-09-21T00:00:00",
    YellowBin: "2026-09-28T00:00:00",
  },
];

describe("lookup endpoint input validation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  test("provides an uncached health endpoint for connectivity checks", async () => {
    const assets = {
      fetch: vi.fn<(request: Request) => Promise<Response>>(),
    };
    const response = await worker.fetch(
      new Request("https://example.test/api/health", { method: "HEAD" }),
      { ASSETS: assets }
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(assets.fetch).not.toHaveBeenCalled();
  });

  test("rejects addresses over the length limit before calling the Council API", async () => {
    const request = new Request(
      `https://example.test/api/lookup?address=${"x".repeat(161)}`
    );

    const response = await handleLookup(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toStrictEqual({
      error: "Address must be 160 characters or fewer",
    });
  });

  test("rejects blank addresses", async () => {
    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=%20%20")
    );

    expect(response.status).toBe(400);
  });

  test("returns not found without fetching a schedule", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=unknown")
    );

    await expect(response.json()).resolves.toStrictEqual({
      found: false,
      matches: [],
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  test("bounds Council fetches with a 10-second abort signal", async () => {
    const controller = new AbortController();
    const timeout = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValue(Response.json([]));
    vi.stubGlobal("fetch", fetch);

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=unknown")
    );

    expect(response.status).toBe(200);
    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(fetch.mock.calls[0]?.[1]?.signal).toBe(controller.signal);
  });

  test("filters the Council no-address placeholder from suggestions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(
          Response.json([
            { Collection_Address: "No address found" },
            { Collection_Address: "14B Mountbatten Place" },
          ])
        )
    );

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=unknown")
    );

    await expect(response.json()).resolves.toStrictEqual({
      found: false,
      matches: ["14B Mountbatten Place"],
    });
  });

  test("maps a Council request timeout to 502", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof globalThis.fetch>()
        .mockRejectedValue(
          new DOMException("The operation was aborted", "TimeoutError")
        )
    );
    const response = await worker.fetch(
      new Request("https://example.test/api/lookup?address=unknown"),
      { ASSETS: { fetch: vi.fn<(request: Request) => Promise<Response>>() } }
    );

    expect(response.status).toBe(502);
  });

  test("retries an expanded address query and returns a schedule", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json(addressResult))
      .mockResolvedValueOnce(Response.json(collectionResult));
    vi.stubGlobal("fetch", fetch);

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=12%20grey%20st")
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      found: true,
      matchedAddress: "12 Grey Street",
      schedule: {
        collectionDayName: "Monday",
        nextCollection: { type: "red" },
      },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(String(fetch.mock.calls[1]?.[0])).toContain("12+grey+street");
  });

  test("returns not found when the matched address has no schedule", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(addressResult))
        .mockResolvedValueOnce(Response.json([]))
    );

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=12%20grey%20street")
    );

    await expect(response.json()).resolves.toStrictEqual({
      found: false,
      matches: ["12 Grey Street"],
    });
  });

  test("treats council 404 responses as empty result sets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    const response = await handleLookup(
      new Request("https://example.test/api/lookup?address=unknown")
    );

    await expect(response.json()).resolves.toStrictEqual({
      found: false,
      matches: [],
    });
  });

  test("maps API, decoding, and domain errors to 502 in the worker entry point", async () => {
    const assets = {
      fetch: vi
        .fn<(request: Request) => Promise<Response>>()
        .mockResolvedValue(new Response("asset")),
    };
    const request = new Request(
      "https://example.test/api/lookup?address=12%20grey%20street"
    );

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
    );
    const failed = await worker.fetch(request, { ASSETS: assets });
    expect(failed.status).toBe(502);

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json([{ invalid: true }]))
    );
    const invalidJsonResponse = await worker.fetch(request, { ASSETS: assets });
    expect(invalidJsonResponse.status).toBe(502);

    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json(addressResult))
        .mockResolvedValueOnce(
          Response.json([{ ...collectionResult[0], CollectionDay: 8 }])
        )
    );
    const invalidScheduleResponse = await worker.fetch(request, {
      ASSETS: assets,
    });
    expect(invalidScheduleResponse.status).toBe(502);
  });

  test("rate limits reminder mutations by request IP and fails closed on limiter errors", async () => {
    const assets = {
      fetch: vi.fn<(request: Request) => Promise<Response>>(),
    };
    const rateLimit = vi
      .fn<
        (options: {
          readonly key: string;
        }) => Promise<{ readonly success: boolean }>
      >()
      .mockResolvedValueOnce({ success: false })
      .mockRejectedValueOnce(new Error("limiter unavailable"));
    const environment = {
      ASSETS: assets,
      REMINDER_LIMIT: { limit: rateLimit },
    };
    const request = new Request(
      "https://example.test/api/reminders/subscription",
      {
        method: "DELETE",
        headers: { "CF-Connecting-IP": "203.0.113.4" },
      }
    );
    const crossOrigin = await worker.fetch(
      new Request(request, {
        headers: {
          "CF-Connecting-IP": "203.0.113.4",
          Origin: "https://attacker.test",
        },
      }),
      environment
    );

    const limited = await worker.fetch(request, environment);
    const unavailable = await worker.fetch(request, environment);

    expect({
      statuses: [crossOrigin.status, limited.status, unavailable.status],
      retryAfter: limited.headers.get("Retry-After"),
      rateLimitKeys: rateLimit.mock.calls.map(([options]) => options.key),
      assetFetches: assets.fetch.mock.calls.length,
    }).toStrictEqual({
      statuses: [403, 429, 503],
      retryAfter: "60",
      rateLimitKeys: ["203.0.113.4", "203.0.113.4"],
      assetFetches: 0,
    });
  });

  test("delegates non-lookup requests to the asset binding", async () => {
    const response = new Response("asset");
    const assets = {
      fetch: vi
        .fn<(request: Request) => Promise<Response>>()
        .mockResolvedValue(response),
    };
    const request = new Request("https://example.test/anything");

    await expect(worker.fetch(request, { ASSETS: assets })).resolves.toBe(
      response
    );
    expect(assets.fetch).toHaveBeenCalledWith(request);
  });
});

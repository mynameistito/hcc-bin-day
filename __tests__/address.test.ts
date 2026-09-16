import { describe, expect, test } from "bun:test";

// oxlint-disable-next-line sonarjs/no-wildcard-import
import * as Effect from "effect/Effect";
// oxlint-disable-next-line sonarjs/no-wildcard-import
import * as Layer from "effect/Layer";

import { resolveAddressQuery } from "../src/address";
import { HccApi } from "../src/hcc-api";

const apiLayer = Layer.succeed(HccApi, {
  getCollectionSchedule: () =>
    Effect.succeed({
      address: "14B Mountbatten Place",
      collectionDay: 1,
      collectionDayName: "Monday",
      collectionWeek: 1,
      nextCollection: {
        bins: ["red bin", "food scraps bin"],
        date: "2026-09-21",
        type: "red" as const,
      },
      redBin: "2026-09-21",
      upcomingWeek: "red" as const,
      yellowBin: "2026-09-28",
    }),
  searchAddresses: (query) =>
    Effect.succeed(
      query === "14b mountbatten pl" ? ["14B Mountbatten Place"] : []
    ),
});

describe("address resolution", () => {
  test("resolves an exact normalized address through the HccApi seam", async () => {
    const result = await Effect.runPromise(
      resolveAddressQuery("14b mountbatten pl").pipe(Effect.provide(apiLayer))
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.matchedAddress).toBe("14B Mountbatten Place");
    }
  });

  test("returns suggestions when no exact match exists", async () => {
    const result = await Effect.runPromise(
      resolveAddressQuery("unknown road").pipe(Effect.provide(apiLayer))
    );

    expect(result).toEqual({ matches: [], ok: false });
  });
});

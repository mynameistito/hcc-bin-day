// oxlint-disable-next-line sonarjs/no-wildcard-import
import * as Effect from "effect/Effect";

import { HccApi } from "@/hcc-api";
import type { HccApiError } from "@/hcc-api";
import { expandAddressQuery, pickMatchingAddress } from "@/normalize-address";
import type { CollectionSchedule } from "@/schedule";

const NO_ADDRESS_FOUND = "No address found";

const filterMatches = (matches: readonly string[]): readonly string[] =>
  matches.filter((match) => match !== NO_ADDRESS_FOUND);

export type AddressResolution =
  | {
      ok: true;
      matchedAddress: string;
      schedule: CollectionSchedule;
    }
  | {
      ok: false;
      matches: readonly string[];
    };

export const resolveAddressQuery = (
  query: string
): Effect.Effect<AddressResolution, HccApiError, HccApi> => {
  const expandedQuery = expandAddressQuery(query);
  return Effect.gen(function* resolveAddress() {
    const api = yield* HccApi;
    let matches = filterMatches(yield* api.searchAddresses(query));

    if (matches.length === 0 && expandedQuery !== query) {
      matches = filterMatches(yield* api.searchAddresses(expandedQuery));
    }

    if (matches.length === 0) {
      return { matches: [], ok: false };
    }

    const matchedAddress = pickMatchingAddress(query, matches);

    if (!matchedAddress) {
      return { matches, ok: false };
    }

    const schedule = yield* api.getCollectionSchedule(matchedAddress);

    if (!schedule) {
      return { matches, ok: false };
    }

    return { matchedAddress, ok: true, schedule };
  });
};

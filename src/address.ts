import { getCollectionSchedule, searchAddresses } from "./hamilton-api";
import { expandAddressQuery, pickMatchingAddress } from "./normalize-address";
import type { CollectionSchedule } from "./schedule";

const NO_ADDRESS_FOUND = "No address found";

const filterMatches = (matches: string[]): string[] =>
  matches.filter((match) => match !== NO_ADDRESS_FOUND);

export type AddressResolution =
  | {
      ok: true;
      matchedAddress: string;
      schedule: CollectionSchedule;
    }
  | {
      ok: false;
      matches: string[];
    };

export const resolveAddressQuery = async (
  query: string
): Promise<AddressResolution> => {
  const expandedQuery = expandAddressQuery(query);
  let matches = filterMatches(await searchAddresses(query));

  if (matches.length === 0 && expandedQuery !== query) {
    matches = filterMatches(await searchAddresses(expandedQuery));
  }

  if (matches.length === 0) {
    return { matches: [], ok: false };
  }

  const matchedAddress = pickMatchingAddress(query, matches);

  if (!matchedAddress) {
    return { matches, ok: false };
  }

  const schedule = await getCollectionSchedule(matchedAddress);

  if (!schedule) {
    return { matches, ok: false };
  }

  return {
    matchedAddress,
    ok: true,
    schedule,
  };
};

import type {
  AddressLookupResult,
  CollectionDatesResult,
  CollectionSchedule,
} from "./types";

const API_BASE_URL = "https://api2.hcc.govt.nz";

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      return [] as T;
    }

    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`
    );
  }

  return (await response.json()) as T;
};

export const searchAddresses = async (
  searchString: string
): Promise<string[]> => {
  const url = new URL("/FightTheLandFill/get_Addresses", API_BASE_URL);
  url.searchParams.set("search_string", searchString);

  const results = await fetchJson<AddressLookupResult[]>(url.toString());
  return results.map((result) => result.Collection_Address);
};

export const getCollectionSchedule = async (
  address: string
): Promise<CollectionSchedule | null> => {
  const url = new URL("/FightTheLandFill/get_Collection_Dates", API_BASE_URL);
  url.searchParams.set("address_string", address);

  const results = await fetchJson<CollectionDatesResult[]>(url.toString());
  const [first] = results;

  if (!first) {
    return null;
  }

  return {
    address: first.Address,
    collectionDay: first.CollectionDay,
    collectionWeek: first.CollectionWeek,
    redBin: new Date(first.RedBin),
    yellowBin: new Date(first.YellowBin),
  };
};

export const getScheduleForAddress = async (
  addressQuery: string
): Promise<CollectionSchedule | null> => {
  const matches = await searchAddresses(addressQuery);
  const exactMatch = matches.find(
    (match) => match.toLowerCase() === addressQuery.trim().toLowerCase()
  );

  if (!exactMatch) {
    return null;
  }

  return getCollectionSchedule(exactMatch);
};

import { decodeUnknownSync } from "effect/Schema";
import type { Schema } from "effect/Schema";

import {
  AddressLookupResultsSchema,
  CollectionDatesResultsSchema,
} from "../../../packages/cli/src/council-schema";
import {
  expandAddressQuery,
  pickMatchingAddress,
} from "../../../packages/cli/src/normalize-address";
import { buildSchedule } from "../../../packages/cli/src/schedule";
import { isLookupAddressValid } from "./lib/address";

interface WorkerEnvironment {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
}

const councilApi = "https://api2.hcc.govt.nz";

const getJson = async <A, I>(
  url: URL,
  schema: Schema<A, I, never>
): Promise<A> => {
  const response = await fetch(url);
  if (response.status === 404) {
    return decodeUnknownSync(schema)([]);
  }
  if (!response.ok) {
    throw new Error(`Council API returned ${response.status}`);
  }
  return decodeUnknownSync(schema)(await response.json());
};

export const handleLookup = async (request: Request): Promise<Response> => {
  const rawAddress = new URL(request.url).searchParams.get("address");
  if (!rawAddress?.trim()) {
    return Response.json({ error: "An address is required" }, { status: 400 });
  }
  if (!isLookupAddressValid(rawAddress)) {
    return Response.json(
      { error: "Address must be 160 characters or fewer" },
      { status: 413 }
    );
  }
  const address = rawAddress.trim();

  const addressUrl = new URL("/FightTheLandFill/get_Addresses", councilApi);
  addressUrl.searchParams.set("search_string", address);
  let addresses = await getJson(addressUrl, AddressLookupResultsSchema);
  const expanded = expandAddressQuery(address);
  if (addresses.length === 0 && expanded !== address) {
    addressUrl.searchParams.set("search_string", expanded);
    addresses = await getJson(addressUrl, AddressLookupResultsSchema);
  }

  const matches = addresses.map(({ Collection_Address }) => Collection_Address);
  const matchedAddress = pickMatchingAddress(address, matches);
  if (!matchedAddress) {
    return Response.json({ found: false, matches });
  }

  const scheduleUrl = new URL(
    "/FightTheLandFill/get_Collection_Dates",
    councilApi
  );
  scheduleUrl.searchParams.set("address_string", matchedAddress);
  const [result] = await getJson(scheduleUrl, CollectionDatesResultsSchema);
  if (!result) {
    return Response.json({ found: false, matches });
  }
  return Response.json({
    found: true,
    matchedAddress,
    schedule: buildSchedule(result),
  });
};

export default {
  async fetch(
    request: Request,
    environment: WorkerEnvironment
  ): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/lookup" && request.method === "GET") {
      try {
        return await handleLookup(request);
      } catch {
        return Response.json(
          { error: "Council service unavailable" },
          { status: 502 }
        );
      }
    }
    return environment.ASSETS.fetch(request);
  },
};

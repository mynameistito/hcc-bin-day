import {
  Array as SchemaArray,
  decodeUnknownSync,
  Number as SchemaNumber,
  String as SchemaString,
  Struct,
} from "effect/Schema";
import type { Schema } from "effect/Schema";

import {
  expandAddressQuery,
  pickMatchingAddress,
} from "../../../packages/cli/src/normalize-address";
import { buildSchedule } from "../../../packages/cli/src/schedule";

interface WorkerEnvironment {
  readonly ASSETS: { readonly fetch: (request: Request) => Promise<Response> };
}

const AddressResultsSchema = SchemaArray(
  Struct({ Collection_Address: SchemaString })
);
const CollectionResultsSchema = SchemaArray(
  Struct({
    Address: SchemaString,
    CollectionDay: SchemaNumber,
    CollectionWeek: SchemaNumber,
    RedBin: SchemaString,
    YellowBin: SchemaString,
  })
);
const councilApi = "https://api2.hcc.govt.nz";

const getJson = async <A, I>(
  url: URL,
  schema: Schema<A, I, never>
): Promise<A> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Council API returned ${response.status}`);
  }
  return decodeUnknownSync(schema)(await response.json());
};

export const handleLookup = async (request: Request): Promise<Response> => {
  const address = new URL(request.url).searchParams.get("address")?.trim();
  if (!address) {
    return Response.json({ error: "An address is required" }, { status: 400 });
  }

  const addressUrl = new URL("/FightTheLandFill/get_Addresses", councilApi);
  addressUrl.searchParams.set("search_string", address);
  let addresses = await getJson(addressUrl, AddressResultsSchema);
  const expanded = expandAddressQuery(address);
  if (addresses.length === 0 && expanded !== address) {
    addressUrl.searchParams.set("search_string", expanded);
    addresses = await getJson(addressUrl, AddressResultsSchema);
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
  const [result] = await getJson(scheduleUrl, CollectionResultsSchema);
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

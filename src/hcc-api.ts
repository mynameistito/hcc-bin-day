/* oxlint-disable max-classes-per-file, sonarjs/no-wildcard-import, no-nested-ternary, no-nested-conditional */
import { HttpClient } from "@effect/platform";
import * as NodeHttpClient from "@effect/platform-node/NodeHttpClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { buildSchedule } from "@/schedule";
import type { CollectionSchedule } from "@/schedule";

/** An address returned by the council address search endpoint. */
const AddressLookupResult = Schema.Struct({
  Collection_Address: Schema.String,
});

/** A collection record returned by the council endpoint. */
const CollectionDatesResult = Schema.Struct({
  Address: Schema.String,
  CollectionDay: Schema.Number.pipe(Schema.int(), Schema.between(1, 7)),
  CollectionWeek: Schema.Number.pipe(Schema.int()),
  RedBin: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}/u)),
  YellowBin: Schema.String.pipe(Schema.pattern(/^\d{4}-\d{2}-\d{2}/u)),
});

const AddressLookupResults = Schema.Array(AddressLookupResult);
const CollectionDatesResults = Schema.Array(CollectionDatesResult);
type AddressLookup = Schema.Schema.Type<typeof AddressLookupResult>;
type CollectionDates = Schema.Schema.Type<typeof CollectionDatesResult>;

/** Errors raised while communicating with or decoding the council API. */
// oxlint-disable-next-line unicorn/throw-new-error -- Schema.TaggedError is a class factory, not a constructor.
export class HccApiError extends Schema.TaggedError<HccApiError>("HccApiError")(
  "HccApiError",
  {
    cause: Schema.Unknown,
    operation: Schema.Literal("searchAddresses", "getCollectionSchedule"),
    reason: Schema.Literal("transport", "http", "decode", "domain"),
    status: Schema.optional(Schema.Number),
  }
) {}

/** The application-owned council API capability. */
export class HccApi extends Context.Tag("hcc-api/HccApi")<
  HccApi,
  HccApiService
>() {}

/** Operations exposed by the council API service. */
export interface HccApiService {
  readonly searchAddresses: (
    searchString: string
  ) => Effect.Effect<readonly string[], HccApiError>;
  readonly getCollectionSchedule: (
    address: string
  ) => Effect.Effect<CollectionSchedule | null, HccApiError>;
}

/** Construct the council API service using the Effect HTTP client. */
const make: Effect.Effect<HccApiService, never, HttpClient.HttpClient> =
  Effect.gen(function* make() {
    const client = yield* HttpClient.HttpClient;

    const searchAddresses = (
      searchString: string
    ): Effect.Effect<readonly string[], HccApiError> => {
      const url = new URL(
        "/FightTheLandFill/get_Addresses",
        "https://api2.hcc.govt.nz"
      );
      url.searchParams.set("search_string", searchString);

      return client.get(url).pipe(
        // oxlint-disable-next-line no-nested-ternary, sonarjs/no-nested-conditional
        Effect.flatMap((response) =>
          // oxlint-disable-next-line no-nested-ternary, sonarjs/no-nested-conditional
          response.status === 404
            ? Effect.succeed<readonly AddressLookup[]>([])
            : // oxlint-disable-next-line sonarjs/no-nested-conditional
              response.status >= 200 && response.status < 300
              ? response.json.pipe(
                  Effect.flatMap((body) =>
                    Effect.try({
                      catch: (cause) =>
                        new HccApiError({
                          cause,
                          operation: "searchAddresses",
                          reason: "decode",
                        }),
                      try: () =>
                        Schema.decodeUnknownSync(AddressLookupResults)(body),
                    })
                  )
                )
              : Effect.fail(
                  new HccApiError({
                    cause: response,
                    operation: "searchAddresses",
                    reason: "http",
                    status: response.status,
                  })
                )
        ),
        Effect.map((results) =>
          results.map((result) => result.Collection_Address)
        ),
        Effect.mapError((cause) =>
          cause instanceof HccApiError
            ? cause
            : new HccApiError({
                cause,
                operation: "searchAddresses",
                reason: "transport",
              })
        )
      );
    };

    const getCollectionSchedule = (
      address: string
    ): Effect.Effect<CollectionSchedule | null, HccApiError> => {
      const url = new URL(
        "/FightTheLandFill/get_Collection_Dates",
        "https://api2.hcc.govt.nz"
      );
      url.searchParams.set("address_string", address);

      return client.get(url).pipe(
        // oxlint-disable-next-line no-nested-ternary, sonarjs/no-nested-conditional
        Effect.flatMap((response) =>
          // oxlint-disable-next-line no-nested-ternary, sonarjs/no-nested-conditional
          response.status === 404
            ? Effect.succeed<readonly CollectionDates[]>([])
            : // oxlint-disable-next-line sonarjs/no-nested-conditional
              response.status >= 200 && response.status < 300
              ? response.json.pipe(
                  Effect.flatMap((body) =>
                    Effect.try({
                      catch: (cause) =>
                        new HccApiError({
                          cause,
                          operation: "getCollectionSchedule",
                          reason: "decode",
                        }),
                      try: () =>
                        Schema.decodeUnknownSync(CollectionDatesResults)(body),
                    })
                  )
                )
              : Effect.fail(
                  new HccApiError({
                    cause: response,
                    operation: "getCollectionSchedule",
                    reason: "http",
                    status: response.status,
                  })
                )
        ),
        Effect.flatMap((results) => {
          const [first] = results;
          return first
            ? Effect.try({
                catch: (cause) =>
                  new HccApiError({
                    cause,
                    operation: "getCollectionSchedule",
                    reason: "domain",
                  }),
                try: () => buildSchedule(first),
              })
            : Effect.succeed(null);
        }),
        Effect.mapError((cause) =>
          cause instanceof HccApiError
            ? cause
            : new HccApiError({
                cause,
                operation: "getCollectionSchedule",
                reason: "transport",
              })
        )
      );
    };

    return { getCollectionSchedule, searchAddresses };
  });

/** Production API layer using the Effect Node HTTP client. */
const hccApiLayerWithoutDependencies = Layer.effect(HccApi, make);

/** Production API layer using the Effect Node HTTP client. */
export const hccApiLayer = hccApiLayerWithoutDependencies.pipe(
  Layer.provide(NodeHttpClient.layer)
);

import {
  Array as SchemaArray,
  Boolean as SchemaBoolean,
  decodeUnknownSync,
  optional,
  String as SchemaString,
  Struct,
  Union,
  Literal,
} from "effect/Schema";
import { useState } from "react";
import type { FormEvent } from "react";

import { Button } from "../components/ui/button";
import { Card } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { ADDRESS_LENGTH_LIMIT, isLookupAddressValid } from "../lib/address";
import { daysUntilCollection, formatCollectionDate } from "../lib/schedule";
import type { ScheduleResponse } from "../lib/schedule";

type LookupState =
  | { readonly kind: "idle" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "not-found"; readonly matches: readonly string[] }
  | { readonly kind: "success"; readonly schedule: ScheduleResponse };

const LookupSchema = Struct({
  found: SchemaBoolean,
  matches: optional(SchemaArray(SchemaString)),
  schedule: optional(
    Struct({
      address: SchemaString,
      collectionDayName: SchemaString,
      nextCollection: Struct({
        bins: SchemaArray(SchemaString),
        date: SchemaString,
        type: Union([Literal("red"), Literal("yellow")]),
      }),
      redBin: SchemaString,
      yellowBin: SchemaString,
    })
  ),
});

const parseLookup = decodeUnknownSync(LookupSchema);

const describeRelativeDate = (days: number): string => {
  if (days === 0) {
    return "Put these out today";
  }
  if (days === 1) {
    return "Put these out tomorrow";
  }
  return `In ${days} days`;
};

const lookup = async (address: string): Promise<LookupState> => {
  const response = await fetch(
    `/api/lookup?address=${encodeURIComponent(address)}`
  );
  if (!response.ok) {
    throw new Error(
      "The council lookup is unavailable right now. Please try again."
    );
  }

  const result = parseLookup(await response.json());
  if (!result.found || !result.schedule) {
    return { kind: "not-found", matches: result.matches ?? [] };
  }
  return { kind: "success", schedule: result.schedule };
};

export const HomePage = () => {
  const [address, setAddress] = useState("");
  const [state, setState] = useState<LookupState>({ kind: "idle" });

  const submitLookup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const query = address.trim();
    if (!query) {
      return;
    }
    if (!isLookupAddressValid(query)) {
      setState({
        kind: "error",
        message: `Enter an address with no more than ${ADDRESS_LENGTH_LIMIT} characters.`,
      });
      return;
    }

    setState({ kind: "loading" });
    try {
      setState(await lookup(query));
    } catch (error) {
      setState({
        kind: "error",
        message:
          error instanceof Error ? error.message : "Something went wrong.",
      });
    }
  };

  const schedule = state.kind === "success" ? state.schedule : null;
  const until = schedule
    ? daysUntilCollection(schedule.nextCollection.date, new Date())
    : null;
  const relativeCollectionDate =
    until === null ? "" : describeRelativeDate(until);

  return (
    <main className="bg-canvas text-ink min-h-screen px-5 pb-16">
      <header className="mx-auto flex max-w-6xl items-center justify-between py-7">
        <a
          className="flex items-center gap-3 font-bold tracking-tight"
          href="/"
          aria-label="Hamilton Bin Day home"
        >
          <span
            className="bg-forest grid size-10 place-items-center rounded-xl text-lg text-white"
            aria-hidden="true"
          >
            ♻
          </span>
          <span>
            Hamilton{" "}
            <span className="text-copy-muted font-normal">Bin Day</span>
          </span>
        </a>
        <a
          className="text-sage-dark text-sm font-semibold underline-offset-4 hover:underline"
          href="/docs/"
        >
          How collections work
        </a>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 pt-12 pb-12 md:grid-cols-[1fr_0.85fr] md:items-center md:py-24">
        <div>
          <p className="border-sage-border tracking-eyebrow text-sage-copy mb-5 inline-flex items-center gap-2 rounded-full border bg-white/70 px-3 py-1.5 text-xs font-bold uppercase">
            <span className="bg-leaf size-2 rounded-full" /> Hamilton, New
            Zealand
          </p>
          <h1 className="leading-heading tracking-heading max-w-xl text-5xl font-semibold sm:text-6xl">
            Never miss your <span className="text-moss">bin day</span> again.
          </h1>
          <p className="text-body-muted mt-6 max-w-lg text-lg leading-8">
            Look up your address to see exactly what to put out and when your
            next collection is.
          </p>
          <form
            className="border-paper-border shadow-lookup mt-9 flex max-w-xl flex-col gap-3 rounded-2xl border bg-white p-2 sm:flex-row"
            onSubmit={submitLookup}
          >
            <label className="sr-only" htmlFor="address">
              Hamilton street address
            </label>
            <Input
              autoComplete="street-address"
              className="min-w-0 flex-1"
              id="address"
              maxLength={ADDRESS_LENGTH_LIMIT}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Try 12 Grey Street"
              value={address}
            />
            <Button disabled={state.kind === "loading"} type="submit">
              {state.kind === "loading" ? "Checking…" : "Find my bin day"}
            </Button>
          </form>
          <p aria-live="polite" className="text-copy-muted mt-4 text-sm">
            {state.kind === "error" && state.message}
            {state.kind === "not-found" &&
              (state.matches.length
                ? `No exact match. Try: ${state.matches.slice(0, 4).join(", ")}`
                : "No matching address found. Check the street number and try again.")}
          </p>
        </div>

        <div aria-live="polite" className="relative mx-auto w-full max-w-md">
          <div className="bg-highlight absolute -inset-5 rounded-4xl" />
          <Card className="relative">
            <div className="border-card-border flex items-start justify-between border-b p-6">
              <div>
                <p className="tracking-caption text-caption text-xs font-bold uppercase">
                  Next collection
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {schedule
                    ? formatCollectionDate(schedule.nextCollection.date)
                    : "Your collection day"}
                </h2>
                <p className="text-address-muted mt-1 text-sm">
                  {schedule?.address ?? "Your address, at a glance"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold tracking-wide uppercase ${schedule?.nextCollection.type === "yellow" ? "bg-yellow-bin text-yellow-copy" : "bg-red-bin text-red-copy"}`}
              >
                {schedule ? `${schedule.nextCollection.type} week` : "Hamilton"}
              </span>
            </div>
            <div className="p-6">
              {schedule ? (
                <>
                  <p className="text-detail-muted text-sm">
                    {relativeCollectionDate}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {schedule.nextCollection.bins.map((bin) => (
                      <li
                        className="bg-panel flex items-center gap-3 rounded-xl px-4 py-3"
                        key={bin}
                      >
                        <span
                          aria-hidden="true"
                          className="text-check grid size-8 place-items-center rounded-lg bg-white"
                        >
                          ✓
                        </span>
                        <span className="font-medium">{bin}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-detail-muted mt-5 text-sm">
                    Regular collection: {schedule.collectionDayName}
                  </p>
                </>
              ) : (
                <div className="bg-panel rounded-2xl p-6 text-center">
                  <span
                    aria-hidden="true"
                    className="text-moss-dark mx-auto grid size-14 place-items-center rounded-2xl bg-white text-2xl"
                  >
                    ⌂
                  </span>
                  <p className="mt-4 font-semibold">
                    Your schedule, made simple
                  </p>
                  <p className="text-detail-muted mt-2 text-sm leading-6">
                    Enter a Hamilton address to see your next bin collection and
                    which bins to put out.
                  </p>
                </div>
              )}
            </div>
            {schedule && (
              <div className="border-card-border grid grid-cols-2 border-t text-center text-sm">
                <div className="p-4">
                  <span className="text-caption block text-xs">
                    Next red week
                  </span>
                  <span className="mt-1 block font-semibold">
                    {formatCollectionDate(schedule.redBin)}
                  </span>
                </div>
                <div className="border-card-border border-l p-4">
                  <span className="text-caption block text-xs">
                    Next yellow week
                  </span>
                  <span className="mt-1 block font-semibold">
                    {formatCollectionDate(schedule.yellowBin)}
                  </span>
                </div>
              </div>
            )}
          </Card>
        </div>
      </section>

      <section className="border-footer-border text-footer-copy mx-auto grid max-w-6xl gap-4 border-t pt-8 text-sm sm:grid-cols-3">
        <div>
          <span className="text-step-copy font-semibold">
            01 / Find your address
          </span>
          <p className="mt-1">Search an address in Hamilton.</p>
        </div>
        <div>
          <span className="text-step-copy font-semibold">
            02 / Check the next date
          </span>
          <p className="mt-1">See your next red or yellow week.</p>
        </div>
        <div>
          <span className="text-step-copy font-semibold">
            03 / Put the right bins out
          </span>
          <p className="mt-1">Get the collection details at a glance.</p>
        </div>
      </section>
      <footer className="border-footer-border text-footer-muted mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t pt-5 text-xs sm:flex-row sm:justify-between">
        <span>
          Independent community tool · Data from Hamilton City Council
        </span>
        <a className="underline underline-offset-2" href="/docs/">
          Collection guide &amp; project docs
        </a>
      </footer>
    </main>
  );
};

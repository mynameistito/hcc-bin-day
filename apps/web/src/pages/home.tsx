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
        type: Union(Literal("red"), Literal("yellow")),
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
    <main className="min-h-screen bg-[#f7f6f2] px-5 pb-16 text-[#22352c]">
      <header className="mx-auto flex max-w-6xl items-center justify-between py-7">
        <a
          className="flex items-center gap-3 font-bold tracking-tight"
          href="/"
          aria-label="Hamilton Bin Day home"
        >
          <span
            className="grid size-10 place-items-center rounded-xl bg-[#174e39] text-lg text-white"
            aria-hidden="true"
          >
            ♻
          </span>
          <span>
            Hamilton <span className="font-normal text-[#65756b]">Bin Day</span>
          </span>
        </a>
        <a
          className="text-sm font-semibold text-[#536b5c] underline-offset-4 hover:underline"
          href="/docs/"
        >
          How collections work
        </a>
      </header>

      <section className="mx-auto grid max-w-6xl gap-12 pt-12 pb-12 md:grid-cols-[1fr_0.85fr] md:items-center md:py-24">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#d6ddd4] bg-white/70 px-3 py-1.5 text-xs font-bold tracking-[0.14em] text-[#42614e] uppercase">
            <span className="size-2 rounded-full bg-[#7d9f55]" /> Hamilton, New
            Zealand
          </p>
          <h1 className="max-w-xl text-5xl leading-[1.06] font-semibold tracking-[-0.055em] sm:text-6xl">
            Never miss your <span className="text-[#668747]">bin day</span>{" "}
            again.
          </h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-[#627067]">
            Look up your address to see exactly what to put out and when your
            next collection is.
          </p>
          <form
            className="mt-9 flex max-w-xl flex-col gap-3 rounded-2xl border border-[#e4e5de] bg-white p-2 shadow-[0_12px_40px_-28px_#243a2c] sm:flex-row"
            onSubmit={submitLookup}
          >
            <label className="sr-only" htmlFor="address">
              Hamilton street address
            </label>
            <Input
              autoComplete="street-address"
              className="min-w-0 flex-1 rounded-xl px-4 py-3.5 text-base outline-none placeholder:text-[#a0a8a0] focus:ring-2 focus:ring-[#a8c18b]"
              id="address"
              maxLength={ADDRESS_LENGTH_LIMIT}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="Try 12 Grey Street"
              value={address}
            />
            <Button
              className="rounded-xl bg-[#174e39] px-6 py-3.5 font-semibold text-white transition hover:bg-[#226449] disabled:cursor-wait disabled:opacity-70"
              disabled={state.kind === "loading"}
              type="submit"
            >
              {state.kind === "loading" ? "Checking…" : "Find my bin day"}
            </Button>
          </form>
          <p aria-live="polite" className="mt-4 text-sm text-[#65756b]">
            {state.kind === "error" && state.message}
            {state.kind === "not-found" &&
              (state.matches.length
                ? `No exact match. Try: ${state.matches.slice(0, 4).join(", ")}`
                : "No matching address found. Check the street number and try again.")}
          </p>
        </div>

        <div aria-live="polite" className="relative mx-auto w-full max-w-md">
          <div className="absolute -inset-5 rounded-[2.5rem] bg-[#e8ecdf]" />
          <Card className="relative">
            <div className="flex items-start justify-between border-b border-[#edf0e9] p-6">
              <div>
                <p className="text-xs font-bold tracking-[0.16em] text-[#849080] uppercase">
                  Next collection
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight">
                  {schedule
                    ? formatCollectionDate(schedule.nextCollection.date)
                    : "Your collection day"}
                </h2>
                <p className="mt-1 text-sm text-[#78837a]">
                  {schedule?.address ?? "Your address, at a glance"}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-bold tracking-wide uppercase ${schedule?.nextCollection.type === "yellow" ? "bg-[#f5e8bc] text-[#705816]" : "bg-[#f3dddd] text-[#813c34]"}`}
              >
                {schedule ? `${schedule.nextCollection.type} week` : "Hamilton"}
              </span>
            </div>
            <div className="p-6">
              {schedule ? (
                <>
                  <p className="text-sm text-[#79847b]">
                    {relativeCollectionDate}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {schedule.nextCollection.bins.map((bin) => (
                      <li
                        className="flex items-center gap-3 rounded-xl bg-[#f6f7f2] px-4 py-3"
                        key={bin}
                      >
                        <span
                          aria-hidden="true"
                          className="grid size-8 place-items-center rounded-lg bg-white text-[#537747]"
                        >
                          ✓
                        </span>
                        <span className="font-medium">{bin}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-5 text-sm text-[#79847b]">
                    Regular collection: {schedule.collectionDayName}
                  </p>
                </>
              ) : (
                <div className="rounded-2xl bg-[#f6f7f2] p-6 text-center">
                  <span
                    aria-hidden="true"
                    className="mx-auto grid size-14 place-items-center rounded-2xl bg-white text-2xl text-[#6a8854]"
                  >
                    ⌂
                  </span>
                  <p className="mt-4 font-semibold">
                    Your schedule, made simple
                  </p>
                  <p className="mt-2 text-sm leading-6 text-[#79847b]">
                    Enter a Hamilton address to see your next bin collection and
                    which bins to put out.
                  </p>
                </div>
              )}
            </div>
            {schedule && (
              <div className="grid grid-cols-2 border-t border-[#edf0e9] text-center text-sm">
                <div className="p-4">
                  <span className="block text-xs text-[#849080]">
                    Next red week
                  </span>
                  <span className="mt-1 block font-semibold">
                    {formatCollectionDate(schedule.redBin)}
                  </span>
                </div>
                <div className="border-l border-[#edf0e9] p-4">
                  <span className="block text-xs text-[#849080]">
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

      <section className="mx-auto grid max-w-6xl gap-4 border-t border-[#e2e4dc] pt-8 text-sm text-[#647168] sm:grid-cols-3">
        <div>
          <span className="font-semibold text-[#33483a]">
            01 / Find your address
          </span>
          <p className="mt-1">Search an address in Hamilton.</p>
        </div>
        <div>
          <span className="font-semibold text-[#33483a]">
            02 / Check the next date
          </span>
          <p className="mt-1">See your next red or yellow week.</p>
        </div>
        <div>
          <span className="font-semibold text-[#33483a]">
            03 / Put the right bins out
          </span>
          <p className="mt-1">Get the collection details at a glance.</p>
        </div>
      </section>
      <footer className="mx-auto mt-12 flex max-w-6xl flex-col gap-2 border-t border-[#e2e4dc] pt-5 text-xs text-[#7d877e] sm:flex-row sm:justify-between">
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

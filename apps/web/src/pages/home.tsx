import { useState } from "react";

import { BinHelpControl } from "@/components/bin-help";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAddressLookup } from "@/hooks/use-address-lookup";
import { ADDRESS_LENGTH_LIMIT } from "@/lib/address";
import { binTypeFromName } from "@/lib/bin-items";
import { daysUntilCollection, formatCollectionDate } from "@/lib/schedule";
import type { ScheduleResponse } from "@/lib/schedule";

const describeRelativeDate = (days: number): string => {
  if (days === 0) {
    return "Put these out today";
  }
  if (days === 1) {
    return "Put these out tomorrow";
  }
  return `In ${days} days`;
};

const collectionHighlightClass = (
  type: ScheduleResponse["nextCollection"]["type"] | undefined
): string => {
  switch (type) {
    case "yellow": {
      return "bg-yellow-bin";
    }
    case "red": {
      return "bg-red-bin";
    }
    default: {
      return "bg-highlight";
    }
  }
};

const collectionBadgeClass = (
  type: ScheduleResponse["nextCollection"]["type"] | undefined
): string => {
  switch (type) {
    case "yellow": {
      return "bg-yellow-bin text-yellow-copy";
    }
    case "red": {
      return "bg-red-bin text-red-copy";
    }
    default: {
      return "bg-panel text-copy-muted";
    }
  }
};

export const HomePage = () => {
  const { address, setAddress, state, submitLookup } = useAddressLookup();
  const [theme, setTheme] = useState<"dark" | "light">(() =>
    document.documentElement.dataset.theme === "light" ? "light" : "dark"
  );

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nextTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", nextTheme === "light" ? "#f7f6f2" : "#171d19");
    setTheme(nextTheme);
    try {
      window.localStorage.setItem("hcc-bin-day-theme", nextTheme);
    } catch {
      // Keep the toggle usable when browser storage is unavailable.
    }
  };

  const schedule = state.kind === "success" ? state.schedule : null;
  const until = schedule
    ? daysUntilCollection(schedule.nextCollection.date, new Date())
    : null;
  const relativeCollectionDate =
    until === null ? "" : describeRelativeDate(until);

  return (
    <main className="home-page bg-canvas text-ink flex min-h-dvh flex-col px-4 pb-6 sm:px-5">
      <header className="home-header mx-auto flex w-full max-w-6xl items-center justify-between gap-3 py-4 sm:py-5">
        <a
          className="flex items-center gap-2.5 font-bold tracking-tight sm:gap-3"
          href="/"
          aria-label="Hamilton Bin Day home"
        >
          <span
            className="bg-forest grid size-9 shrink-0 place-items-center rounded-xl text-lg text-white sm:size-10"
            aria-hidden="true"
          >
            ♻
          </span>
          <span>
            Hamilton{" "}
            <span className="text-copy-muted font-normal">Bin Day</span>
          </span>
        </a>
        <nav className="flex shrink-0 items-center gap-2 sm:gap-3">
          <a
            className="text-sage-dark rounded-lg px-2 py-2 text-sm font-semibold underline-offset-4 hover:underline sm:px-0"
            href="/docs/"
          >
            <span className="sm:hidden">Guide</span>
            <span className="hidden sm:inline">How collections work</span>
          </a>
          <button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            aria-pressed={theme === "light"}
            className="border-sage-border bg-panel text-ink focus-visible:outline-focus-leaf inline-flex min-h-11 items-center gap-2 rounded-full border px-2.5 py-2 text-sm font-semibold transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 sm:px-3"
            onClick={toggleTheme}
            type="button"
          >
            <span aria-hidden="true">{theme === "dark" ? "☼" : "☾"}</span>
            <span className="hidden sm:inline">
              {theme === "dark" ? "Light" : "Dark"}
            </span>
          </button>
        </nav>
      </header>

      <section className="home-lookup mx-auto grid w-full max-w-6xl gap-9 pt-8 pb-10 sm:gap-12 sm:pt-12 sm:pb-12 md:grid-cols-[1fr_0.85fr] md:items-center md:py-12">
        <div className="home-lookup-copy">
          <p className="border-sage-border tracking-eyebrow text-sage-copy bg-surface mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase sm:mb-5">
            <span className="bg-leaf size-2 rounded-full" /> Hamilton, New
            Zealand
          </p>
          <h1 className="leading-heading tracking-heading max-w-xl text-4xl font-semibold sm:text-6xl">
            Never miss your <span className="text-moss">bin day</span> again.
          </h1>
          <p className="text-body-muted mt-4 max-w-lg text-base leading-7 sm:mt-6 sm:text-lg sm:leading-8">
            Look up your address to see exactly what to put out and when your
            next collection is.
          </p>
          <form
            className="border-paper-border shadow-lookup bg-surface mt-6 flex max-w-xl flex-col gap-2 rounded-2xl border p-2 sm:mt-9 sm:flex-row sm:gap-3"
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
            <Button
              className="min-h-12 w-full whitespace-nowrap sm:w-auto"
              disabled={state.kind === "loading"}
              type="submit"
            >
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

        <div
          aria-live="polite"
          className="home-schedule relative mx-auto w-full max-w-md"
        >
          <div
            className={`${collectionHighlightClass(schedule?.nextCollection.type)} absolute -inset-2 rounded-4xl sm:-inset-5`}
          />
          <Card className="relative">
            <div className="border-card-border flex items-start justify-between gap-3 border-b p-5 sm:p-6">
              <div className="min-w-0">
                <p className="tracking-caption text-caption text-xs font-bold uppercase">
                  Next collection
                </p>
                <h2 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                  {schedule
                    ? formatCollectionDate(schedule.nextCollection.date)
                    : "Your collection day"}
                </h2>
                <p className="text-address-muted mt-1 text-sm">
                  {schedule?.address ?? "Your address, at a glance"}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-bold tracking-wide whitespace-nowrap uppercase sm:px-3 ${collectionBadgeClass(schedule?.nextCollection.type)}`}
              >
                {schedule ? `${schedule.nextCollection.type} week` : "Hamilton"}
              </span>
            </div>
            <div className="p-5 sm:p-6">
              {schedule ? (
                <>
                  <p className="text-detail-muted text-sm">
                    {relativeCollectionDate}
                  </p>
                  <ul className="mt-4 space-y-3">
                    {schedule.nextCollection.bins.map((bin) => (
                      <li
                        className="bg-panel flex items-center justify-between gap-3 rounded-xl px-4 py-3"
                        key={bin}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span
                            aria-hidden="true"
                            className="text-check bg-surface grid size-8 shrink-0 place-items-center rounded-lg"
                          >
                            ✓
                          </span>
                          <span className="font-medium">{bin}</span>
                        </span>
                        <BinHelpControl
                          bin={binTypeFromName(bin)}
                          binName={bin}
                        />
                      </li>
                    ))}
                  </ul>
                  <p className="text-detail-muted mt-5 text-sm">
                    Regular collection: {schedule.collectionDayName}
                  </p>
                </>
              ) : (
                <div className="bg-panel rounded-2xl p-5 text-center sm:p-6">
                  <span
                    aria-hidden="true"
                    className="text-moss-dark bg-surface mx-auto grid size-14 place-items-center rounded-2xl text-2xl"
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
      <section className="home-steps border-footer-border text-footer-copy mx-auto grid w-full max-w-6xl gap-5 border-t py-6 text-sm md:grid-cols-3 md:gap-4 md:pt-6">
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
      <footer className="home-footer border-footer-border text-footer-muted mx-auto mt-auto flex w-full max-w-6xl flex-col gap-3 border-t pt-5 text-xs leading-5 sm:flex-row sm:justify-between sm:gap-2 sm:pt-4">
        <span>
          Independent community tool · Data from{" "}
          <a
            className="hover:text-ink underline underline-offset-2"
            href="https://hamilton.govt.nz/"
          >
            Hamilton City Council
          </a>
        </span>
        <nav
          aria-label="Site information"
          className="flex flex-wrap gap-x-4 gap-y-1"
        >
          <a className="underline underline-offset-2" href="/docs/">
            Collection guide
          </a>
          <a className="underline underline-offset-2" href="/docs/privacy/">
            Privacy
          </a>
          <a className="underline underline-offset-2" href="/docs/terms/">
            Terms
          </a>
        </nav>
      </footer>
    </main>
  );
};

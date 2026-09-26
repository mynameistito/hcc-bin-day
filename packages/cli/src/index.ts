#!/usr/bin/env node
import { readFileSync } from "node:fs";

// oxlint-disable-next-line sonarjs/no-wildcard-import
import * as Effect from "effect/Effect";

import { resolveAddressQuery } from "@/address";
import { hccApiLayer, HccApi } from "@/hcc-api";
import { formatScheduleText, toScheduleJson } from "@/schedule";

const TEXT_FLAGS = new Set(["--text", "--pretty", "-p"]);
const JSON_FLAGS = new Set(["--json", "-j"]);
const VERSION_FLAGS = new Set(["--version", "-v"]);

type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const printHelp = () => {
  console.log(`Hamilton bin-day client

  Usage:
  npx @mynameistito/hcc-bin-day --version
  npx @mynameistito/hcc-bin-day search <address>
  npx @mynameistito/hcc-bin-day schedule <address>
  npx @mynameistito/hcc-bin-day lookup <address>
  npx @mynameistito/hcc-bin-day schedule <address> --text

Examples:
  npx @mynameistito/hcc-bin-day schedule "14b mountbatten pl"
  npx @mynameistito/hcc-bin-day schedule "14b mountbatten pl" --text
  npx @mynameistito/hcc-bin-day lookup "12 grey st"

Output is JSON by default. Use --text (or --pretty) for human-readable output.
Address input is flexible: unit suffixes (14b -> 14B) and street types (pl, st, rd, etc.).
`);
};

const parseArgs = (argv: string[]) => {
  const rawArgs = argv.slice(2);
  let textFromFlag = false;
  const args: string[] = [];

  for (const arg of rawArgs) {
    if (TEXT_FLAGS.has(arg) || JSON_FLAGS.has(arg)) {
      if (TEXT_FLAGS.has(arg)) {
        textFromFlag = true;
      }
    } else {
      args.push(arg);
    }
  }

  const [command, ...queryParts] = args;
  const query = queryParts.join(" ");

  return { command, json: !textFromFlag, query };
};

const printJson = (value: JsonValue) => {
  console.log(JSON.stringify(value, null, 2));
};

const main = Effect.gen(function* main() {
  const rawArgs = process.argv.slice(2);

  if (rawArgs.some((arg) => VERSION_FLAGS.has(arg))) {
    // SAFETY: This file is the package's own package.json and defines a string version.
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf-8")
    ) as { version: string };
    console.log(packageJson.version);
    return;
  }

  const { json, command, query } = parseArgs(process.argv);

  if (
    !command ||
    command === "help" ||
    command === "--help" ||
    command === "-h"
  ) {
    printHelp();
    return;
  }

  if (!query) {
    printHelp();
    return;
  }

  if (command === "search") {
    const api = yield* HccApi;
    const matches = yield* api.searchAddresses(query);
    if (json) {
      printJson({ command, matches, query });
      return;
    }

    console.log("Matches:", matches);
    return;
  }

  if (command === "schedule" || command === "lookup") {
    const resolved = yield* resolveAddressQuery(query);

    if (!resolved.ok) {
      if (json) {
        printJson({ command, found: false, matches: resolved.matches, query });
        return;
      }

      console.log(`No match found for: ${query}`);
      if (resolved.matches.length > 0) {
        console.log("Did you mean:", resolved.matches.slice(0, 10));
      }
      return;
    }

    if (json) {
      printJson({
        command,
        found: true,
        matchedAddress: resolved.matchedAddress,
        query,
        schedule: toScheduleJson(resolved.schedule),
      });
      return;
    }

    console.log(formatScheduleText(resolved.schedule));
    return;
  }

  printHelp();
}).pipe(
  Effect.provide(hccApiLayer),
  // oxlint-disable-next-line github/no-then, promise/prefer-await-to-callbacks, promise/prefer-await-to-then
  Effect.catch((error) => {
    console.error(`Request failed (${error.reason}) during ${error.operation}`);
    process.exitCode = 1;
    return Effect.void;
  })
);

await Effect.runPromise(main);

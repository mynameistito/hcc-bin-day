#!/usr/bin/env node
import { resolveAddressQuery } from "./address";
import { searchAddresses } from "./hamilton-api";
import { formatScheduleText, toScheduleJson } from "./schedule";

declare const process: {
  argv: string[];
};

const TEXT_FLAGS = new Set(["--text", "--pretty", "-p"]);
const JSON_FLAGS = new Set(["--json", "-j"]);

const printHelp = () => {
  console.log(`Hamilton bin-day client

Usage:
  bun run src/index.ts search <address>
  bun run src/index.ts schedule <address>
  bun run src/index.ts lookup <address>
  bun run src/index.ts schedule <address> --text

Examples:
  bun run src/index.ts schedule "14b mountbatten pl"
  bun run src/index.ts schedule "14b mountbatten pl" --text
  bun run src/index.ts lookup "12 grey st"

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

const printJson = (value: unknown) => {
  console.log(JSON.stringify(value, null, 2));
};

const main = async () => {
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
    const matches = await searchAddresses(query);
    if (json) {
      printJson({ command, matches, query });
      return;
    }

    console.log("Matches:", matches);
    return;
  }

  if (command === "schedule" || command === "lookup") {
    const resolved = await resolveAddressQuery(query);

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
};

await main();

import {
  getCollectionSchedule,
  getScheduleForAddress,
  searchAddresses,
} from "./hamilton-api";

declare const process: {
  argv: string[];
};

const printHelp = () => {
  console.log(`Hamilton bin-day client

Usage:
  bun run src/index.ts search <address>
  bun run src/index.ts schedule <address>
  bun run src/index.ts lookup <address>
  bun run src/index.ts --json <command> <address>

Examples:
  bun run src/index.ts search "12 Grey Street"
  bun run src/index.ts schedule "12 Grey Street"
  bun run src/index.ts lookup "12 Grey Street"
  bun run src/index.ts --json lookup "12 Grey Street"
`);
};

const parseArgs = (argv: string[]) => {
  const args = argv.slice(2);
  const json = args[0] === "--json";
  const command = json ? args[1] : args[0];
  const query = json ? args.slice(2).join(" ") : args.slice(1).join(" ");

  return { command, json, query };
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

  if (command === "schedule") {
    const schedule = await getCollectionSchedule(query);
    if (!schedule) {
      if (json) {
        const matches = await searchAddresses(query);
        printJson({ command, found: false, matches, query });
        return;
      }

      console.log(`No exact match found for: ${query}`);
      const matches = await searchAddresses(query);
      if (matches.length > 0) {
        console.log("Did you mean:", matches.slice(0, 10));
      }
      return;
    }

    if (json) {
      printJson({ command, found: true, query, schedule });
      return;
    }

    console.log("Schedule:", schedule);
    return;
  }

  if (command === "lookup") {
    const schedule = await getScheduleForAddress(query);
    if (!schedule) {
      if (json) {
        const matches = await searchAddresses(query);
        printJson({ command, found: false, matches, query });
        return;
      }

      console.log(`No exact match found for: ${query}`);
      const matches = await searchAddresses(query);
      if (matches.length > 0) {
        console.log("Did you mean:", matches.slice(0, 10));
      }
      return;
    }

    if (json) {
      printJson({ command, found: true, query, schedule });
      return;
    }

    console.log("Schedule:", schedule);
    return;
  }

  printHelp();
};

await main();

# @mynameistito/hcc-bin-day

[![CI](https://github.com/mynameistito/hcc-bin-day/actions/workflows/ci.yml/badge.svg)](https://github.com/mynameistito/hcc-bin-day/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

TypeScript client for the Hamilton City Council Fight the Landfill bin-day lookup API.

## What it does

- searches Hamilton addresses
- resolves a street address to a bin collection schedule
- supports text and JSON output

## API endpoints

This client talks to the public Hamilton City Council backend used by the Fight the Landfill page:

- `GET /FightTheLandFill/get_Addresses?search_string=...`
- `GET /FightTheLandFill/get_Collection_Dates?address_string=...`

Base URL:

```text
https://api2.hcc.govt.nz
```

## Usage

```bash
npx @mynameistito/hcc-bin-day
npx @mynameistito/hcc-bin-day search "12 Grey Street"
npx @mynameistito/hcc-bin-day lookup "12 Grey Street"
npx @mynameistito/hcc-bin-day schedule "12 Grey Street"
npx @mynameistito/hcc-bin-day --json lookup "12 Grey Street"

bun run src/index.ts
bun run src/index.ts search "12 Grey Street"
bun run src/index.ts lookup "12 Grey Street"
bun run src/index.ts schedule "12 Grey Street"
bun run src/index.ts --json lookup "12 Grey Street"
```

## Output modes

- `search` returns matching addresses
- `schedule` returns the collection schedule for an exact match
- `lookup` searches for an exact match and falls back to suggestions
- `--json` prints structured JSON for scripting

## Project structure

```text
src/
  hamilton-api.ts
  index.ts
  types.ts
```

## Development

```bash
bun install
bun run check
bun run typecheck
bun run fix
bun run build
```

## Tooling

- Type checking: `@typescript/native-preview` via `tsgo`
- Bundling: `tsdown` targeting Node.js

## Disclaimer

This project is unofficial and is not affiliated with, endorsed by, supported by, or associated with Hamilton City Council.

It is provided independently as a convenience for accessing publicly available collection data. API behavior, availability, response formats, and returned data may change without notice.

## License

[MIT](LICENSE)

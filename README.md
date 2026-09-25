# @mynameistito/hcc-bin-day

[![CI](https://github.com/mynameistito/hcc-bin-day/actions/workflows/ci.yml/badge.svg)](https://github.com/mynameistito/hcc-bin-day/actions/workflows/ci.yml) [![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

Look up the next Hamilton City Council bin collection for an address, or use the TypeScript CLI client to query the same public service.

- **Web app:** address lookup, next collection date, and bins to put out.
- **Documentation:** collection guide and project details at `/docs`.
- **CLI:** published TypeScript client at `@mynameistito/hcc-bin-day`.

## What it does

- searches Hamilton addresses
- resolves a street address to a bin collection schedule
- supports text and JSON output

## API endpoints

The web Worker and CLI use the public Hamilton City Council backend used by the Fight the Landfill page:

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
```

## Output modes

- `search` returns matching addresses
- `schedule` returns the collection schedule for an exact match
- `lookup` searches for an exact match and falls back to suggestions
- `--json` prints structured JSON for scripting

## Project structure

```text
apps/
  docs/      Blume content and configuration
  web/       TanStack React app, Cloudflare Worker, and Tailwind CSS
packages/
  cli/       Published @mynameistito/hcc-bin-day client
```

## Development

```bash
bun install
bun run dev                 # TanStack React site
bun run --filter @mynameistito/hcc-bin-day-docs dev # Blume docs
bun run check
bun run typecheck
bun run test
bun run build
```

The repository is a Bun workspace. The CLI package remains `@mynameistito/hcc-bin-day` in `packages/cli`; the web app and Blume documentation have their own package scripts. The docs are built into the website's `/docs` path and deployed together as one Cloudflare Worker.

## Deployment

Deploy and destroy Cloudflare resources with Alchemy:

```bash
STAGE=prod bun run deploy
STAGE=prod bun run destroy
```

Production deploys to `https://bin-day.mynameistito.com`; preview stages use their stage-specific `workers.dev` URLs. Alchemy also keeps the production Worker available on `workers.dev`. Before deploying, the `mynameistito.com` zone must exist in the target Cloudflare account so Alchemy can attach the custom domain and manage its DNS/certificate. Configure repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` with permission to deploy Workers, assets, and the custom domain. GitHub Actions uses [`mynameistito/alchemy-deploy`](https://github.com/mynameistito/alchemy-deploy), pinned to v2.4.0. No non-Cloudflare hosting is used.

## Tooling

- Type checking: TypeScript via `tsc` (`bun run typecheck`)
- Bundling: `tsdown` targeting Node.js

## Disclaimer

This project is unofficial and is not affiliated with, endorsed by, supported by, or associated with Hamilton City Council.

It is provided independently as a convenience for accessing publicly available collection data. API behavior, availability, response formats, and returned data may change without notice.

## License

[MIT](LICENSE)

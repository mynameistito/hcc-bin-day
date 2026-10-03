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

The deployed web Worker exposes a stateless, read-only MCP Streamable HTTP endpoint:

- `POST https://bin-day.mynameistito.com/api/mcp` — initialize an MCP connection, list tools, and call `lookup_bin_schedule`.
- `OPTIONS /api/mcp` — responds to same-origin OPTIONS requests. Cross-origin `Origin` values are rejected, so browser cross-origin preflight requests are not supported.

The `lookup_bin_schedule` tool accepts `{ "address": "12 Grey Street" }` and returns the same `found`, `matchedAddress`, and `schedule` result as `GET /api/lookup?address=12%20Grey%20Street`. Unmatched addresses return `found: false` and suggestions; invalid input and Council service failures are returned as MCP tool errors. The endpoint is stateless (clients do not retain a session ID), has no A2A endpoint, and supports POST rather than server-initiated GET streams.

For an MCP client that supports Streamable HTTP, configure the server URL as `https://bin-day.mynameistito.com/api/mcp`. No local MCP process or API key is required. The service calls Hamilton City Council's public API, so schedule availability depends on that upstream service.

The web Worker lookup endpoint is also available as `GET /api/lookup?address=...`.

### Bin-day reminder status

The web app lets a user explicitly enable reminders, choose a lead time and local delivery time, and save a schedule using a browser push subscription. The sender resolves the instant in the selected IANA timezone, including DST boundaries. There are no accounts or cross-device sync. Notification permission is requested only by the enable control; unsupported browsers, denied permission, insecure contexts, and iOS browsers that are not installed Home Screen apps are reported. The browser retains the opaque push endpoint locally so it can delete the server record even if PushManager no longer returns the subscription.

Closed-app delivery is implemented with a scheduled Worker, a stage-specific D1 database, and Web Push (RFC 8291/8292 via `@block65/webcrypto-web-push`). It checks due notifications every five minutes, uses a claim and stable collection/preference notification ID to make retries idempotent, suppresses duplicate displays in the service worker, retries transient push failures, and removes subscriptions rejected with HTTP 404/410. A schedule lookup updates the snapshot for an existing browser subscription. The server stores only the push subscription, next and following collection dates/bin-week, timezone, reminder preferences, and operational timestamps/claim state. It does **not** store the street address or an address-derived lookup key. With no account, the push endpoint itself is the unguessable per-device authorization capability used for updates and deletion.

The closed-app sender cannot re-query the Council without retaining an address or equivalent lookup key. It uses the latest two-date schedule snapshot and projects the alternating weekly dates until the user looks up a schedule again. Exceptional Council date changes therefore require a fresh lookup to update the snapshot. Records are deleted on unsubscribe, provider 404/410, or after 90 days without a successful reminder or schedule refresh. No production VAPID credentials have been generated or committed, and no Cloudflare resources have been deployed or provisioned by this change. Until all three VAPID settings are configured, the API safely returns “not configured” and does not claim a subscription was saved.

#### Enabling delivery in a deployment

The next explicit Alchemy deployment creates the stage-specific D1 database, applies `apps/web/migrations`, binds it to the Worker, and attaches the five-minute Cron Trigger. Before enabling browser subscriptions, securely generate a VAPID key pair and configure the Worker's `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` settings. For example, for the production Worker, use the Cloudflare secret manager (never commit the values):

```powershell
wrangler secret put VAPID_PUBLIC_KEY --name hcc-bin-day
wrangler secret put VAPID_PRIVATE_KEY --name hcc-bin-day
wrangler secret put VAPID_SUBJECT --name hcc-bin-day
```

Use the corresponding stage-specific Worker name for previews. Reconfirm that the secrets remain configured after later deployments. Do not enable or advertise delivery until the API reports configured status and a real installed-device smoke test succeeds.

#### Reminder delivery smoke test

- **Current code before deployment/configuration:** local tests cover enrollment, schedule updates, removal, and duplicate/retry behavior. On Android Chrome and supported iOS Safari, install the PWA, verify the consent explanation appears before opting in, and confirm that an unconfigured server fails visibly without claiming success. No phone E2E was run for this change.
- **After VAPID settings and D1/Cron deployment:** on Android Chrome, enable reminders, select **The day before** and a local time, close the installed app before send time, and verify one notification arrives. Tap it to open the app; retry the same push and verify it is not shown again.
- **After delivery is provisioned — iOS:** use a supported iOS version and open the app installed through **Share → Add to Home Screen** in Safari. Repeat the permission, closed-app, selected-time, tap-through, and duplicate checks.
- On both platforms, also deny permission and verify the UI points to browser settings; change the collection schedule and confirm the existing server snapshot is updated so the old date is cancelled. Disable reminders and verify the server record is deleted.

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
npx @mynameistito/hcc-bin-day --version
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
- `--version` (or `-v`) prints the installed package version

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

Production deploys to `https://bin-day.mynameistito.com`; preview stages use their stage-specific `workers.dev` URLs. Alchemy also keeps the production Worker available on `workers.dev`. Before deploying, the `mynameistito.com` zone must exist in the target Cloudflare account so Alchemy can attach the custom domain and manage its DNS/certificate. Configure repository secrets `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. The token should be scoped to the target account with **Workers Scripts: Edit**, **D1: Edit**, and **Secrets Store: Edit** permissions. GitHub Actions uses [`mynameistito/alchemy-deploy`](https://github.com/mynameistito/alchemy-deploy), pinned immutably to v3.1.3. Credential-free CI uploads the built Worker and site assets; PR previews deploy only that exact-run artifact. No non-Cloudflare hosting is used.

### PWA install smoke test

- **Android (Chrome):** visit the production site over HTTPS, open the browser menu, choose **Install app** (or **Add to Home screen**), then launch it and confirm it opens without browser chrome. After a successful visit, enable airplane mode and confirm the app shell opens with a clear offline message and no collection details.
- **iOS (Safari):** visit the production site, tap **Share → Add to Home Screen**, then launch the home-screen icon and confirm it opens in standalone mode. Repeat the airplane-mode check to confirm schedules are hidden while offline.

## Tooling

- Type checking: TypeScript via `tsc` (`bun run typecheck`)
- Bundling: `tsdown` targeting Node.js

## Disclaimer

This project is unofficial and is not affiliated with, endorsed by, supported by, or associated with Hamilton City Council.

It is provided independently as a convenience for accessing publicly available collection data. API behavior, availability, response formats, and returned data may change without notice.

## License

[MIT](LICENSE)

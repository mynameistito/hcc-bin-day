# @mynameistito/hcc-bin-day

TypeScript client and CLI for Hamilton City Council's public Fight the Landfill bin-day API.

```bash
npx @mynameistito/hcc-bin-day search "12 Grey Street"
npx @mynameistito/hcc-bin-day lookup "12 Grey Street"
npx @mynameistito/hcc-bin-day schedule "12 Grey Street" --text
npx @mynameistito/hcc-bin-day --json lookup "12 Grey Street"
```

JSON is the default output; pass `--text` (or `--pretty`) for readable text. Address lookup uses the council endpoint at `https://api2.hcc.govt.nz`.

This is an unofficial community project, not affiliated with Hamilton City Council. API behavior and collection data may change without notice.

See the [repository README](../../README.md) for workspace and development instructions.

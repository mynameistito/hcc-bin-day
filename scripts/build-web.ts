import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { $ } from "bun";

const webDirectory = path.resolve(import.meta.dir, "../apps/web");
const docsOutput = path.resolve(import.meta.dir, "../apps/docs/dist");
const webOutput = path.resolve(webDirectory, "dist");

await $`bun x vite build`.cwd(webDirectory);
const indexHtml = await readFile(path.resolve(webOutput, "index.html"));
const buildId = createHash("sha256")
  .update(indexHtml)
  .digest("hex")
  .slice(0, 12);
const assetFiles = await readdir(path.resolve(webOutput, "assets"));
// oxlint-disable-next-line unicorn/no-array-sort -- SAFETY: This fresh list is sorted only to stabilize the emitted service-worker cache key.
const builtAssets = assetFiles.sort().map((asset) => `/assets/${asset}`);
const serviceWorkerPath = path.resolve(webOutput, "sw.js");
const serviceWorker = await readFile(serviceWorkerPath, "utf-8");
const replaceExactlyOnce = (
  source: string,
  placeholder: string,
  replacement: string
): string => {
  if (source.split(placeholder).length !== 2) {
    throw new Error(
      `Expected exactly one service-worker placeholder: ${placeholder}`
    );
  }
  return source.replace(placeholder, replacement);
};
const versionedServiceWorker = replaceExactlyOnce(
  replaceExactlyOnce(
    serviceWorker,
    'const BUILD_ID = "development";',
    `const BUILD_ID = "${buildId}";`
  ),
  "const BUILD_ASSETS = [];",
  `const BUILD_ASSETS = ${JSON.stringify(builtAssets)};`
);
await writeFile(serviceWorkerPath, versionedServiceWorker);
await mkdir(path.resolve(webOutput, "docs"), { recursive: true });
await cp(path.resolve(docsOutput, "docs"), path.resolve(webOutput, "docs"), {
  recursive: true,
});
const docsEntries = await readdir(docsOutput);
await Promise.all(
  docsEntries
    .filter((entry) => entry !== "docs" && entry !== "index.html")
    .map((entry) =>
      cp(path.resolve(docsOutput, entry), path.resolve(webOutput, entry), {
        force: true,
        recursive: true,
      })
    )
);

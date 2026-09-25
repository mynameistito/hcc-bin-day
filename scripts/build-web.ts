import { cp, mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { $ } from "bun";

const webDirectory = path.resolve(import.meta.dir, "../apps/web");
const docsOutput = path.resolve(import.meta.dir, "../apps/docs/dist");
const webOutput = path.resolve(webDirectory, "dist");

await $`bun x vite build`.cwd(webDirectory);
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

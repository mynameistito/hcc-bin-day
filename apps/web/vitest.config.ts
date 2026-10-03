import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@cli\/council-schema$/u,
        replacement: fileURLToPath(
          new URL("../../packages/cli/src/council-schema.ts", import.meta.url)
        ),
      },
      {
        find: /^@cli\/normalize-address$/u,
        replacement: fileURLToPath(
          new URL(
            "../../packages/cli/src/normalize-address.ts",
            import.meta.url
          )
        ),
      },
      {
        find: /^@cli\/schedule$/u,
        replacement: fileURLToPath(
          new URL("../../packages/cli/src/schedule.ts", import.meta.url)
        ),
      },
      {
        find: /^@web-scripts\/sync-hcc-bin-items$/u,
        replacement: fileURLToPath(
          new URL("scripts/sync-hcc-bin-items.ts", import.meta.url)
        ),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("src", import.meta.url)),
      },
    ],
  },
  test: {
    include: [
      "src/**/__tests__/**/*.test.ts",
      "src/**/__tests__/**/*.test.tsx",
    ],
  },
});

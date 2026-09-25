import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { selectJsPlugins } from "ultracite/oxlint/js-plugins";

const jsPlugins = selectJsPlugins(["github", "sonarjs"]);

export default defineConfig({
  extends: [core, antiSlop, jsPlugins],
  ignorePatterns: [...core.ignorePatterns, "apps/docs/.blume/**"],
  jsPlugins: jsPlugins.jsPlugins,
});

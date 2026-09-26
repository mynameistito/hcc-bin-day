import { defineConfig } from "oxlint";
import { jsPluginSettings, selectJsPlugins } from "ultracite/oxlint/js-plugins";
import react from "ultracite/oxlint/react";
import shadcn from "ultracite/oxlint/shadcn";
import tanstack from "ultracite/oxlint/tanstack";
import tanstackJsPlugins from "ultracite/oxlint/tanstack/js-plugins";

import base from "../../oxlint.config.ts";

const jsPlugins = selectJsPlugins(["github", "sonarjs", "react-doctor"]);

export default defineConfig({
  extends: [base, react, tanstack, tanstackJsPlugins, shadcn, jsPlugins],
  jsPlugins: [...jsPlugins.jsPlugins, ...shadcn.jsPlugins],
  settings: jsPluginSettings,
});

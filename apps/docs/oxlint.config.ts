import { defineConfig } from "oxlint";
import astro from "ultracite/oxlint/astro";

import base from "../../oxlint.config.ts";

export default defineConfig({
  extends: [base, astro],
});

import { defineConfig } from "blume";

export default defineConfig({
  basePath: "/docs",
  content: { root: "content" },
  description:
    "Address lookup and collection schedule details for Hamilton, New Zealand.",
  github: { dir: "apps/docs", owner: "mynameistito", repo: "hcc-bin-day" },
  theme: { accent: "green", mode: "system", radius: "md" },
  title: "Hamilton Bin Day",
});

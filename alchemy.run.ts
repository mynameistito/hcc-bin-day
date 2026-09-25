import { Stack } from "alchemy";
import { providers, state, Website } from "alchemy/Cloudflare";
import { gen } from "effect/Effect";

const Site = Website.StaticSite(
  "Website",
  Stack.useSync((stack) => ({
    assets: {
      htmlHandling: "force-trailing-slash",
      notFoundHandling: "single-page-application",
      runWorkerFirst: ["/api/*"],
    },
    command: "bun run build",
    domain: stack.stage === "prod" ? "bin-day.mynameistito.com" : undefined,
    main: "./apps/web/src/worker.ts",
    name: stack.stage === "prod" ? "hcc-bin-day" : `hcc-bin-day-${stack.stage}`,
    outdir: "apps/web/dist",
    workersDev: true,
  }))
);

export default Stack(
  "HamiltonBinDay",
  { providers: providers(), state: state() },
  gen(function* createStack() {
    const website = yield* Site;
    return { url: website.url };
  })
);

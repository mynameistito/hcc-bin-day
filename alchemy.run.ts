import { Stack } from "alchemy";
import { providers, state, Website } from "alchemy/Cloudflare";
import { gen } from "effect/Effect";

const websiteProps = (stage: string) => {
  const props = {
    assets: {
      htmlHandling: "force-trailing-slash" as const,
      notFoundHandling: "single-page-application" as const,
      runWorkerFirst: ["/api/*"],
    },
    command: "bun run build",
    main: "./apps/web/src/worker.ts",
    name: stage === "prod" ? "hcc-bin-day" : `hcc-bin-day-${stage}`,
    outdir: "apps/web/dist",
    workersDev: true,
  };

  if (stage === "prod") {
    return { ...props, domain: "bin-day.mynameistito.com" };
  }

  return props;
};

const Site = Website.StaticSite(
  "Website",
  Stack.useSync((stack) => websiteProps(stack.stage))
);

export default Stack(
  "HamiltonBinDay",
  { providers: providers(), state: state() },
  gen(function* createStack() {
    const website = yield* Site;
    return { url: website.url };
  })
);

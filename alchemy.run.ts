import { Stack } from "alchemy";
import { D1, providers, state, Website, Workers } from "alchemy/Cloudflare";
import { gen } from "effect/Effect";

const resolveStackValue = Stack.useSync.bind(Stack);

const websiteProps = (stage: string) => {
  const props = {
    assets: {
      htmlHandling: "force-trailing-slash" as const,
      notFoundHandling: "single-page-application" as const,
      runWorkerFirst: ["/api/*"],
    },
    command: "bun run build",
    crons: ["*/5 * * * *"],
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

const Reminders = D1.Database(
  "ReminderSubscriptions",
  resolveStackValue((stack) => ({
    migrations: "./apps/web/migrations",
    name: `hcc-bin-day-reminders-${stack.stage}`,
    primaryLocationHint: "oc" as const,
  }))
);

const Site = Website.StaticSite(
  "Website",
  resolveStackValue((stack) => ({
    ...websiteProps(stack.stage),
    env: {
      REMINDERS: Reminders,
      REMINDER_LIMIT: Workers.RateLimit("ReminderApiLimit", {
        namespaceId: `hcc-bin-day-reminders-${stack.stage}`,
        simple: { limit: 30, period: 60 },
      }),
    },
  }))
);

export default Stack(
  "HamiltonBinDay",
  { providers: providers(), state: state() },
  gen(function* createStack() {
    yield* Reminders;
    const website = yield* Site;
    return { url: website.url };
  })
);

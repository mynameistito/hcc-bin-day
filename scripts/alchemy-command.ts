import { spawn } from "node:child_process";

const command = process.argv.at(-1);
if (command !== "deploy" && command !== "destroy") {
  throw new Error("Expected deploy or destroy command");
}

const stage = process.env.STAGE;
if (!stage) {
  throw new Error("STAGE is required for Alchemy deploy and destroy commands");
}
if (!/^[a-z0-9][a-z0-9_-]{0,62}$/iu.test(stage)) {
  throw new Error("STAGE must be a valid Alchemy stage name");
}
const child = spawn(
  process.execPath,
  ["x", "alchemy", command, "--stage", stage, "--yes"],
  { stdio: "inherit" }
);

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});

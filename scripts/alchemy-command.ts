import { spawn } from "node:child_process";

const command = process.argv.at(-1);
if (command !== "deploy" && command !== "destroy") {
  throw new Error("Expected deploy or destroy command");
}

const stage = process.env.STAGE ?? "dev";
const child = spawn(
  process.execPath,
  ["x", "alchemy", command, "--stage", stage, "--yes"],
  { shell: process.platform === "win32", stdio: "inherit" }
);

child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code) => {
  process.exitCode = code ?? 1;
});

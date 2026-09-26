import { describe, expect, test } from "bun:test";

import packageJson from "../package.json";

describe("CLI version flag", () => {
  test.each(["-v", "--version"])(
    "prints the package version with %s",
    async (flag) => {
      const childProcess = Bun.spawn(
        [process.execPath, "run", "src/index.ts", flag],
        {
          cwd: `${import.meta.dir}/..`,
          stderr: "pipe",
          stdout: "pipe",
        }
      );

      const [exitCode, stdout, stderr] = await Promise.all([
        childProcess.exited,
        new Response(childProcess.stdout).text(),
        new Response(childProcess.stderr).text(),
      ]);

      expect(exitCode).toBe(0);
      expect(stdout.trim()).toBe(packageJson.version);
      expect(stderr).toBe("");
    }
  );
});

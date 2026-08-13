import { spawnSync } from "node:child_process";
import process from "node:process";

const projectRoot = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const playwrightArgs = process.argv.slice(2);
const localEnv = {
  ...process.env,
  EXPOSE_TESTING_API: "1",
  FINAPP_AUTH_MODE: "dev",
  FINAPP_IMPORT_STORAGE: "local",
};

function run(args) {
  const result = spawnSync(npmCommand, args, {
    cwd: projectRoot,
    env: localEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(["run", "build"]);
run([
  "exec",
  "--",
  "playwright",
  "test",
  "--config",
  "playwright.instant.config.ts",
  ...playwrightArgs,
]);

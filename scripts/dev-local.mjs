import { prepareLocalDatabase } from "./local-database.mjs";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";

const projectRoot = process.cwd();
const productionMode = process.argv.includes("--production");
const forwardedArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--production");
const localDatabaseUrl =
  "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const localEnv = {
  ...process.env,
  DATABASE_URL: localDatabaseUrl,
  DIRECT_DATABASE_URL: localDatabaseUrl,
  FX_WORKER_DATABASE_URL:
    "postgres://homebooks_fx_local:homebooks-local-only@127.0.0.1:54322/postgres",
  FINAPP_AUTH_MODE: "dev",
  FINAPP_IMPORT_STORAGE: "local",
};

function run(command, args) {
  const commandEnv = { ...localEnv };
  delete commandEnv.FORCE_COLOR;
  delete commandEnv.NO_COLOR;

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: commandEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function databaseIsReady() {
  const client = new pg.Client({
    connectionString: localDatabaseUrl,
    connectionTimeoutMillis: 2_000,
  });

  try {
    await client.connect();
    await client.query("select 1");
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function waitForDatabase() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const client = new pg.Client({
      connectionString: localDatabaseUrl,
      connectionTimeoutMillis: 2_000,
    });

    try {
      await client.connect();
      await client.query("select 1");
      await client.end();
      return;
    } catch {
      await client.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
  }

  throw new Error(
    "Local Supabase Postgres did not become ready in 30 seconds.",
  );
}

if (!(await databaseIsReady())) {
  run("supabase", ["start", "--exclude", "logflare,vector"]);
}
await waitForDatabase();
const admin = new pg.Client({ connectionString: localDatabaseUrl });
await admin.connect();
try {
  await prepareLocalDatabase(admin, projectRoot);
} finally {
  await admin.end();
}

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(
  npmCommand,
  ["run", productionMode ? "start" : "dev", "--", ...forwardedArgs],
  {
    cwd: projectRoot,
    env: localEnv,
    stdio: "inherit",
  },
);

const fxWorker = spawn(
  process.execPath,
  ["--import", "tsx", "scripts/drain-fx-rates.ts", "--watch"],
  {
    cwd: projectRoot,
    env: localEnv,
    stdio: "inherit",
  },
);
const forwardSignal = (signal) => {
  fxWorker.kill(signal);
  child.kill(signal);
};
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("exit", (code, signal) => {
  fxWorker.kill();
  process.exit(code ?? (signal ? 1 : 0));
});

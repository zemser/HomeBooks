import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawn, spawnSync } from "node:child_process";
import pg from "pg";

const projectRoot = process.cwd();
const localDatabaseUrl = "postgres://postgres:postgres@127.0.0.1:54322/postgres";
const localEnv = {
  ...process.env,
  DATABASE_URL: localDatabaseUrl,
  DIRECT_DATABASE_URL: localDatabaseUrl,
  FINAPP_AUTH_MODE: "dev",
  FINAPP_IMPORT_STORAGE: "local",
};

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: localEnv,
    stdio: "inherit",
  });

  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
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

  throw new Error("Local Supabase Postgres did not become ready in 30 seconds.");
}

async function ensureSchemaAndSeeds() {
  const client = new pg.Client({ connectionString: localDatabaseUrl });
  await client.connect();

  try {
    const result = await client.query("select to_regclass('public.workspaces') as table_name");

    if (!result.rows[0].table_name) {
      await client.end();
      run("npm", ["exec", "--", "drizzle-kit", "push", "--url", localDatabaseUrl, "--force"]);
      await client.connect();
    }

    const seedPath = path.join(projectRoot, "src/db/migrations/0005_seed_import_catalog.sql");
    await client.query(fs.readFileSync(seedPath, "utf8"));
  } finally {
    await client.end();
  }
}

run("supabase", ["start", "--exclude", "logflare,vector"]);
await waitForDatabase();
await ensureSchemaAndSeeds();

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const child = spawn(npmCommand, ["run", "dev", "--", ...process.argv.slice(2)], {
  cwd: projectRoot,
  env: localEnv,
  stdio: "inherit",
});

const forwardSignal = (signal) => child.kill(signal);
process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));

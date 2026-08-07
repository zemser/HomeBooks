import { spawnSync } from "node:child_process";
import process from "node:process";

import pg from "pg";

import "./load-env.mjs";

const { Pool } = pg;
const READINESS_USER_ID = "00000000-0000-4000-8000-000000000001";
const BYPASS_DATABASE_USERS = new Set([
  "postgres",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
]);

const checks = [];

function pass(label) {
  checks.push({ label, ok: true });
}

function fail(label, detail) {
  checks.push({ label, ok: false, detail });
}

function checkEnv(name) {
  if (process.env[name]) {
    pass(`${name} is set`);
  } else {
    fail(`${name} is set`, "missing");
  }
}

function checkCommand(command) {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    const version = (result.stdout || result.stderr).split("\n")[0].trim();
    pass(`${command} is available${version ? ` (${version})` : ""}`);
  } else {
    fail(`${command} is available`, "not found or not executable");
  }
}

async function checkCatalogRows() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    fail("required import catalog rows exist", "DATABASE_URL is missing");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const client = await pool.connect();

    try {
      await client.query("select set_config('app.current_user_id', $1, false)", [
        READINESS_USER_ID,
      ]);

      const sourceResult = await client.query(`
        select required.type, required.name
        from (
          values
            ('bank'::import_type, 'Max'),
            ('bank'::import_type, 'Cal'),
            ('investment'::import_type, 'Excellence')
        ) as required(type, name)
        left join import_sources
          on import_sources.type = required.type
          and import_sources.name = required.name
        where import_sources.id is null
      `);

      const templateResult = await client.query(`
        select required.source_name, required.template_name
        from (
          values
            ('bank'::import_type, 'Max', 'max_credit_statement'),
            ('bank'::import_type, 'Cal', 'cal_card_export'),
            ('bank'::import_type, 'Cal', 'cal_recent_transactions_report')
        ) as required(type, source_name, template_name)
        left join import_sources
          on import_sources.type = required.type
          and import_sources.name = required.source_name
        left join import_templates
          on import_templates.import_source_id = import_sources.id
          and import_templates.template_name = required.template_name
          and import_templates.active = true
        where import_templates.id is null
      `);

      if (sourceResult.rowCount > 0 || templateResult.rowCount > 0) {
        const missingSources = sourceResult.rows.map((row) => `${row.type}:${row.name}`);
        const missingTemplates = templateResult.rows.map(
          (row) => `${row.source_name}:${row.template_name}`,
        );

        fail(
          "required import catalog rows exist",
          [...missingSources, ...missingTemplates].join(", "),
        );
        return;
      }

      pass("required import catalog rows exist");
    } finally {
      client.release();
    }
  } catch (error) {
    fail(
      "required import catalog rows exist",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    await pool.end();
  }
}

function checkRlsSmoke() {
  const result = spawnSync(process.execPath, ["scripts/smoke-rls-isolation.mjs"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.status === 0) {
    pass("RLS isolation smoke test passes");
  } else {
    const detail = (result.stderr || result.stdout || "smoke test failed").trim();
    fail("RLS isolation smoke test passes", detail.split("\n").slice(-3).join(" "));
  }
}

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);

  if (major === 22) {
    pass(`Node ${process.versions.node} matches project runtime`);
  } else {
    fail(`Node ${process.versions.node} matches project runtime`, "expected Node 22.x");
  }
}

function checkDatabaseRole() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    fail("DATABASE_URL uses a non-bypass runtime role", "DATABASE_URL is missing");
    return;
  }

  try {
    const parsed = new URL(databaseUrl);

    if (BYPASS_DATABASE_USERS.has(parsed.username)) {
      fail(
        "DATABASE_URL uses a non-bypass runtime role",
        `username "${parsed.username}" bypasses or administers RLS`,
      );
      return;
    }

    pass("DATABASE_URL uses a non-bypass runtime role");
  } catch {
    fail("DATABASE_URL uses a non-bypass runtime role", "DATABASE_URL is not a valid URL");
  }
}

async function main() {
  checkNodeVersion();

  [
    "DATABASE_URL",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_IMPORT_BUCKET",
    "FINAPP_BACKUP_DATABASE_URL",
    "FINAPP_BACKUP_RECIPIENT",
    "FINAPP_BACKUP_DIR",
  ].forEach(checkEnv);

  checkDatabaseRole();

  ["pg_dump", "pg_restore", "gpg", "shasum"].forEach(checkCommand);

  await checkCatalogRows();
  checkRlsSmoke();

  const failed = checks.filter((check) => !check.ok);

  for (const check of checks) {
    if (check.ok) {
      console.log(`ok - ${check.label}`);
    } else {
      console.error(`missing - ${check.label}: ${check.detail}`);
    }
  }

  if (failed.length > 0) {
    console.error("");
    console.error(`${failed.length} hosted readiness check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("");
    console.log("Hosted readiness preflight passed.");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

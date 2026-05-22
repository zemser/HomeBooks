import { spawnSync } from "node:child_process";
import process from "node:process";

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

function checkNodeVersion() {
  const major = Number(process.versions.node.split(".")[0]);

  if (major === 20) {
    pass(`Node ${process.versions.node} matches project runtime`);
  } else {
    fail(`Node ${process.versions.node} matches project runtime`, "expected Node 20.x");
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


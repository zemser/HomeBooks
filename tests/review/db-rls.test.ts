import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("../../src/db/migrations/0004_hosted_rls_foundation.sql", import.meta.url);
const configPath = new URL("../../supabase/config.toml", import.meta.url);
const scriptPath = new URL("../../scripts/test-db-003-rls.mjs", import.meta.url);

test("DB-003 integration harness covers pooled reuse, rollback, concurrency, and RLS", async () => {
  const source = await readFile(scriptPath, "utf8");

  assert.match(source, /new Pool\(\{ connectionString: databaseUrl, max: 1 \}\)/);
  assert.match(source, /set_config\('app\.current_user_id', \$1, true\)/);
  assert.match(source, /await client\.query\("rollback"\)/);
  assert.match(source, /Promise\.all\(\[/);
  assert.match(source, /cannot read user B workspace/);
  assert.match(source, /cannot mutate user B workspace/);
});

test("all SECURITY DEFINER helpers are fixed-path functions in the private app schema", async () => {
  const [migration, config] = await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(configPath, "utf8"),
  ]);

  const privilegedHelpers = migration.match(/SECURITY DEFINER/g) ?? [];
  assert.equal(privilegedHelpers.length, 9);
  assert.doesNotMatch(migration, /CREATE OR REPLACE FUNCTION "public"\./);
  assert.equal((migration.match(/SET search_path = public, pg_temp/g) ?? []).length, 9);
  assert.match(config, /schemas = \["public", "graphql_public"\]/);
  assert.doesNotMatch(config, /schemas\s*=.*app/);
  assert.match(
    migration,
    /SECURITY DEFINER[\s\S]*?SET search_path = public, pg_temp/,
  );
});

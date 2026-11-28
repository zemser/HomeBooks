import fs from "node:fs";
import path from "node:path";
import { readMigrationFiles } from "drizzle-orm/migrator";

// dev:local used db:push before the FX worker. Those databases have tables but
// no migration ledger or SQL-only identity helpers. Adopt the shared 0016 baseline;
// later migrations install missing SQL objects even if db:push already created the FX columns.
async function adoptLocalPush(client, folder, migrations) {
  const {
    rows: [state],
  } = await client.query(`
    select to_regclass('public.workspaces') is not null as existing,
      exists(select from information_schema.columns where table_schema='public' and table_name='expense_events'
        and column_name='split_for_settlement') as supported,
      exists(select from information_schema.columns where table_schema='public' and table_name='transactions'
        and column_name='settlement_currency') as has_settlement
  `);
  if (!state.existing) return;
  if (!state.supported || !state.has_settlement) {
    throw new Error(
      "Untracked local schema predates the supported db:push baseline. Back it up and apply its outstanding historical migrations first.",
    );
  }
  const statements = (name) =>
    fs
      .readFileSync(path.join(folder, name), "utf8")
      .split("--> statement-breakpoint");
  const foundation = statements("0004_hosted_rls_foundation.sql");
  const hardened = statements("0010_harden_jobs_and_current_user_security.sql");
  await client.query("create schema if not exists app");
  await client.query(
    hardened.find((sql) =>
      sql.includes('CREATE OR REPLACE FUNCTION "app"."current_user_id"'),
    ),
  );
  await client.query(
    foundation.find((sql) =>
      sql.includes('CREATE OR REPLACE FUNCTION "app"."is_workspace_member"'),
    ),
  );
  await client.query(
    fs.readFileSync(path.join(folder, "0005_seed_import_catalog.sql"), "utf8"),
  );
  const tags = JSON.parse(
    fs.readFileSync(path.join(folder, "meta/_journal.json"), "utf8"),
  ).entries;
  const baseline = tags.findIndex(
    (entry) => entry.tag === "0016_shiny_clint_barton",
  );
  await client.query(
    "insert into drizzle.__drizzle_migrations(hash,created_at) values ($1,$2)",
    ["local-db-push-baseline-0016", migrations[baseline].folderMillis],
  );
}

export async function prepareLocalDatabase(client, projectRoot) {
  const folder = path.join(projectRoot, "src/db/migrations");
  const migrations = readMigrationFiles({ migrationsFolder: folder });
  await client.query(
    "select pg_advisory_lock(hashtext('homebooks-dev-local-migrations'))",
  );
  try {
    await client.query("begin");
    await client.query("create schema if not exists drizzle");
    await client.query(
      "create table if not exists drizzle.__drizzle_migrations(id serial primary key,hash text not null,created_at bigint)",
    );
    const {
      rows: [{ latest }],
    } = await client.query(
      "select max(created_at) as latest from drizzle.__drizzle_migrations",
    );
    if (!latest) await adoptLocalPush(client, folder, migrations);
    const {
      rows: [baseline],
    } = await client.query(
      "select max(created_at) as latest from drizzle.__drizzle_migrations",
    );
    for (const migration of migrations.filter(
      (m) => m.folderMillis > Number(baseline.latest),
    )) {
      for (const statement of migration.sql) await client.query(statement);
      await client.query(
        "insert into drizzle.__drizzle_migrations(hash,created_at) values ($1,$2)",
        [migration.hash, migration.folderMillis],
      );
    }
    // This fixed local-only login matches the loopback Supabase profile. A hosted
    // worker receives its own provisioned login via FX_WORKER_DATABASE_URL.
    await client.query(`do $$ begin
      if not exists(select from pg_roles where rolname='homebooks_fx_local') then
        create role homebooks_fx_local login password 'homebooks-local-only' noinherit nobypassrls;
      end if;
    end $$;
    grant homebooks_fx_worker to homebooks_fx_local;`);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.query(
      "select pg_advisory_unlock(hashtext('homebooks-dev-local-migrations'))",
    );
  }
}

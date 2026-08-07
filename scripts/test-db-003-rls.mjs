import { randomUUID } from "node:crypto";
import process from "node:process";

import pg from "pg";

import "./load-env.mjs";

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const bypassUsers = new Set([
  "postgres",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
]);

if (!databaseUrl) {
  console.log("DB-003 skipped: DATABASE_URL is not set.");
  process.exit(0);
}

const databaseUser = new URL(databaseUrl).username;
if (bypassUsers.has(databaseUser) && process.env.FINAPP_ALLOW_BYPASS_DATABASE_URL !== "1") {
  throw new Error("Refusing DB-003 against a bypass database role.");
}

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
const suffix = randomUUID().slice(0, 8);
const fixtures = [];

async function asUser(userId, callback) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.current_user_id', $1, true)", [userId]);
    const result = await callback(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function seedFixture(label) {
  const userId = randomUUID();
  const workspaceId = randomUUID();
  const memberId = randomUUID();
  const categoryName = `DB-003 ${label} ${suffix}`;

  await asUser(userId, async (client) => {
    await client.query(
      "insert into users (id, email, display_name) values ($1, $2, $3)",
      [userId, `db-003-${label}-${suffix}@example.test`, `DB-003 ${label}`],
    );
    await client.query(
      "insert into workspaces (id, name, base_currency, country_code) values ($1, $2, 'ILS', 'IL')",
      [workspaceId, `DB-003 workspace ${label} ${suffix}`],
    );
    await client.query(
      "insert into workspace_members (id, workspace_id, user_id, role) values ($1, $2, $3, 'owner')",
      [memberId, workspaceId, userId],
    );
    await client.query(
      "insert into workspace_categories (workspace_id, name, canonical_name) values ($1, $2, $3)",
      [workspaceId, categoryName, `${label}-${suffix}`],
    );
  });

  const fixture = { userId, workspaceId, memberId, categoryName };
  fixtures.push(fixture);
  return fixture;
}

async function expect(condition, message) {
  if (!condition) throw new Error(message);
  console.log(`ok - ${message}`);
}

async function auditPrivilegedFunctions(client) {
  const result = await client.query(`
    select
      n.nspname as schema_name,
      p.proname as function_name,
      r.rolname as owner_name,
      p.proconfig,
      has_function_privilege('public', p.oid, 'execute') as public_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_roles r on r.oid = p.proowner
    where n.nspname = 'app' and p.prosecdef
    order by p.proname
  `);

  await expect(result.rowCount === 9, "all nine app SECURITY DEFINER helpers are catalogued");
  for (const row of result.rows) {
    await expect(row.schema_name === "app", `${row.function_name} stays outside exposed public schema`);
    await expect(
      row.proconfig?.some((setting) => setting === "search_path=public, pg_temp"),
      `${row.function_name} has a fixed search_path`,
    );
    await expect(Boolean(row.owner_name), `${row.function_name} has an explicit catalog owner`);
    // app is not in supabase/config.toml api.schemas, so PUBLIC EXECUTE is not an API exposure.
    // Keep this visible in the audit output until a deployment-specific runtime-role grant exists.
    console.log(`audit - ${row.function_name}: PUBLIC EXECUTE=${row.public_execute}`);
  }
}

async function main() {
  const first = await seedFixture("first");
  const second = await seedFixture("second");

  const firstPid = await asUser(first.userId, async (client) => {
    const result = await client.query("select pg_backend_pid() as pid, current_setting('app.current_user_id', true) as user_id");
    await expect(result.rows[0].user_id === first.userId, "user A identity is visible inside its transaction");
    return result.rows[0].pid;
  });
  const secondPid = await asUser(second.userId, async (client) => {
    const result = await client.query("select pg_backend_pid() as pid, current_setting('app.current_user_id', true) as user_id");
    await expect(result.rows[0].user_id === second.userId, "user B identity replaces user A on the reused connection");
    return result.rows[0].pid;
  });
  await expect(firstPid === secondPid, "sequential requests reuse the same pooled backend");

  const afterReuse = await pool.query("select current_setting('app.current_user_id', true) as user_id");
  await expect(afterReuse.rows[0].user_id === "", "transaction-local identity is cleared before pooled reuse");

  const rolledBackCategory = `DB-003 rollback ${suffix}`;
  await asUser(first.userId, async (client) => {
    await client.query(
      "insert into workspace_categories (workspace_id, name, canonical_name) values ($1, $2, $3)",
      [first.workspaceId, rolledBackCategory, `rollback-${suffix}`],
    );
    throw new Error("intentional DB-003 rollback");
  }).catch((error) => expect(error.message === "intentional DB-003 rollback", "thrown callback errors propagate"));
  const rollbackCheck = await asUser(first.userId, (client) => client.query(
    "select 1 from workspace_categories where workspace_id = $1 and name = $2",
    [first.workspaceId, rolledBackCategory],
  ));
  await expect(rollbackCheck.rowCount === 0, "thrown errors roll back writes");

  const [concurrentFirst, concurrentSecond] = await Promise.all([
    asUser(first.userId, async (client) => {
      await client.query("select pg_sleep(0.05)");
      return client.query("select id from workspaces where id = $1", [first.workspaceId]);
    }),
    asUser(second.userId, async (client) => {
      await client.query("select pg_sleep(0.05)");
      return client.query("select id from workspaces where id = $1", [second.workspaceId]);
    }),
  ]);
  await expect(concurrentFirst.rowCount === 1 && concurrentSecond.rowCount === 1, "concurrent requests retain their own identities");

  const crossRead = await asUser(first.userId, (client) => client.query(
    "select id from workspaces where id = $1",
    [second.workspaceId],
  ));
  await expect(crossRead.rowCount === 0, "user A cannot read user B workspace through RLS");
  const crossWrite = await asUser(first.userId, (client) => client.query(
    "update workspaces set name = $1 where id = $2",
    [`DB-003 blocked ${suffix}`, second.workspaceId],
  ));
  await expect(crossWrite.rowCount === 0, "user A cannot mutate user B workspace through RLS");

  const client = await pool.connect();
  try {
    await auditPrivilegedFunctions(client);
  } finally {
    client.release();
  }

  // Each fixture owns only these rows; delete in FK order using the corresponding RLS identity.
  for (const fixture of fixtures.reverse()) {
    await asUser(fixture.userId, async (client) => {
      await client.query("delete from workspace_categories where workspace_id = $1", [fixture.workspaceId]);
      await client.query("delete from workspace_members where id = $1", [fixture.memberId]);
      await client.query("delete from workspaces where id = $1", [fixture.workspaceId]);
      await client.query("delete from users where id = $1", [fixture.userId]);
    });
  }
  console.log("DB-003 pooled-connection and RLS tests passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

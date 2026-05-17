import { randomUUID } from "node:crypto";
import process from "node:process";

import pg from "pg";

const { Pool } = pg;

const BYPASS_DATABASE_USERS = new Set([
  "postgres",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
]);

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to run the RLS smoke test.");
}

const parsedDatabaseUrl = new URL(databaseUrl);

if (
  BYPASS_DATABASE_USERS.has(parsedDatabaseUrl.username)
  && process.env.FINAPP_ALLOW_BYPASS_DATABASE_URL !== "1"
) {
  throw new Error(
    "Refusing to run against a bypass/admin database role. Use the normal hosted app role, or set FINAPP_ALLOW_BYPASS_DATABASE_URL=1 only for diagnosing setup.",
  );
}

const pool = new Pool({ connectionString: databaseUrl });

function testLabel(label) {
  return `rls-smoke-${label}-${randomUUID().slice(0, 8)}`;
}

async function setCurrentUser(client, userId) {
  await client.query("select set_config('app.current_user_id', $1, false)", [userId ?? ""]);
}

async function insertOne(client, text, values) {
  const result = await client.query(text, values);

  if (result.rowCount !== 1) {
    throw new Error(`Expected one inserted row for query: ${text}`);
  }

  return result.rows[0];
}

async function expectNoRows(client, label, text, values) {
  const result = await client.query(text, values);

  if (result.rowCount !== 0) {
    throw new Error(`${label}: expected 0 visible rows, saw ${result.rowCount}.`);
  }

  console.log(`ok - ${label}`);
}

async function expectPolicyBlock(client, label, text, values) {
  try {
    const result = await client.query(text, values);

    if (result.rowCount === 0) {
      console.log(`ok - ${label}`);
      return;
    }

    throw new Error(`${label}: expected RLS to block the write, but ${result.rowCount} row(s) changed.`);
  } catch (error) {
    if (error?.code === "42501") {
      console.log(`ok - ${label}`);
      return;
    }

    throw error;
  }
}

async function seedWorkspace(client, label) {
  const userId = randomUUID();

  await setCurrentUser(client, userId);

  const user = await insertOne(
    client,
    `
      insert into users (id, email, display_name)
      values ($1, $2, $3)
      returning id
    `,
    [userId, `${testLabel(label)}@example.test`, `${label} User`],
  );

  const workspace = await insertOne(
    client,
    `
      insert into workspaces (name, base_currency, country_code)
      values ($1, 'ILS', 'IL')
      returning id
    `,
    [testLabel(`${label}-workspace`)],
  );

  const member = await insertOne(
    client,
    `
      insert into workspace_members (workspace_id, user_id, role)
      values ($1, $2, 'owner')
      returning id
    `,
    [workspace.id, user.id],
  );

  const category = await insertOne(
    client,
    `
      insert into workspace_categories (workspace_id, name, canonical_name)
      values ($1, $2, $3)
      returning id
    `,
    [workspace.id, `${label} Groceries`, testLabel(`${label}-groceries`)],
  );

  const importSource = await insertOne(
    client,
    `
      insert into import_sources (type, name, country_code)
      values ('bank', $1, 'IL')
      returning id
    `,
    [testLabel(`${label}-source`)],
  );

  const importRow = await insertOne(
    client,
    `
      insert into imports (
        workspace_id,
        uploaded_by_user_id,
        import_source_id,
        type,
        file_kind,
        original_filename,
        storage_path,
        file_checksum,
        import_status
      )
      values ($1, $2, $3, 'bank', 'csv', $4, $5, $6, 'completed')
      returning id
    `,
    [
      workspace.id,
      user.id,
      importSource.id,
      `${label}.csv`,
      `tmp/rls-smoke/${label}.csv`,
      testLabel(`${label}-checksum`),
    ],
  );

  const account = await insertOne(
    client,
    `
      insert into financial_accounts (
        workspace_id,
        owner_member_id,
        account_type,
        display_name,
        import_source_id
      )
      values ($1, $2, 'checking', $3, $4)
      returning id
    `,
    [workspace.id, member.id, `${label} Checking`, importSource.id],
  );

  const transaction = await insertOne(
    client,
    `
      insert into transactions (
        workspace_id,
        account_id,
        import_id,
        transaction_date,
        description,
        original_currency,
        original_amount,
        workspace_currency,
        normalized_amount,
        direction,
        dedupe_hash
      )
      values ($1, $2, $3, '2026-01-15', $4, 'ILS', '100.000000', 'ILS', '100.000000', 'debit', $5)
      returning id
    `,
    [workspace.id, account.id, importRow.id, `${label} transaction`, testLabel(`${label}-tx`)],
  );

  const expenseEvent = await insertOne(
    client,
    `
      insert into expense_events (
        workspace_id,
        source_type,
        source_id,
        event_kind,
        title,
        total_amount,
        workspace_currency,
        classification_type,
        payer_member_id,
        category,
        reporting_mode
      )
      values ($1, 'transaction', $2, 'expense', $3, '100.000000', 'ILS', 'shared', $4, 'Groceries', 'payment_date')
      returning id
    `,
    [workspace.id, transaction.id, `${label} expense`, member.id],
  );

  const manualEntry = await insertOne(
    client,
    `
      insert into manual_entries (
        workspace_id,
        source_type,
        event_kind,
        title,
        original_currency,
        original_amount,
        workspace_currency,
        normalized_amount,
        payer_member_id,
        classification_type,
        category,
        event_date
      )
      values ($1, 'one_time_manual', 'expense', $2, 'ILS', '50.000000', 'ILS', '50.000000', $3, 'personal', 'Misc', '2026-01-20')
      returning id
    `,
    [workspace.id, `${label} manual entry`, member.id],
  );

  const investmentAccount = await insertOne(
    client,
    `
      insert into investment_accounts (
        workspace_id,
        owner_member_id,
        display_name,
        canonical_display_name,
        import_source_id,
        account_currency
      )
      values ($1, $2, $3, $4, $5, 'ILS')
      returning id
    `,
    [
      workspace.id,
      member.id,
      `${label} Brokerage`,
      testLabel(`${label}-brokerage`),
      importSource.id,
    ],
  );

  return {
    accountId: account.id,
    categoryId: category.id,
    expenseEventId: expenseEvent.id,
    importId: importRow.id,
    investmentAccountId: investmentAccount.id,
    manualEntryId: manualEntry.id,
    memberId: member.id,
    transactionId: transaction.id,
    userId: user.id,
    workspaceId: workspace.id,
  };
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query("begin");

    const first = await seedWorkspace(client, "first");
    const second = await seedWorkspace(client, "second");

    await setCurrentUser(client, first.userId);

    await expectNoRows(
      client,
      "user cannot read another workspace",
      "select id from workspaces where id = $1",
      [second.workspaceId],
    );
    await expectNoRows(
      client,
      "user cannot read another workspace member",
      "select id from workspace_members where id = $1",
      [second.memberId],
    );
    await expectNoRows(
      client,
      "user cannot read another workspace category",
      "select id from workspace_categories where id = $1",
      [second.categoryId],
    );
    await expectNoRows(
      client,
      "user cannot read another import",
      "select id from imports where id = $1",
      [second.importId],
    );
    await expectNoRows(
      client,
      "user cannot read another transaction",
      "select id from transactions where id = $1",
      [second.transactionId],
    );
    await expectNoRows(
      client,
      "user cannot read another manual entry",
      "select id from manual_entries where id = $1",
      [second.manualEntryId],
    );
    await expectNoRows(
      client,
      "user cannot read another investment account",
      "select id from investment_accounts where id = $1",
      [second.investmentAccountId],
    );

    await expectPolicyBlock(
      client,
      "user cannot insert into another workspace",
      `
        insert into workspace_categories (workspace_id, name, canonical_name)
        values ($1, 'Blocked', $2)
      `,
      [second.workspaceId, testLabel("blocked-category")],
    );
    await expectPolicyBlock(
      client,
      "user cannot update another workspace",
      "update workspaces set name = 'Blocked update' where id = $1",
      [second.workspaceId],
    );
    await expectPolicyBlock(
      client,
      "user cannot attach a transaction to another account/import",
      `
        insert into transactions (
          workspace_id,
          account_id,
          import_id,
          transaction_date,
          description,
          original_currency,
          original_amount,
          workspace_currency,
          normalized_amount,
          direction,
          dedupe_hash
        )
        values ($1, $2, $3, '2026-01-22', 'Blocked transaction', 'ILS', '1.000000', 'ILS', '1.000000', 'debit', $4)
      `,
      [first.workspaceId, second.accountId, second.importId, testLabel("blocked-tx")],
    );
    await expectPolicyBlock(
      client,
      "user cannot attach an allocation to another expense event",
      `
        insert into expense_allocations (
          expense_event_id,
          report_month,
          allocated_amount,
          allocation_method
        )
        values ($1, '2026-01-01', '1.000000', 'single_month')
      `,
      [second.expenseEventId],
    );

    await setCurrentUser(client, null);
    await expectNoRows(
      client,
      "anonymous database context cannot read workspaces",
      "select id from workspaces where id in ($1, $2)",
      [first.workspaceId, second.workspaceId],
    );

    await client.query("rollback");
    console.log("RLS isolation smoke test passed.");
  } catch (error) {
    await client.query("rollback").catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

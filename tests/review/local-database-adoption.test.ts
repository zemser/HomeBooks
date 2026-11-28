import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { promisify } from "node:util";
import pg from "pg";
// @ts-expect-error The bootstrap is a Node ESM script used by dev:local.
import { prepareLocalDatabase } from "../../scripts/local-database.mjs";

const testUrl = process.env.TEST_DATABASE_URL && new URL(process.env.TEST_DATABASE_URL);
const run = promisify(execFile);

test("dev:local adopts a current db:push household and installs the FX SQL objects once", {
  skip: !testUrl || !["localhost", "127.0.0.1", "[::1]"].includes(testUrl.hostname),
}, async () => {
  // Schema adoption requires an empty migration ledger. Isolate it from the other DB tests.
  const database = "fx_adoption_" + randomUUID().replaceAll("-", "");
  const url = new URL(testUrl!.toString());
  const admin = new pg.Client({ connectionString: url.href });
  url.pathname = "/" + database;
  const client = new pg.Client({ connectionString: url.href });

  await admin.connect();
  try {
    await admin.query(`create database ${database}`);
    try {
      await run(process.execPath, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"], {
        env: { ...process.env, DATABASE_URL: url.href },
        maxBuffer: 4 * 1024 * 1024,
      });
      await client.connect();
      try {
        const { rows: [household] } = await client.query(
          "insert into workspaces(name,base_currency) values('Existing household','ILS') returning *",
        );
        await prepareLocalDatabase(client, process.cwd());
        await prepareLocalDatabase(client, process.cwd());
        const { rows: [retained] } = await client.query("select * from workspaces where id=$1", [household.id]);
        assert.deepEqual(retained, household);
        const { rows: [installed] } = await client.query(`
          select to_regprocedure('app.request_missing_fx_rates(jsonb)') is not null as enqueue,
            exists(select from pg_constraint where conrelid='transactions'::regclass
              and conname='transactions_valuation_state_check') as valuation_check
        `);
        assert.deepEqual(installed, { enqueue: true, valuation_check: true });
      } finally {
        await client.end();
      }
    } finally {
      await admin.query(`drop database ${database}`);
    }
  } finally {
    await admin.end();
  }
});

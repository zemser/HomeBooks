import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "@/db/schema";
import { getCurrentDatabaseUserId } from "@/db/request-context";
import { getFinappAuthMode } from "@/lib/supabase/config";
import {
  recordDatabaseUnit,
  recordRlsSetup,
  recordSqlStatement,
  withTelemetrySpan,
} from "@/lib/telemetry/server";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;
let validatedConnectionString: string | undefined;

const globalForDb = globalThis as typeof globalThis & {
  finappPool?: Pool;
  finappDatabase?: NodePgDatabase<typeof schema>;
  finappDatabaseConnectionString?: string;
};

const wrappedClient = Symbol("finappWrappedClient");
const transactionScopedClient = Symbol("finappTransactionScopedClient");
const BYPASS_DATABASE_USERS = new Set([
  "postgres",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
]);

type WrappedPoolClient = PoolClient & {
  [wrappedClient]?: boolean;
  [transactionScopedClient]?: boolean;
};

/**
 * The only executor type repositories and services should need to know about.
 * A transaction executor has the same Drizzle query surface as the root DB,
 * while making its connection and RLS lifetime explicit at the unit boundary.
 */
type RootDb = NodePgDatabase<typeof schema>;
export type DbTransaction = Parameters<Parameters<RootDb["transaction"]>[0]>[0];
export type DbExecutor = RootDb | DbTransaction;

function getQueryText(query: unknown) {
  if (typeof query === "string") {
    return query;
  }

  if (
    query
    && typeof query === "object"
    && "text" in query
    && typeof query.text === "string"
  ) {
    return query.text;
  }

  return "";
}

function isTransactionControlQuery(query: unknown) {
  const normalizedQuery = getQueryText(query).trim().toLowerCase();

  return /^(begin|commit|rollback|savepoint|release savepoint|rollback to savepoint)\b/.test(
    normalizedQuery,
  );
}

function usesTransactionPooler(connectionString: string) {
  try {
    return new URL(connectionString).port === "6543";
  } catch {
    return false;
  }
}

function wrapClientForCurrentUser(client: PoolClient) {
  const scopedClient = client as WrappedPoolClient;

  if (scopedClient[wrappedClient]) {
    return scopedClient;
  }

  const originalQuery = scopedClient.query.bind(scopedClient);

  scopedClient.query = (async (...args: unknown[]) => {
    recordSqlStatement();
    if (!isTransactionControlQuery(args[0])) {
      const currentUserId = getCurrentDatabaseUserId();

      // A transaction may establish its identity explicitly at its boundary
      // (for example during first-user bootstrap). Do not erase that identity
      // merely because a framework callback crossed an async-context boundary.
      if (currentUserId && !scopedClient[transactionScopedClient]) {
        recordRlsSetup();
        await originalQuery("select set_config('app.current_user_id', $1, false)", [
          currentUserId,
        ]);
      }
    }

    return (originalQuery as (...queryArgs: unknown[]) => unknown)(...args);
  }) as PoolClient["query"];

  scopedClient[wrappedClient] = true;
  return scopedClient;
}

function createPool(connectionString: string) {
  const transactionPooler = usesTransactionPooler(connectionString);
  const nextPool = new Pool({
    connectionString,
    // Hosted Supabase session poolers have a small project-wide client limit.
    // Keep this configurable for deployments with a different connection budget,
    // but avoid pg's default of 10 connections per app process.
    max: getPoolMax(),
    idleTimeoutMillis: 10_000,
    // A sleeping hosted database or a busy serverless function can take longer
    // than ten seconds to hand out a connection. Failing the whole app shell
    // during that window makes a transient database wake-up look like an app
    // error. Keep this configurable for deployments with tighter limits.
    connectionTimeoutMillis: getConnectionTimeoutMillis(),
  });
  const originalConnect = nextPool.connect.bind(nextPool);

  nextPool.connect = (async () => {
    const client = await withTelemetrySpan<PoolClient>(
      "db.pool-acquire",
      () => originalConnect(),
    );
    recordDatabaseUnit();
    // Reset pooled connections before handing them to a request. This keeps
    // the preservation above safe when the previous request belonged to a
    // different authenticated user.
    await client.query("select set_config('app.current_user_id', '', false)");
    return wrapClientForCurrentUser(client);
  }) as Pool["connect"];

  nextPool.query = (async (...args: unknown[]) => {
    const client = await nextPool.connect();

    if (!transactionPooler) {
      try {
        return await (client.query as (...queryArgs: unknown[]) => unknown)(...args);
      } finally {
        client.release();
      }
    }

    try {
      await client.query("begin");
      const result = await (client.query as (...queryArgs: unknown[]) => unknown)(...args);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }) as Pool["query"];

  return nextPool;
}

function getConnectionTimeoutMillis() {
  const configuredTimeout = Number(
    process.env.FINAPP_DB_CONNECTION_TIMEOUT_MS ?? "30000",
  );

  if (!Number.isInteger(configuredTimeout) || configuredTimeout < 1_000) {
    throw new Error("FINAPP_DB_CONNECTION_TIMEOUT_MS must be an integer of at least 1000.");
  }

  return configuredTimeout;
}

function getPoolMax() {
  const isServerless =
    process.env.VERCEL === "1"
    || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME)
    || Boolean(process.env.FUNCTIONS_WORKER_RUNTIME);
  const configuredMax = Number(
    process.env.FINAPP_DB_POOL_MAX ?? (isServerless ? "1" : "4"),
  );

  if (!Number.isInteger(configuredMax) || configuredMax < 1) {
    throw new Error("FINAPP_DB_POOL_MAX must be a positive integer.");
  }

  return configuredMax;
}

function assertHostedDatabaseRole(connectionString: string) {
  if (
    getFinappAuthMode() !== "supabase"
    || process.env.FINAPP_ALLOW_BYPASS_DATABASE_URL === "1"
  ) {
    return;
  }

  let username = "";

  try {
    username = new URL(connectionString).username;
  } catch {
    throw new Error("DATABASE_URL must be a valid URL.");
  }

  if (BYPASS_DATABASE_USERS.has(username)) {
    throw new Error(
      "Hosted app traffic must use a non-bypass database role so Postgres RLS is enforced. Use admin/postgres credentials only for migrations or maintenance, or set FINAPP_ALLOW_BYPASS_DATABASE_URL=1 for a one-off maintenance process.",
    );
  }
}

export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (validatedConnectionString !== connectionString) {
    assertHostedDatabaseRole(connectionString);
    validatedConnectionString = connectionString;
  }

  if (!pool) {
    pool =
      globalForDb.finappDatabaseConnectionString === connectionString
        ? globalForDb.finappPool
        : undefined;
  }

  if (!pool) {
    pool = createPool(connectionString);
    globalForDb.finappPool = pool;
    globalForDb.finappDatabaseConnectionString = connectionString;
  }

  if (!database) {
    database =
      globalForDb.finappDatabaseConnectionString === connectionString
        ? globalForDb.finappDatabase
        : undefined;
  }

  if (!database) {
    database = drizzle(pool, { schema });
    globalForDb.finappDatabase = database;
  }

  return database;
}

/**
 * Run one short database unit with one connection and one transaction-local
 * RLS identity. The callback must contain database work only; Auth, Storage,
 * parsing, and other network work belong before or after this boundary.
 */
export async function withDbTransaction<T>(
  currentUserId: string,
  callback: (executor: DbExecutor) => Promise<T>,
) {
  const client = (await getPool().connect()) as WrappedPoolClient;
  client[transactionScopedClient] = true;

  return withTelemetrySpan("db.transaction", async () => {
    try {
      await client.query("begin");
      recordRlsSetup();
      await client.query(
        "select set_config('app.current_user_id', $1, true)",
        [currentUserId],
      );

      const executor = drizzle(client, { schema });
      const result = await callback(executor);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client[transactionScopedClient] = false;
      client.release();
    }
  });
}

function getPool() {
  // getDb() owns validation and lazy initialization; the executor shares the
  // same pool without exposing it to repositories or services.
  getDb();
  if (!pool) {
    throw new Error("Database pool was not initialized.");
  }
  return pool;
}

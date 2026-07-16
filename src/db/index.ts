import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";

import * as schema from "@/db/schema";
import { getCurrentDatabaseUserId } from "@/db/request-context";
import { getFinappAuthMode } from "@/lib/supabase/config";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;
let validatedConnectionString: string | undefined;

const globalForDb = globalThis as typeof globalThis & {
  finappPool?: Pool;
  finappDatabase?: NodePgDatabase<typeof schema>;
  finappDatabaseConnectionString?: string;
};

const wrappedClient = Symbol("finappWrappedClient");
const BYPASS_DATABASE_USERS = new Set([
  "postgres",
  "service_role",
  "supabase_admin",
  "supabase_auth_admin",
  "supabase_storage_admin",
]);

type WrappedPoolClient = PoolClient & {
  [wrappedClient]?: boolean;
};

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

function wrapClientForCurrentUser(client: PoolClient) {
  const scopedClient = client as WrappedPoolClient;

  if (scopedClient[wrappedClient]) {
    return scopedClient;
  }

  const originalQuery = scopedClient.query.bind(scopedClient);

  scopedClient.query = (async (...args: unknown[]) => {
    if (!isTransactionControlQuery(args[0])) {
      const currentUserId = getCurrentDatabaseUserId();

      await originalQuery("select set_config('app.current_user_id', $1, false)", [
        currentUserId ?? "",
      ]);
    }

    return (originalQuery as (...queryArgs: unknown[]) => unknown)(...args);
  }) as PoolClient["query"];

  scopedClient[wrappedClient] = true;
  return scopedClient;
}

function createPool(connectionString: string) {
  const nextPool = new Pool({
    connectionString,
    // Hosted Supabase session poolers have a small project-wide client limit.
    // Keep this configurable for deployments with a different connection budget,
    // but avoid pg's default of 10 connections per app process.
    max: getPoolMax(),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  const originalConnect = nextPool.connect.bind(nextPool);

  nextPool.connect = (async () => {
    const client = await originalConnect();
    return wrapClientForCurrentUser(client);
  }) as Pool["connect"];

  nextPool.query = (async (...args: unknown[]) => {
    const client = await nextPool.connect();

    try {
      return await (client.query as (...queryArgs: unknown[]) => unknown)(...args);
    } finally {
      client.release();
    }
  }) as Pool["query"];

  return nextPool;
}

function getPoolMax() {
  const configuredMax = Number(process.env.FINAPP_DB_POOL_MAX ?? "4");

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

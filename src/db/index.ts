import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "@/db/schema";

let pool: Pool | undefined;
let database: NodePgDatabase<typeof schema> | undefined;

export function getDb() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
    });
  }

  if (!database) {
    database = drizzle(pool, { schema });
  }

  return database;
}

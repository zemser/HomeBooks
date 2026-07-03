import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import pg from "pg";

import {
  getFailedImportFileTtlHours,
  getSupabaseImportStorageConfig,
  requireEnv,
} from "./import-storage-env.mjs";
import { noRealtimeOptions } from "./noop-websocket.mjs";

const { Pool } = pg;

const databaseUrl = requireEnv("DATABASE_URL");
const { bucketName, supabaseSecretKey, supabaseUrl } = getSupabaseImportStorageConfig();
const ttlHours = getFailedImportFileTtlHours();
const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000);
const dryRun = process.env.FINAPP_IMPORT_CLEANUP_DRY_RUN === "1";

const pool = new Pool({ connectionString: databaseUrl });
const supabase = createClient(supabaseUrl, supabaseSecretKey, {
  ...noRealtimeOptions,
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

try {
  const { rows } = await pool.query(
    `
      select id, storage_path
      from imports
      where import_status = 'failed'
        and storage_path like 'tmp/%'
        and coalesce(completed_at, updated_at, created_at) < $1
      order by coalesce(completed_at, updated_at, created_at)
    `,
    [cutoff],
  );

  if (rows.length === 0) {
    console.log(`No failed import source files older than ${ttlHours} hour(s) to clean.`);
  } else if (dryRun) {
    console.log(`Dry run: would delete ${rows.length} failed import source file(s).`);
    rows.forEach((row) => {
      console.log(`${row.id} ${row.storage_path}`);
    });
  } else {
    const storagePaths = rows.map((row) => row.storage_path);
    const { error } = await supabase.storage.from(bucketName).remove(storagePaths);

    if (error) {
      throw new Error(`Supabase failed-import cleanup failed: ${error.message}`);
    }

    console.log(`Deleted ${storagePaths.length} failed import source file(s).`);
  }
} finally {
  await pool.end();
}

import process from "node:process";

import "./load-env.mjs";

const DEFAULT_SUPABASE_IMPORT_BUCKET = "import-files";
const DEFAULT_FAILED_IMPORT_FILE_TTL_HOURS = 24;

export function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getSupabaseImportStorageConfig() {
  return {
    bucketName: process.env.SUPABASE_IMPORT_BUCKET || DEFAULT_SUPABASE_IMPORT_BUCKET,
    supabaseSecretKey: requireEnv("SUPABASE_SECRET_KEY"),
    supabaseUrl: requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
  };
}

export function getFailedImportFileTtlHours() {
  const rawValue = process.env.FINAPP_FAILED_IMPORT_FILE_TTL_HOURS;

  if (!rawValue) {
    return DEFAULT_FAILED_IMPORT_FILE_TTL_HOURS;
  }

  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error("FINAPP_FAILED_IMPORT_FILE_TTL_HOURS must be a positive number.");
  }

  return parsed;
}

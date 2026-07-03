import process from "node:process";

import "./load-env.mjs";

export function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function getLibpqCompatibleDatabaseUrl(databaseUrl) {
  const parsed = new URL(databaseUrl);

  parsed.searchParams.delete("uselibpqcompat");

  return parsed.toString();
}

export function getBackupCreateConfig() {
  return {
    backupDir: requireEnv("FINAPP_BACKUP_DIR"),
    databaseUrl: getLibpqCompatibleDatabaseUrl(requireEnv("FINAPP_BACKUP_DATABASE_URL")),
    recipient: requireEnv("FINAPP_BACKUP_RECIPIENT"),
  };
}

export function getBackupFile() {
  return requireEnv("FINAPP_BACKUP_FILE");
}

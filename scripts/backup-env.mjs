import process from "node:process";

export function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

export function getBackupCreateConfig() {
  return {
    backupDir: requireEnv("FINAPP_BACKUP_DIR"),
    databaseUrl: requireEnv("FINAPP_BACKUP_DATABASE_URL"),
    recipient: requireEnv("FINAPP_BACKUP_RECIPIENT"),
  };
}

export function getBackupFile() {
  return requireEnv("FINAPP_BACKUP_FILE");
}


import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";

import { getBackupCreateConfig } from "./backup-env.mjs";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} failed with ${signal || `exit code ${code}`}.`));
    });
  });
}

async function createBackup() {
  const { backupDir, databaseUrl, recipient } = getBackupCreateConfig();
  const timestamp = new Date().toISOString().replaceAll(":", "").replaceAll("-", "").replace(/\.\d{3}Z$/, "Z");
  const backupName = `finapp-${timestamp}.dump`;
  const rawBackupPath = path.join(backupDir, backupName);
  const encryptedBackupPath = `${rawBackupPath}.gpg`;
  const checksumPath = `${encryptedBackupPath}.sha256`;

  await mkdir(backupDir, { recursive: true, mode: 0o700 });

  try {
    await run("pg_dump", [
      databaseUrl,
      "--format=custom",
      "--no-owner",
      "--no-acl",
      `--file=${rawBackupPath}`,
    ]);

    await run("gpg", [
      "--batch",
      "--yes",
      "--trust-model",
      "always",
      "--encrypt",
      "--recipient",
      recipient,
      "--output",
      encryptedBackupPath,
      rawBackupPath,
    ]);

    const checksumChild = spawn("shasum", ["-a", "256", encryptedBackupPath], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const checksumChunks = [];
    checksumChild.stdout.on("data", (chunk) => checksumChunks.push(chunk));
    await new Promise((resolve, reject) => {
      checksumChild.on("error", reject);
      checksumChild.on("exit", (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(new Error(`shasum failed with exit code ${code}.`));
      });
    });

    await writeFile(checksumPath, Buffer.concat(checksumChunks));

    console.log(`Encrypted backup: ${encryptedBackupPath}`);
    console.log(`Checksum: ${checksumPath}`);
  } finally {
    await rm(rawBackupPath, { force: true });
  }
}

await createBackup().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

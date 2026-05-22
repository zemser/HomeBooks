import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";

import { getBackupFile } from "./backup-env.mjs";

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

async function verifyChecksumIfPresent(backupFile) {
  const checksumFile = `${backupFile}.sha256`;

  try {
    await access(checksumFile);
  } catch {
    console.warn(`No checksum file found at ${checksumFile}; skipping checksum verification.`);
    return;
  }

  await run("shasum", ["-a", "256", "--check", checksumFile], {
    cwd: path.dirname(backupFile),
  });
}

async function verifyCatalog(backupFile) {
  const tempDir = await mkdtemp(path.join(tmpdir(), "finapp-backup-"));
  const listPath = path.join(tempDir, "restore-list.txt");

  try {
    const gpg = spawn("gpg", ["--decrypt", backupFile], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const pgRestore = spawn("pg_restore", ["--list", `--file=${listPath}`], {
      stdio: ["pipe", "inherit", "inherit"],
    });

    gpg.stdout.pipe(pgRestore.stdin);

    await Promise.all([
      new Promise((resolve, reject) => {
        gpg.on("error", reject);
        gpg.on("exit", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`gpg failed with exit code ${code}.`));
        });
      }),
      new Promise((resolve, reject) => {
        pgRestore.on("error", reject);
        pgRestore.on("exit", (code) => {
          if (code === 0) {
            resolve();
            return;
          }

          reject(new Error(`pg_restore failed with exit code ${code}.`));
        });
      }),
    ]);

    const restoreList = await readFile(listPath, "utf8");
    console.log("Backup catalog is readable. First entries:");
    console.log(restoreList.split("\n").slice(0, 20).join("\n"));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function verifyBackup() {
  const backupFile = getBackupFile();

  await verifyChecksumIfPresent(backupFile);
  await verifyCatalog(backupFile);
}

await verifyBackup()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

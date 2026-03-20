import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function buildImportStoragePath(input: {
  workspaceId: string;
  importId: string;
  filename: string;
}) {
  return path.join(
    process.cwd(),
    "data",
    "uploads",
    input.workspaceId,
    input.importId,
    sanitizeFilename(input.filename),
  );
}

export async function writeImportFile(input: {
  storagePath: string;
  fileBuffer: Buffer;
}) {
  await mkdir(path.dirname(input.storagePath), { recursive: true });
  await writeFile(input.storagePath, input.fileBuffer);
}

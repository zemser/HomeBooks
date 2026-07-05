import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ImportFileKind } from "@/features/imports/types";

type ImportStorageMode = "local" | "supabase";

const DEFAULT_SUPABASE_IMPORT_BUCKET = "import-files";
const SUPABASE_TEMP_IMPORT_PREFIX = "tmp";

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getImportStorageMode(): ImportStorageMode {
  return process.env.FINAPP_IMPORT_STORAGE === "supabase" ? "supabase" : "local";
}

function getSupabaseImportBucket() {
  return process.env.SUPABASE_IMPORT_BUCKET || DEFAULT_SUPABASE_IMPORT_BUCKET;
}

function getImportFileContentType(fileKind: ImportFileKind) {
  if (fileKind === "xlsx") {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "text/csv";
}

export function buildImportStoragePath(input: {
  workspaceId: string;
  importId: string;
  filename: string;
}) {
  if (getImportStorageMode() === "supabase") {
    return [
      SUPABASE_TEMP_IMPORT_PREFIX,
      "workspaces",
      input.workspaceId,
      "imports",
      input.importId,
      sanitizeFilename(input.filename),
    ].join("/");
  }

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
  fileKind: ImportFileKind;
}) {
  if (getImportStorageMode() === "supabase") {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.storage
      .from(getSupabaseImportBucket())
      .upload(input.storagePath, input.fileBuffer, {
        contentType: getImportFileContentType(input.fileKind),
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase import upload failed: ${error.message}`);
    }

    return;
  }

  await mkdir(path.dirname(input.storagePath), { recursive: true });
  await writeFile(input.storagePath, input.fileBuffer);
}

export async function deleteImportFileAfterSuccessfulPersistence(storagePath: string) {
  if (getImportStorageMode() !== "supabase") {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage.from(getSupabaseImportBucket()).remove([storagePath]);

  if (error) {
    throw new Error(`Supabase import cleanup failed: ${error.message}`);
  }
}

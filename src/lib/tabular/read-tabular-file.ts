import { parse } from "csv-parse/sync";

import type { ImportFileKind, WorkbookData, WorkbookSheet } from "@/features/imports/types";
import { readWorkbookFromBuffer } from "@/lib/excel/read-workbook";

function inferFileKind(filename: string): ImportFileKind {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx")) {
    return "xlsx";
  }

  if (lower.endsWith(".csv")) {
    return "csv";
  }

  throw new Error("Only .xlsx and .csv files are supported right now");
}

function readCsvFromBuffer(input: { buffer: ArrayBuffer; filename: string }): WorkbookData {
  const text = Buffer.from(input.buffer).toString("utf8").replace(/^\uFEFF/, "");
  const rows = parse(text, {
    bom: true,
    columns: false,
    relaxColumnCount: true,
    skipEmptyLines: false,
    trim: false,
  }) as (string | number | boolean | null)[][];

  const sheet: WorkbookSheet = {
    name: "Sheet1",
    rows,
  };

  return {
    fileKind: "csv",
    filename: input.filename,
    sheets: [sheet],
  };
}

export function readTabularFileFromBuffer(input: {
  buffer: ArrayBuffer;
  filename: string;
}): WorkbookData {
  const kind = inferFileKind(input.filename);

  if (kind === "xlsx") {
    return readWorkbookFromBuffer(input);
  }

  return readCsvFromBuffer(input);
}


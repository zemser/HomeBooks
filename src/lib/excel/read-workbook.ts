import * as XLSX from "xlsx";

import type { WorkbookData, WorkbookSheet } from "@/features/imports/types";

function sheetToRows(workbook: XLSX.WorkBook, sheetName: string): WorkbookSheet {
  const worksheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<(string | number | boolean | Date | null)[]>(worksheet, {
    header: 1,
    defval: null,
    raw: true,
  });

  return {
    name: sheetName,
    rows,
  };
}

export function readWorkbookFromBuffer(input: {
  buffer: ArrayBuffer;
  filename: string;
}): WorkbookData {
  const workbook = XLSX.read(input.buffer, {
    type: "array",
    cellDates: true,
  });

  return {
    fileKind: "xlsx",
    filename: input.filename,
    sheets: workbook.SheetNames.map((sheetName) => sheetToRows(workbook, sheetName)),
  };
}


import * as XLSX from "xlsx";

const INVALID_SHEET_NAME = /[\[\]:*?/\\]/;

export type WorkbookSheetInput = {
  name: string;
  rows: Array<Array<string | number | boolean | null>>;
};

export function writeWorkbookToBuffer(sheets: WorkbookSheetInput[]) {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    if (sheet.name.length === 0 || sheet.name.length > 31 || INVALID_SHEET_NAME.test(sheet.name)) {
      throw new Error("Excel sheet names must be 1-31 characters and cannot include []:*?/\\.");
    }

    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

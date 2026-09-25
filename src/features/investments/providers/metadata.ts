import type { WorkbookSheet } from "@/features/imports/types";
import { normalizeRow } from "@/features/imports/utils";
import { findMatchingHeaderRowIndex, normalizeMetadataValue, parseSlashDateToIso } from "@/features/investments/utils";

export function findPrefixedValue(rows: string[][], prefix: string) {
  for (const row of rows) {
    for (const cell of row) {
      const value = normalizeMetadataValue(cell, prefix);

      if (value) {
        return value;
      }
    }
  }

  return null;
}

export function findSnapshotDate(rows: string[][], prefixes: readonly string[]) {
  for (const prefix of prefixes) {
    const value = findPrefixedValue(rows, prefix);
    const snapshotDate = value ? parseSlashDateToIso(value) : null;

    if (snapshotDate) {
      return {
        snapshotDate,
        snapshotTimestampText: value,
      };
    }
  }

  return {
    snapshotDate: null,
    snapshotTimestampText: null,
  };
}

export function columnIndex(header: string[], name: string) {
  const index = header.findIndex((cell) => cell === name);

  if (index === -1) {
    throw new Error(`Missing column "${name}".`);
  }

  return index;
}

export function columnIndexByPrefix(header: string[], prefix: string) {
  const index = header.findIndex((cell) => cell.startsWith(prefix));

  if (index === -1) {
    throw new Error(`Missing column starting with "${prefix}".`);
  }

  return index;
}

export function sheetWithHeader(sheets: WorkbookSheet[], expectedHeader: readonly string[]) {
  return (
    sheets.find((sheet) => findMatchingHeaderRowIndex(sheet.rows, expectedHeader) !== -1) ?? null
  );
}

export function normalizedSheetRows(sheet: WorkbookSheet) {
  return sheet.rows.map((row) => normalizeRow(row));
}

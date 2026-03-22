import type { TabularRow } from "@/features/imports/types";
import { normalizeRow, parseNumber } from "@/features/imports/utils";

function normalizeOptionalText(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "-") {
    return null;
  }

  return trimmed;
}

export function investmentHeaderIncludes(row: string[], expected: readonly string[]) {
  return expected.every((cell) => row.includes(cell));
}

export function parseInvestmentNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = parseNumber(value as string | number | boolean | Date | null | undefined);
  return parsed ?? null;
}

export function parseInvestmentTextCell(row: string[], index: number) {
  return normalizeOptionalText(row[index] ?? null);
}

export function findMatchingHeaderRowIndex(
  rows: TabularRow[],
  expectedHeader: readonly string[],
) {
  return rows.findIndex((row) => investmentHeaderIncludes(normalizeRow(row), expectedHeader));
}

export function parseSlashDateToIso(value: string) {
  const match = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

export function extractTimestampText(value: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    return null;
  }

  const colonIndex = normalized.indexOf(":");
  if (colonIndex === -1) {
    return normalized;
  }

  return normalizeOptionalText(normalized.slice(colonIndex + 1));
}

export function normalizeMetadataValue(value: string, prefix: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized || !normalized.startsWith(prefix)) {
    return null;
  }

  return normalizeOptionalText(normalized.slice(prefix.length));
}

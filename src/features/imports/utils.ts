import type { TabularCell, TabularRow } from "@/features/imports/types";

export function normalizeCell(input: TabularCell): string {
  if (input === null || input === undefined) {
    return "";
  }

  if (input instanceof Date) {
    return input.toISOString().slice(0, 10);
  }

  return String(input).trim();
}

export function normalizeRow(row: TabularRow): string[] {
  return row.map(normalizeCell);
}

export function findFirstRowIndex(
  rows: TabularRow[],
  predicate: (row: string[]) => boolean,
): number {
  return rows.findIndex((row) => predicate(normalizeRow(row)));
}

export function parseDate(value: TabularCell): string | undefined {
  if (!value) {
    return undefined;
  }

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const normalized = String(value).trim().replace(/\//g, "-");
  const match = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);

  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month}-${day}`;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return normalized;
  }

  return undefined;
}

export function parseNumber(value: TabularCell): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  if (typeof value === "number") {
    return value;
  }

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/\s/g, "")
    .trim();

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function mapCurrencySymbol(input: string | undefined): string {
  if (!input) {
    return "ILS";
  }

  const value = input.trim().toUpperCase();
  if (value === "₪" || value === "ILS") {
    return "ILS";
  }

  if (value === "$" || value === "USD") {
    return "USD";
  }

  if (value === "€" || value === "EUR") {
    return "EUR";
  }

  if (value === "GBP" || value === "£") {
    return "GBP";
  }

  if (value === "JPY" || value === "¥") {
    return "JPY";
  }

  return value;
}

export function isEffectivelyEmptyRow(row: TabularRow): boolean {
  return normalizeRow(row).every((cell) => cell === "");
}


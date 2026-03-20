import { addMonths, listMonthsBetween, monthKey, startOfMonth } from "@/lib/dates/months";

export function normalizeMonthString(value: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(trimmed)) {
    throw new Error("Month values must use YYYY-MM format.");
  }

  const normalized = trimmed.length === 7 ? `${trimmed}-01` : trimmed;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Month values must be valid dates.");
  }

  return monthKey(parsed);
}

export function currentMonthString() {
  return monthKey(startOfMonth(new Date()));
}

export function previousMonthString(value: string) {
  return monthKey(addMonths(new Date(`${normalizeMonthString(value)}T00:00:00.000Z`), -1));
}

export function listMonthStringsBetween(startMonth: string, endMonth: string) {
  return listMonthsBetween(
    new Date(`${normalizeMonthString(startMonth)}T00:00:00.000Z`),
    new Date(`${normalizeMonthString(endMonth)}T00:00:00.000Z`),
  ).map((month) => monthKey(month));
}

export function monthLabel(value: string) {
  const parsed = new Date(`${normalizeMonthString(value)}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

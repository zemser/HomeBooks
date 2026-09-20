export type MonthKey = `${number}-${string}-01`;

function toUtcMonthStart(year: number, monthIndex: number): Date {
  return new Date(Date.UTC(year, monthIndex, 1));
}

export function startOfMonth(input: Date): Date {
  return toUtcMonthStart(input.getUTCFullYear(), input.getUTCMonth());
}

export function addMonths(input: Date, amount: number): Date {
  return toUtcMonthStart(input.getUTCFullYear(), input.getUTCMonth() + amount);
}

export function monthKey(input: Date): MonthKey {
  const year = input.getUTCFullYear();
  const month = String(input.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

export function yearMonth(input: Date): string {
  return monthKey(startOfMonth(input)).slice(0, 7);
}

export function localYearMonth(input: Date = new Date()): string {
  const year = input.getFullYear();
  const month = String(input.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function shiftYearMonth(value: string, amount: number): string {
  const normalized = /^\d{4}-\d{2}$/.test(value.trim()) ? `${value.trim()}-01` : value.trim();
  return yearMonth(addMonths(new Date(`${normalized}T00:00:00.000Z`), amount));
}

export function formatYearMonthLabel(value: string): string {
  const key = value.slice(0, 7);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}-01T00:00:00.000Z`));
}

export function earliestYearMonth(months: string[]): string | null {
  if (months.length === 0) return null;
  return months.reduce((earliest, month) =>
    month.localeCompare(earliest) < 0 ? month : earliest,
  );
}

export function latestNavigableYearMonth(defaultMonth: string, now: Date = new Date()): string {
  const current = localYearMonth(now);
  return defaultMonth.localeCompare(current) >= 0 ? defaultMonth : current;
}

export function listMonthsBetween(start: Date, end: Date): Date[] {
  const safeStart = startOfMonth(start);
  const safeEnd = startOfMonth(end);

  if (safeStart > safeEnd) {
    throw new Error("Start month must be before end month");
  }

  const months: Date[] = [];
  let cursor = safeStart;

  while (cursor <= safeEnd) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }

  return months;
}

export function trailingMonths(endMonth: Date, count: number): Date[] {
  if (count <= 0) {
    throw new Error("Count must be positive");
  }

  const end = startOfMonth(endMonth);
  const start = addMonths(end, -(count - 1));
  return listMonthsBetween(start, end);
}


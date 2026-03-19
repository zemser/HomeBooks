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


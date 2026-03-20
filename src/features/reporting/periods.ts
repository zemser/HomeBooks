import { listMonthsBetween, monthKey, startOfMonth, trailingMonths } from "@/lib/dates/months";

export type ReportingPeriodType = "month" | "quarter" | "year" | "rolling12";

export type ReportingWindow = {
  periodType: ReportingPeriodType;
  periodStart: string;
  periodEnd: string;
  includedMonths: string[];
};

export function buildRollingTwelveWindow(referenceMonth: Date): ReportingWindow {
  const months = trailingMonths(referenceMonth, 12);
  const first = startOfMonth(months[0]);
  const last = startOfMonth(months[months.length - 1]);

  return {
    periodType: "rolling12",
    periodStart: monthKey(first),
    periodEnd: monthKey(last),
    includedMonths: months.map(monthKey),
  };
}

export function buildYearToDateWindow(referenceMonth: Date): ReportingWindow {
  const end = startOfMonth(referenceMonth);
  const start = new Date(Date.UTC(end.getUTCFullYear(), 0, 1));
  const months = listMonthsBetween(start, end);

  return {
    periodType: "year",
    periodStart: monthKey(start),
    periodEnd: monthKey(end),
    includedMonths: months.map(monthKey),
  };
}

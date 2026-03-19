import { monthKey, startOfMonth, trailingMonths } from "@/lib/dates/months";

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

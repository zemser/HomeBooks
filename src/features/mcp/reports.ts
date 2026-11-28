import { z } from "zod/v4";
import { buildReportHistoryHref, buildReportsHref } from "@/features/reporting/line-item-slice";
import { getCategoryLabel, reportCategoryKey, REPORTING_VIEW_MODES, subtractMoney } from "@/features/reporting/report-values";
import type { MonthlyReportData } from "@/features/reporting/monthly-report";
import { localYearMonth, shiftYearMonth } from "@/lib/dates/months";

const month = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const common = { month, mode: z.enum(REPORTING_VIEW_MODES).default("payment_date") };
export const compareArgs = z.object({ ...common, month: month.optional() }).strict();
export const itemsArgs = z.object({
  ...common,
  kind: z.enum(["expense", "income"]).default("expense"),
  categoryKey: z.string().min(1).optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(25),
}).strict();

export function comparisonMonths(selected = localYearMonth()) {
  return { current: selected, previous: shiftYearMonth(selected, -1) };
}

function monthSummary(report: MonthlyReportData) {
  const { selectedMonth, reportingMode } = report.summary;
  return {
    ...report.summary,
    completeness: report.completeness,
    reportPath: buildReportsHref("month", selectedMonth, reportingMode),
  };
}

export function compareReports(previous: MonthlyReportData, current: MonthlyReportData) {
  const categories = new Map<string, { categoryKey: string; category: string; previous: number; current: number }>();
  for (const [period, report] of [["previous", previous], ["current", current]] as const) {
    for (const row of report.categoryScopeBreakdown) {
      const key = reportCategoryKey(row.categoryId, row.category);
      const amounts = categories.get(key) ?? { categoryKey: key, category: row.category, previous: 0, current: 0 };
      amounts.category = row.category;
      amounts[period] = row.expenseTotal;
      categories.set(key, amounts);
    }
  }
  return {
    previous: monthSummary(previous),
    current: monthSummary(current),
    change: {
      spending: subtractMoney(current.summary.expenseTotal, previous.summary.expenseTotal),
      income: subtractMoney(current.summary.incomeTotal, previous.summary.incomeTotal),
      savings: subtractMoney(current.summary.savingsTotal, previous.summary.savingsTotal),
    },
    spendingByCategory: Array.from(categories.values(), row => ({
      ...row, change: subtractMoney(row.current, row.previous),
    })).sort((a, b) => Math.abs(b.change) - Math.abs(a.change) || a.categoryKey.localeCompare(b.categoryKey)),
  };
}

export function listItems(report: MonthlyReportData, args: z.infer<typeof itemsArgs>) {
  const matching = report.lineItems.filter(item =>
    item.direction === args.kind &&
    (args.kind === "income" || item.classificationType === "personal" || item.classificationType === "shared") &&
    (!args.categoryKey || reportCategoryKey(item.categoryId, item.category) === args.categoryKey)
  ).sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.id.localeCompare(b.id));
  const end = args.offset + args.limit;
  return {
    month: args.month, mode: args.mode, currency: report.summary.workspaceCurrency,
    completeness: report.completeness,
    reportPath: buildReportsHref("month", args.month, args.mode, { kind: args.kind }, true),
    totalRows: matching.length, nextOffset: end < matching.length ? end : null,
    items: matching.slice(args.offset, end).map(item => ({
      id: item.id, sourceKind: item.sourceKind, sourceRecordId: item.sourceRecordId,
      title: item.title, date: item.eventDate, sourceDate: item.sourceEventDate,
      amount: item.normalizedAmount, sourceAmount: item.sourceNormalizedAmount, category: getCategoryLabel(item.category),
      referenceMonth: item.fxDetails?.referenceMonth ?? null,
      scope: item.classificationType, historyPath: buildReportHistoryHref(item),
    })),
  };
}

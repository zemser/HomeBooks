import { and, eq, gte, lt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenseAllocations,
  expenseEvents,
  manualEntries,
  transactionClassifications,
  transactions,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import { materializeRecurringEntriesForRange } from "@/features/recurring/service";
import {
  buildRollingTwelveWindow,
  buildYearToDateWindow,
} from "@/features/reporting/periods";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import {
  addMonths,
  listMonthsBetween,
  monthKey,
  type MonthKey,
  startOfMonth,
} from "@/lib/dates/months";

type ReportDirection = "income" | "expense";

export const REPORTING_VIEW_MODES = ["payment_date", "allocated_period"] as const;
export type ReportingViewMode = (typeof REPORTING_VIEW_MODES)[number];

export type MonthlyReportSummary = {
  selectedMonth: string;
  reportingMode: ReportingViewMode;
  workspaceCurrency: string;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  importedTransactionCount: number;
  manualEntryCount: number;
};

export type MonthlyCategoryBreakdownItem = {
  category: string;
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  itemCount: number;
};

export type MonthlyMemberBreakdownItem = {
  memberId: string | null;
  memberName: string;
  incomeTotal: number;
  expenseTotal: number;
  netTotal: number;
  itemCount: number;
};

export type MonthlyReportLineItem = {
  id: string;
  sourceKind: "imported_transaction" | "one_time_manual" | "recurring_generated";
  sourceRecordId: string | null;
  title: string;
  eventDate: string;
  direction: ReportDirection;
  normalizedAmount: number;
  workspaceCurrency: string;
  classificationType: ClassificationType;
  category: string | null;
  memberName: string | null;
  fxDetails: {
    originalAmount: number;
    originalCurrency: string | null;
    settlementAmount: number | null;
    settlementCurrency: string | null;
    normalizationRateSource: string | null;
  } | null;
};

export type MonthlyReportData = {
  summary: MonthlyReportSummary;
  categoryBreakdown: MonthlyCategoryBreakdownItem[];
  memberBreakdown: MonthlyMemberBreakdownItem[];
  lineItems: MonthlyReportLineItem[];
};

export type ReportingMonthBucket = {
  month: string;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  itemCount: number;
  importedTransactionCount: number;
  manualEntryCount: number;
};

export type ReportingPeriodSummary = {
  selectedMonth: string;
  reportingMode: ReportingViewMode;
  periodStartMonth: string;
  periodEndMonth: string;
  workspaceCurrency: string;
  monthCount: number;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  averageMonthlyIncome: number;
  averageMonthlyExpense: number;
  averageMonthlySavings: number;
  importedTransactionCount: number;
  manualEntryCount: number;
};

export type YearToDateReportData = {
  summary: ReportingPeriodSummary;
  months: ReportingMonthBucket[];
};

export type RollingTwelveReportData = {
  summary: ReportingPeriodSummary;
  months: ReportingMonthBucket[];
};

export type DashboardSnapshot = {
  selectedMonth: string;
  reportingMode: ReportingViewMode;
  workspaceCurrency: string;
  monthSummary: MonthlyReportSummary;
  rollingTwelveSummary: ReportingPeriodSummary;
  trailingMonths: ReportingMonthBucket[];
};

type ReportRecord = {
  id: string;
  sourceKind: MonthlyReportLineItem["sourceKind"];
  sourceRecordId: string | null;
  title: string;
  eventDate: string;
  direction: ReportDirection;
  normalizedAmount: number;
  classificationType: ClassificationType;
  category: string | null;
  memberId: string | null;
  fxDetails: MonthlyReportLineItem["fxDetails"];
};

export function normalizeMonthInput(value?: string) {
  if (!value) {
    return monthKey(startOfMonth(new Date()));
  }

  const normalized = value.trim().length === 7 ? `${value.trim()}-01` : value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Month must use YYYY-MM or YYYY-MM-01.");
  }

  return monthKey(parsed);
}

export function normalizeReportingModeInput(
  value?: string,
  fallback: ReportingViewMode = "payment_date",
): ReportingViewMode {
  return value === "allocated_period" ? "allocated_period" : fallback;
}

function buildMonthWindow(selectedMonth: string) {
  const monthStart = new Date(`${selectedMonth}T00:00:00.000Z`);
  const nextMonthStart = addMonths(monthStart, 1);

  return {
    monthStart: selectedMonth,
    nextMonthStart: monthKey(nextMonthStart),
  };
}

function toNumber(amount: string | number | null | undefined) {
  const parsed = Number(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeImportedDirection(classificationType: ClassificationType): ReportDirection {
  return classificationType === "income" ? "income" : "expense";
}

function getCategoryLabel(value: string | null) {
  return value?.trim() || "Uncategorized";
}

function createEmptyMonthBucket(month: string): ReportingMonthBucket {
  return {
    month,
    incomeTotal: 0,
    expenseTotal: 0,
    savingsTotal: 0,
    itemCount: 0,
    importedTransactionCount: 0,
    manualEntryCount: 0,
  };
}

function getRecordMonthKey(value: string): MonthKey {
  return `${value.slice(0, 7)}-01` as MonthKey;
}

function expenseEventSourceToLineItemSourceKind(
  sourceType: "transaction" | "manual" | "recurring",
): MonthlyReportLineItem["sourceKind"] {
  switch (sourceType) {
    case "transaction":
      return "imported_transaction";
    case "manual":
      return "one_time_manual";
    case "recurring":
      return "recurring_generated";
  }
}

function accumulateCategoryBreakdown(records: ReportRecord[]) {
  const breakdown = new Map<string, MonthlyCategoryBreakdownItem>();

  for (const record of records) {
    const key = getCategoryLabel(record.category);
    const current = breakdown.get(key) ?? {
      category: key,
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      itemCount: 0,
    };

    if (record.direction === "income") {
      current.incomeTotal += record.normalizedAmount;
      current.netTotal += record.normalizedAmount;
    } else {
      current.expenseTotal += record.normalizedAmount;
      current.netTotal -= record.normalizedAmount;
    }

    current.itemCount += 1;
    breakdown.set(key, current);
  }

  return Array.from(breakdown.values()).sort((left, right) => {
    const totalDiff = Math.abs(right.netTotal) - Math.abs(left.netTotal);
    return totalDiff !== 0 ? totalDiff : left.category.localeCompare(right.category);
  });
}

function accumulateMemberBreakdown(
  records: ReportRecord[],
  memberNames: Map<string, string>,
) {
  const breakdown = new Map<string, MonthlyMemberBreakdownItem>();

  for (const record of records) {
    const key = record.memberId ?? "unassigned";
    const current = breakdown.get(key) ?? {
      memberId: record.memberId,
      memberName: record.memberId ? memberNames.get(record.memberId) ?? "Unknown member" : "Unassigned",
      incomeTotal: 0,
      expenseTotal: 0,
      netTotal: 0,
      itemCount: 0,
    };

    if (record.direction === "income") {
      current.incomeTotal += record.normalizedAmount;
      current.netTotal += record.normalizedAmount;
    } else {
      current.expenseTotal += record.normalizedAmount;
      current.netTotal -= record.normalizedAmount;
    }

    current.itemCount += 1;
    breakdown.set(key, current);
  }

  return Array.from(breakdown.values()).sort((left, right) => {
    const totalDiff = Math.abs(right.netTotal) - Math.abs(left.netTotal);
    return totalDiff !== 0 ? totalDiff : left.memberName.localeCompare(right.memberName);
  });
}

function buildMonthBuckets(records: ReportRecord[], includedMonths: string[]) {
  const buckets = new Map<string, ReportingMonthBucket>(
    includedMonths.map((month) => [month, createEmptyMonthBucket(month)]),
  );

  for (const record of records) {
    const recordMonth = getRecordMonthKey(record.eventDate);
    const current = buckets.get(recordMonth);

    if (!current) {
      continue;
    }

    if (record.direction === "income") {
      current.incomeTotal += record.normalizedAmount;
      current.savingsTotal += record.normalizedAmount;
    } else {
      current.expenseTotal += record.normalizedAmount;
      current.savingsTotal -= record.normalizedAmount;
    }

    current.itemCount += 1;

    if (record.sourceKind === "imported_transaction") {
      current.importedTransactionCount += 1;
    } else {
      current.manualEntryCount += 1;
    }
  }

  return includedMonths.map((month) => buckets.get(month) ?? createEmptyMonthBucket(month));
}

function summarizeBuckets(
  selectedMonth: string,
  reportingMode: ReportingViewMode,
  workspaceCurrency: string,
  buckets: ReportingMonthBucket[],
) {
  const incomeTotal = buckets.reduce((sum, bucket) => sum + bucket.incomeTotal, 0);
  const expenseTotal = buckets.reduce((sum, bucket) => sum + bucket.expenseTotal, 0);
  const importedTransactionCount = buckets.reduce(
    (sum, bucket) => sum + bucket.importedTransactionCount,
    0,
  );
  const manualEntryCount = buckets.reduce((sum, bucket) => sum + bucket.manualEntryCount, 0);
  const monthCount = buckets.length;

  return {
    selectedMonth,
    reportingMode,
    periodStartMonth: buckets[0]?.month ?? selectedMonth,
    periodEndMonth: buckets[buckets.length - 1]?.month ?? selectedMonth,
    workspaceCurrency,
    monthCount,
    incomeTotal,
    expenseTotal,
    savingsTotal: incomeTotal - expenseTotal,
    averageMonthlyIncome: monthCount > 0 ? incomeTotal / monthCount : 0,
    averageMonthlyExpense: monthCount > 0 ? expenseTotal / monthCount : 0,
    averageMonthlySavings: monthCount > 0 ? (incomeTotal - expenseTotal) / monthCount : 0,
    importedTransactionCount,
    manualEntryCount,
  };
}

async function getMemberNames(context: CurrentWorkspaceContext) {
  const members = await listWorkspaceMembers(context);
  return new Map(members.map((member) => [member.id, member.displayName]));
}

async function listPaymentDateReportRecordsForRange(
  context: CurrentWorkspaceContext,
  startMonth: string,
  endMonth: string,
) {
  const db = getDb();
  const rangeStart = monthKey(startOfMonth(new Date(`${startMonth}T00:00:00.000Z`)));
  const { nextMonthStart } = buildMonthWindow(endMonth);

  const [importedTransactions, rangedManualEntries] = await Promise.all([
    db
      .select({
        id: transactions.id,
        merchantRaw: transactions.merchantRaw,
        description: transactions.description,
        transactionDate: transactions.transactionDate,
        originalAmount: transactions.originalAmount,
        originalCurrency: transactions.originalCurrency,
        settlementAmount: transactions.settlementAmount,
        settlementCurrency: transactions.settlementCurrency,
        normalizedAmount: transactions.normalizedAmount,
        normalizationRateSource: transactions.normalizationRateSource,
        classificationType: transactionClassifications.classificationType,
        category: transactionClassifications.category,
        memberOwnerId: transactionClassifications.memberOwnerId,
      })
      .from(transactions)
      .innerJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          gte(transactions.transactionDate, rangeStart),
          lt(transactions.transactionDate, nextMonthStart),
          ne(transactionClassifications.classificationType, "transfer"),
          ne(transactionClassifications.classificationType, "ignore"),
        ),
      ),
    db
      .select({
        id: manualEntries.id,
        sourceType: manualEntries.sourceType,
        title: manualEntries.title,
        eventDate: manualEntries.eventDate,
        normalizedAmount: manualEntries.normalizedAmount,
        eventKind: manualEntries.eventKind,
        classificationType: manualEntries.classificationType,
        category: manualEntries.category,
        payerMemberId: manualEntries.payerMemberId,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          gte(manualEntries.eventDate, rangeStart),
          lt(manualEntries.eventDate, nextMonthStart),
          ne(manualEntries.classificationType, "transfer"),
          ne(manualEntries.classificationType, "ignore"),
        ),
      ),
  ]);

  const importedRecords: ReportRecord[] = importedTransactions.map((transaction) => ({
    id: transaction.id,
    sourceKind: "imported_transaction",
    sourceRecordId: transaction.id,
    title: transaction.merchantRaw?.trim() || transaction.description,
    eventDate: transaction.transactionDate,
    direction: normalizeImportedDirection(transaction.classificationType),
    normalizedAmount: toNumber(transaction.normalizedAmount),
    classificationType: transaction.classificationType,
    category: transaction.category,
    memberId: transaction.memberOwnerId,
    fxDetails: {
      originalAmount: toNumber(transaction.originalAmount),
      originalCurrency: transaction.originalCurrency,
      settlementAmount:
        transaction.settlementAmount === null
          ? null
          : toNumber(transaction.settlementAmount),
      settlementCurrency: transaction.settlementCurrency,
      normalizationRateSource: transaction.normalizationRateSource,
    },
  }));

  const manualRecords: ReportRecord[] = rangedManualEntries.map((entry) => ({
    id: entry.id,
    sourceKind: entry.sourceType,
    sourceRecordId: entry.id,
    title: entry.title,
    eventDate: entry.eventDate,
    direction: entry.eventKind,
    normalizedAmount: toNumber(entry.normalizedAmount),
    classificationType: entry.classificationType,
    category: entry.category,
    memberId: entry.payerMemberId,
    fxDetails: null,
  }));

  return [...importedRecords, ...manualRecords].sort((left, right) => {
    if (left.eventDate !== right.eventDate) {
      return right.eventDate.localeCompare(left.eventDate);
    }

    return left.title.localeCompare(right.title);
  });
}

async function listAllocatedPeriodReportRecordsForRange(
  context: CurrentWorkspaceContext,
  startMonth: string,
  endMonth: string,
) {
  const db = getDb();
  const rangeStart = monthKey(startOfMonth(new Date(`${startMonth}T00:00:00.000Z`)));
  const { nextMonthStart } = buildMonthWindow(endMonth);
  const allocatedRows = await db
    .select({
      id: expenseAllocations.id,
      sourceId: expenseEvents.sourceId,
      sourceType: expenseEvents.sourceType,
      reportMonth: expenseAllocations.reportMonth,
      allocatedAmount: expenseAllocations.allocatedAmount,
      eventKind: expenseEvents.eventKind,
      title: expenseEvents.title,
      classificationType: expenseEvents.classificationType,
      category: expenseEvents.category,
      payerMemberId: expenseEvents.payerMemberId,
      originalAmount: transactions.originalAmount,
      originalCurrency: transactions.originalCurrency,
      settlementAmount: transactions.settlementAmount,
      settlementCurrency: transactions.settlementCurrency,
      normalizationRateSource: transactions.normalizationRateSource,
    })
    .from(expenseAllocations)
    .innerJoin(expenseEvents, eq(expenseEvents.id, expenseAllocations.expenseEventId))
    .leftJoin(
      transactions,
      and(
        eq(expenseEvents.sourceType, "transaction"),
        eq(transactions.workspaceId, context.workspaceId),
        eq(transactions.id, expenseEvents.sourceId),
      ),
    )
    .where(
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        gte(expenseAllocations.reportMonth, rangeStart),
        lt(expenseAllocations.reportMonth, nextMonthStart),
        ne(expenseEvents.classificationType, "transfer"),
        ne(expenseEvents.classificationType, "ignore"),
      ),
    );

  return allocatedRows
    .map<ReportRecord>((row) => ({
      id: row.id,
      sourceKind: expenseEventSourceToLineItemSourceKind(row.sourceType),
      sourceRecordId: row.sourceId,
      title: row.title,
      eventDate: row.reportMonth,
      direction: row.eventKind,
      normalizedAmount: toNumber(row.allocatedAmount),
      classificationType: row.classificationType,
      category: row.category,
      memberId: row.payerMemberId,
      fxDetails:
        row.sourceType === "transaction"
          ? {
              originalAmount: toNumber(row.originalAmount),
              originalCurrency: row.originalCurrency,
              settlementAmount:
                row.settlementAmount === null ? null : toNumber(row.settlementAmount),
              settlementCurrency: row.settlementCurrency,
              normalizationRateSource: row.normalizationRateSource,
            }
          : null,
    }))
    .sort((left, right) => {
      if (left.eventDate !== right.eventDate) {
        return right.eventDate.localeCompare(left.eventDate);
      }

      return left.title.localeCompare(right.title);
    });
}

async function listReportRecordsForRange(
  context: CurrentWorkspaceContext,
  startMonth: string,
  endMonth: string,
  reportingMode: ReportingViewMode,
) {
  if (reportingMode === "allocated_period") {
    return listAllocatedPeriodReportRecordsForRange(context, startMonth, endMonth);
  }

  return listPaymentDateReportRecordsForRange(context, startMonth, endMonth);
}

export async function getMonthlyReport(
  context: CurrentWorkspaceContext,
  input?: { month?: string; mode?: ReportingViewMode | string },
): Promise<MonthlyReportData> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const reportingMode = normalizeReportingModeInput(input?.mode);

  await materializeRecurringEntriesForRange(context, {
    startMonth: selectedMonth,
    endMonth: selectedMonth,
  });

  const [memberNames, allRecords] = await Promise.all([
    getMemberNames(context),
    listReportRecordsForRange(context, selectedMonth, selectedMonth, reportingMode),
  ]);

  const incomeTotal = allRecords
    .filter((record) => record.direction === "income")
    .reduce((sum, record) => sum + record.normalizedAmount, 0);
  const expenseTotal = allRecords
    .filter((record) => record.direction === "expense")
    .reduce((sum, record) => sum + record.normalizedAmount, 0);
  const importedRecords = allRecords.filter(
    (record) => record.sourceKind === "imported_transaction",
  );
  const manualRecords = allRecords.filter(
    (record) => record.sourceKind !== "imported_transaction",
  );

  return {
    summary: {
      selectedMonth,
      reportingMode,
      workspaceCurrency: context.baseCurrency,
      incomeTotal,
      expenseTotal,
      savingsTotal: incomeTotal - expenseTotal,
      importedTransactionCount: importedRecords.length,
      manualEntryCount: manualRecords.length,
    },
    categoryBreakdown: accumulateCategoryBreakdown(allRecords),
    memberBreakdown: accumulateMemberBreakdown(allRecords, memberNames),
    lineItems: allRecords.map((record) => ({
      id: record.id,
      sourceKind: record.sourceKind,
      sourceRecordId: record.sourceRecordId,
      title: record.title,
      eventDate: record.eventDate,
      direction: record.direction,
      normalizedAmount: record.normalizedAmount,
      workspaceCurrency: context.baseCurrency,
      classificationType: record.classificationType,
      category: record.category,
      memberName: record.memberId ? memberNames.get(record.memberId) ?? "Unknown member" : null,
      fxDetails: record.fxDetails,
    })),
  };
}

export async function getYearToDateReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string; mode?: ReportingViewMode | string },
): Promise<YearToDateReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const reportingMode = normalizeReportingModeInput(input?.mode);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildYearToDateWindow(selectedMonthDate);

  await materializeRecurringEntriesForRange(context, {
    startMonth: window.periodStart,
    endMonth: window.periodEnd,
  });

  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
    reportingMode,
  );
  const months = buildMonthBuckets(records, window.includedMonths);

  return {
    summary: summarizeBuckets(selectedMonth, reportingMode, context.baseCurrency, months),
    months,
  };
}

export async function getRollingTwelveReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string; mode?: ReportingViewMode | string },
): Promise<RollingTwelveReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const reportingMode = normalizeReportingModeInput(input?.mode);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildRollingTwelveWindow(selectedMonthDate);

  await materializeRecurringEntriesForRange(context, {
    startMonth: window.periodStart,
    endMonth: window.periodEnd,
  });

  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
    reportingMode,
  );
  const months = buildMonthBuckets(records, window.includedMonths);

  return {
    summary: summarizeBuckets(selectedMonth, reportingMode, context.baseCurrency, months),
    months,
  };
}

export async function getDashboardSnapshot(
  context: CurrentWorkspaceContext,
  input?: { month?: string; mode?: ReportingViewMode | string },
): Promise<DashboardSnapshot> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const reportingMode = normalizeReportingModeInput(input?.mode, "allocated_period");
  const [monthReport, rollingTwelveReport] = await Promise.all([
    getMonthlyReport(context, { month: selectedMonth, mode: reportingMode }),
    getRollingTwelveReport(context, {
      throughMonth: selectedMonth,
      mode: reportingMode,
    }),
  ]);

  return {
    selectedMonth,
    reportingMode,
    workspaceCurrency: context.baseCurrency,
    monthSummary: monthReport.summary,
    rollingTwelveSummary: rollingTwelveReport.summary,
    trailingMonths: rollingTwelveReport.months,
  };
}

export function listReportMonthsInRange(startMonth: string, endMonth: string) {
  return listMonthsBetween(
    new Date(`${startMonth}T00:00:00.000Z`),
    new Date(`${endMonth}T00:00:00.000Z`),
  ).map(monthKey);
}

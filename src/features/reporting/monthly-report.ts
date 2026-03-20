import { and, eq, gte, lt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { manualEntries, transactionClassifications, transactions } from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import { listWorkspaceMembers } from "@/features/expenses/queries";
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

export type MonthlyReportSummary = {
  selectedMonth: string;
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
  title: string;
  eventDate: string;
  direction: ReportDirection;
  normalizedAmount: number;
  workspaceCurrency: string;
  classificationType: ClassificationType;
  category: string | null;
  memberName: string | null;
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
  workspaceCurrency: string;
  monthSummary: MonthlyReportSummary;
  rollingTwelveSummary: ReportingPeriodSummary;
  trailingMonths: ReportingMonthBucket[];
};

type ReportRecord = {
  id: string;
  sourceKind: MonthlyReportLineItem["sourceKind"];
  title: string;
  eventDate: string;
  direction: ReportDirection;
  normalizedAmount: number;
  classificationType: ClassificationType;
  category: string | null;
  memberId: string | null;
};

function normalizeMonthInput(value?: string) {
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

function buildMonthWindow(selectedMonth: string) {
  const monthStart = new Date(`${selectedMonth}T00:00:00.000Z`);
  const nextMonthStart = addMonths(monthStart, 1);

  return {
    monthStart: selectedMonth,
    nextMonthStart: monthKey(nextMonthStart),
  };
}

function toNumber(amount: string) {
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

async function listReportRecordsForRange(
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
        normalizedAmount: transactions.normalizedAmount,
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
    title: transaction.merchantRaw?.trim() || transaction.description,
    eventDate: transaction.transactionDate,
    direction: normalizeImportedDirection(transaction.classificationType),
    normalizedAmount: toNumber(transaction.normalizedAmount),
    classificationType: transaction.classificationType,
    category: transaction.category,
    memberId: transaction.memberOwnerId,
  }));

  const manualRecords: ReportRecord[] = rangedManualEntries.map((entry) => ({
    id: entry.id,
    sourceKind: entry.sourceType,
    title: entry.title,
    eventDate: entry.eventDate,
    direction: entry.eventKind,
    normalizedAmount: toNumber(entry.normalizedAmount),
    classificationType: entry.classificationType,
    category: entry.category,
    memberId: entry.payerMemberId,
  }));

  return [...importedRecords, ...manualRecords].sort((left, right) => {
    if (left.eventDate !== right.eventDate) {
      return right.eventDate.localeCompare(left.eventDate);
    }

    return left.title.localeCompare(right.title);
  });
}

export async function getMonthlyReport(
  context: CurrentWorkspaceContext,
  input?: { month?: string },
): Promise<MonthlyReportData> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const [memberNames, allRecords] = await Promise.all([
    getMemberNames(context),
    listReportRecordsForRange(context, selectedMonth, selectedMonth),
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
      title: record.title,
      eventDate: record.eventDate,
      direction: record.direction,
      normalizedAmount: record.normalizedAmount,
      workspaceCurrency: context.baseCurrency,
      classificationType: record.classificationType,
      category: record.category,
      memberName: record.memberId ? memberNames.get(record.memberId) ?? "Unknown member" : null,
    })),
  };
}

export async function getYearToDateReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string },
): Promise<YearToDateReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildYearToDateWindow(selectedMonthDate);
  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
  );
  const months = buildMonthBuckets(records, window.includedMonths);

  return {
    summary: summarizeBuckets(selectedMonth, context.baseCurrency, months),
    months,
  };
}

export async function getRollingTwelveReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string },
): Promise<RollingTwelveReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildRollingTwelveWindow(selectedMonthDate);
  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
  );
  const months = buildMonthBuckets(records, window.includedMonths);

  return {
    summary: summarizeBuckets(selectedMonth, context.baseCurrency, months),
    months,
  };
}

export async function getDashboardSnapshot(
  context: CurrentWorkspaceContext,
  input?: { month?: string },
): Promise<DashboardSnapshot> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const [monthReport, rollingTwelveReport] = await Promise.all([
    getMonthlyReport(context, { month: selectedMonth }),
    getRollingTwelveReport(context, { throughMonth: selectedMonth }),
  ]);

  return {
    selectedMonth,
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

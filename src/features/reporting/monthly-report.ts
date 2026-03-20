import { and, eq, gte, lt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import { manualEntries, transactionClassifications, transactions } from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { addMonths, monthKey, startOfMonth } from "@/lib/dates/months";

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

export async function getMonthlyReport(
  context: CurrentWorkspaceContext,
  input?: { month?: string },
): Promise<MonthlyReportData> {
  const db = getDb();
  const selectedMonth = normalizeMonthInput(input?.month);
  const { monthStart, nextMonthStart } = buildMonthWindow(selectedMonth);
  const members = await listWorkspaceMembers(context);
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));

  const [importedTransactions, monthlyManualEntries] = await Promise.all([
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
          gte(transactions.transactionDate, monthStart),
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
          gte(manualEntries.eventDate, monthStart),
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

  const manualRecords: ReportRecord[] = monthlyManualEntries.map((entry) => ({
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

  const allRecords = [...importedRecords, ...manualRecords].sort((left, right) => {
    if (left.eventDate !== right.eventDate) {
      return right.eventDate.localeCompare(left.eventDate);
    }

    return left.title.localeCompare(right.title);
  });

  const incomeTotal = allRecords
    .filter((record) => record.direction === "income")
    .reduce((sum, record) => sum + record.normalizedAmount, 0);
  const expenseTotal = allRecords
    .filter((record) => record.direction === "expense")
    .reduce((sum, record) => sum + record.normalizedAmount, 0);

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

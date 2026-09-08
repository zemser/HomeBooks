import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import Big from "big.js";

import { getDb, type DbExecutor } from "@/db";
import {
  expenseAllocations,
  expenseEvents,
  manualEntries,
  transactionClassifications,
  transactions,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import {
  reportScopeMemberId,
  type MemberAttribution,
} from "@/features/expenses/payer";
import {
  buildRollingTwelveWindow,
  buildYearToDateWindow,
} from "@/features/reporting/periods";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
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

export type MonthCompletenessStatus = "empty" | "in_progress" | "complete";

export type MonthCompleteness = {
  month: string;
  status: MonthCompletenessStatus;
  importedTransactionCount: number;
  reviewedTransactionCount: number;
  pendingTransactionCount: number;
  reportableTransactionCount: number;
  excludedTransactionCount: number;
  manualEntryCount: number;
};

type MonthCompletenessCounts = Omit<
  MonthCompleteness,
  "month" | "status" | "pendingTransactionCount"
>;

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

export type SpendingScope = "personal" | "shared" | "household";

export type SpendingScopeSummary = {
  key: string;
  scope: SpendingScope;
  memberId: string | null;
  label: string;
  expenseTotal: number;
  itemCount: number;
};

export type CategoryScopeAmount = {
  scope: SpendingScope;
  memberId: string | null;
  amount: number;
  itemCount: number;
};

export type MonthlyCategoryScopeBreakdownItem = {
  categoryId: string | null;
  category: string;
  amounts: CategoryScopeAmount[];
  expenseTotal: number;
  itemCount: number;
};

export type MemberIncomeSummary = {
  memberId: string | null;
  memberName: string;
  incomeTotal: number;
  itemCount: number;
};

export type ReportMember = {
  id: string;
  displayName: string;
  isActive: boolean;
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
  personalOwnerName: string | null;
  paidByName: string | null;
  receivedByName: string | null;
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
  completeness: MonthCompleteness;
  spendingScopes: SpendingScopeSummary[];
  categoryScopeBreakdown: MonthlyCategoryScopeBreakdownItem[];
  memberIncome: MemberIncomeSummary[];
  categoryBreakdown: MonthlyCategoryBreakdownItem[];
  memberBreakdown: MonthlyMemberBreakdownItem[];
  lineItems: MonthlyReportLineItem[];
};

export type YearMonthSummary = {
  month: string;
  status: MonthCompletenessStatus;
  reviewedTransactionCount: number;
  totalTransactionCount: number;
  incomeTotal: number;
  expenseTotal: number;
  savingsTotal: number;
  scopes: SpendingScopeSummary[];
};

export type YearReportData = {
  year: number;
  workspaceCurrency: string;
  months: YearMonthSummary[];
  totals: {
    incomeTotal: number;
    expenseTotal: number;
    savingsTotal: number;
    scopes: SpendingScopeSummary[];
  };
  averages: {
    monthlyIncome: number;
    monthlyExpense: number;
    monthlySavings: number;
    scopes: SpendingScopeSummary[];
  };
};

export type YearReportSource = {
  year: number;
  workspaceCurrency: string;
  includedMonths: string[];
  records: YearAggregationRecord[];
  members: ReportMember[];
  completeness: MonthCompleteness[];
  reportingMode: ReportingViewMode;
  throughMonth: string;
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
  categoryId: string | null;
  memberId: string | null;
  personalOwnerMemberId: string | null;
  paidByMemberId: string | null;
  receivedByMemberId: string | null;
  fxDetails: MonthlyReportLineItem["fxDetails"];
};

function attributionMemberId(
  classificationType: ClassificationType,
  attribution: MemberAttribution,
) {
  return reportScopeMemberId(classificationType, attribution);
}

function formatLineItemMemberName(
  record: ReportRecord,
  memberNames: Map<string, string>,
) {
  const personalOwnerName = record.personalOwnerMemberId
    ? memberNames.get(record.personalOwnerMemberId) ?? "Unknown member"
    : null;
  const paidByName = record.paidByMemberId
    ? memberNames.get(record.paidByMemberId) ?? "Unknown member"
    : null;
  const receivedByName = record.receivedByMemberId
    ? memberNames.get(record.receivedByMemberId) ?? "Unknown member"
    : null;

  if (record.classificationType === "personal") {
    if (personalOwnerName && paidByName && personalOwnerName !== paidByName) {
      return `${personalOwnerName} · paid by ${paidByName}`;
    }
    return personalOwnerName;
  }

  if (record.classificationType === "income") {
    return receivedByName;
  }

  return paidByName;
}

export type ScopeAggregationRecord = Pick<
  ReportRecord,
  "classificationType" | "category" | "categoryId" | "memberId" | "direction" | "normalizedAmount"
>;

export type YearAggregationRecord = ScopeAggregationRecord & {
  eventDate: string;
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

export function buildMonthCompleteness(
  month: string,
  counts: MonthCompletenessCounts,
): MonthCompleteness {
  const pendingTransactionCount = Math.max(
    0,
    counts.importedTransactionCount - counts.reviewedTransactionCount,
  );
  const status: MonthCompletenessStatus =
    counts.importedTransactionCount === 0 && counts.manualEntryCount === 0
      ? "empty"
      : pendingTransactionCount > 0
        ? "in_progress"
        : "complete";

  return {
    month,
    status,
    ...counts,
    pendingTransactionCount,
  };
}

export async function getMonthCompleteness(
  context: CurrentWorkspaceContext,
  input?: { month?: string },
  db: DbExecutor = getDb(),
): Promise<MonthCompleteness> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const { monthStart, nextMonthStart } = buildMonthWindow(selectedMonth);
  const [transactionCounts, manualEntryCount] = await Promise.all([
    db
      .select({
        importedTransactionCount: sql<number>`count(${transactions.id})::int`,
        reviewedTransactionCount: sql<number>`count(${transactionClassifications.id})::int`,
        reportableTransactionCount: sql<number>`count(*) filter (where ${transactionClassifications.classificationType} in ('personal', 'shared', 'household', 'income'))::int`,
        excludedTransactionCount: sql<number>`count(*) filter (where ${transactionClassifications.classificationType} in ('transfer', 'ignore'))::int`,
      })
      .from(transactions)
      .leftJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          gte(transactions.transactionDate, monthStart),
          lt(transactions.transactionDate, nextMonthStart),
        ),
      )
      .then((rows) => rows[0]),
    db.$count(
      manualEntries,
      and(
        eq(manualEntries.workspaceId, context.workspaceId),
        gte(manualEntries.eventDate, monthStart),
        lt(manualEntries.eventDate, nextMonthStart),
      ),
    ),
  ]);

  return buildMonthCompleteness(selectedMonth, {
    importedTransactionCount: Number(transactionCounts?.importedTransactionCount ?? 0),
    reviewedTransactionCount: Number(transactionCounts?.reviewedTransactionCount ?? 0),
    reportableTransactionCount: Number(transactionCounts?.reportableTransactionCount ?? 0),
    excludedTransactionCount: Number(transactionCounts?.excludedTransactionCount ?? 0),
    manualEntryCount: Number(manualEntryCount),
  });
}

export async function getLatestFinancialActivityMonth(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
) {
  const [latestTransaction, latestManualEntry] = await Promise.all([
    db
      .select({ latestDate: sql<string | null>`max(${transactions.transactionDate})::text` })
      .from(transactions)
      .where(eq(transactions.workspaceId, context.workspaceId))
      .then((rows) => rows[0]?.latestDate ?? null),
    db
      .select({ latestDate: sql<string | null>`max(${manualEntries.eventDate})::text` })
      .from(manualEntries)
      .where(eq(manualEntries.workspaceId, context.workspaceId))
      .then((rows) => rows[0]?.latestDate ?? null),
  ]);
  const latestDate = [latestTransaction, latestManualEntry]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1);

  return latestDate ? normalizeMonthInput(latestDate) : normalizeMonthInput();
}

async function getMonthCompletenessForMonths(
  context: CurrentWorkspaceContext,
  months: string[],
  db: DbExecutor,
) {
  if (months.length === 0) {
    return [];
  }

  const firstMonth = months[0];
  const { nextMonthStart } = buildMonthWindow(months[months.length - 1]);
  const transactionMonth = sql<string>`date_trunc('month', ${transactions.transactionDate})::date::text`;
  const manualEntryMonth = sql<string>`date_trunc('month', ${manualEntries.eventDate})::date::text`;
  const [transactionRows, manualEntryRows] = await Promise.all([
    db
      .select({
        month: transactionMonth,
        importedTransactionCount: sql<number>`count(${transactions.id})::int`,
        reviewedTransactionCount: sql<number>`count(${transactionClassifications.id})::int`,
        reportableTransactionCount: sql<number>`count(*) filter (where ${transactionClassifications.classificationType} in ('personal', 'shared', 'household', 'income'))::int`,
        excludedTransactionCount: sql<number>`count(*) filter (where ${transactionClassifications.classificationType} in ('transfer', 'ignore'))::int`,
      })
      .from(transactions)
      .leftJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          gte(transactions.transactionDate, firstMonth),
          lt(transactions.transactionDate, nextMonthStart),
        ),
      )
      .groupBy(transactionMonth),
    db
      .select({
        month: manualEntryMonth,
        manualEntryCount: sql<number>`count(${manualEntries.id})::int`,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          gte(manualEntries.eventDate, firstMonth),
          lt(manualEntries.eventDate, nextMonthStart),
        ),
      )
      .groupBy(manualEntryMonth),
  ]);
  const transactionCountsByMonth = new Map(transactionRows.map((row) => [row.month, row]));
  const manualCountsByMonth = new Map(
    manualEntryRows.map((row) => [row.month, Number(row.manualEntryCount)]),
  );

  return months.map((month) => {
    const counts = transactionCountsByMonth.get(month);

    return buildMonthCompleteness(month, {
      importedTransactionCount: Number(counts?.importedTransactionCount ?? 0),
      reviewedTransactionCount: Number(counts?.reviewedTransactionCount ?? 0),
      reportableTransactionCount: Number(counts?.reportableTransactionCount ?? 0),
      excludedTransactionCount: Number(counts?.excludedTransactionCount ?? 0),
      manualEntryCount: manualCountsByMonth.get(month) ?? 0,
    });
  });
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

function addMoney(left: number, right: number) {
  return Number(new Big(left).plus(right).toString());
}

function sumMoney(values: number[]) {
  return Number(values.reduce((total, value) => total.plus(value), new Big(0)).toString());
}

function subtractMoney(left: number, right: number) {
  return Number(new Big(left).minus(right).toString());
}

function divideMoney(amount: number, divisor: number) {
  return divisor > 0 ? Number(new Big(amount).div(divisor).toString()) : 0;
}

function isSpendingScope(value: ClassificationType): value is SpendingScope {
  return value === "personal" || value === "shared" || value === "household";
}

function spendingScopeKey(scope: SpendingScope, memberId: string | null) {
  return scope === "personal" ? `personal:${memberId ?? "unassigned"}` : scope;
}

function spendingScopeLabel(
  scope: SpendingScope,
  memberId: string | null,
  memberNames: Map<string, string>,
) {
  if (scope === "personal") {
    return `Personal · ${memberId ? memberNames.get(memberId) ?? "Unknown member" : "Unassigned"}`;
  }

  return scope === "shared" ? "Shared" : "Household";
}

export function buildSpendingScopeSummaries(
  records: ScopeAggregationRecord[],
  members: ReportMember[],
): SpendingScopeSummary[] {
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const memberOrder = new Map(members.map((member, index) => [member.id, index]));
  const summaries = new Map<string, SpendingScopeSummary>();

  const ensureSummary = (scope: SpendingScope, memberId: string | null) => {
    const key = spendingScopeKey(scope, memberId);
    const existing = summaries.get(key);

    if (existing) {
      return existing;
    }

    const summary: SpendingScopeSummary = {
      key,
      scope,
      memberId,
      label: spendingScopeLabel(scope, memberId, memberNames),
      expenseTotal: 0,
      itemCount: 0,
    };
    summaries.set(key, summary);
    return summary;
  };

  for (const member of members) {
    if (member.isActive) {
      ensureSummary("personal", member.id);
    }
  }

  ensureSummary("shared", null);
  ensureSummary("household", null);

  for (const record of records) {
    if (record.direction !== "expense" || !isSpendingScope(record.classificationType)) {
      continue;
    }

    const memberId = record.classificationType === "personal" ? record.memberId : null;
    const summary = ensureSummary(record.classificationType, memberId);
    summary.expenseTotal = addMoney(summary.expenseTotal, record.normalizedAmount);
    summary.itemCount += 1;
  }

  return Array.from(summaries.values()).sort((left, right) => {
    if (left.scope !== right.scope) {
      const order: SpendingScope[] = ["personal", "shared", "household"];
      return order.indexOf(left.scope) - order.indexOf(right.scope);
    }

    if (left.scope !== "personal") {
      return 0;
    }

    return (
      (left.memberId ? memberOrder.get(left.memberId) : undefined) ?? Number.MAX_SAFE_INTEGER
    ) - (
      (right.memberId ? memberOrder.get(right.memberId) : undefined) ?? Number.MAX_SAFE_INTEGER
    );
  });
}

export function buildCategoryScopeBreakdown(
  records: ScopeAggregationRecord[],
  spendingScopes: SpendingScopeSummary[],
): MonthlyCategoryScopeBreakdownItem[] {
  const breakdown = new Map<
    string,
    MonthlyCategoryScopeBreakdownItem & { amountsByKey: Map<string, CategoryScopeAmount> }
  >();

  for (const record of records) {
    if (record.direction !== "expense" || !isSpendingScope(record.classificationType)) {
      continue;
    }

    const category = getCategoryLabel(record.category);
    const categoryKey = record.categoryId ?? `uncatalogued:${category}`;
    const current = breakdown.get(categoryKey) ?? {
      categoryId: record.categoryId,
      category,
      amounts: [],
      amountsByKey: new Map(
        spendingScopes.map((scope) => [
          scope.key,
          {
            scope: scope.scope,
            memberId: scope.memberId,
            amount: 0,
            itemCount: 0,
          },
        ]),
      ),
      expenseTotal: 0,
      itemCount: 0,
    };
    const scopeKey = spendingScopeKey(
      record.classificationType,
      record.classificationType === "personal" ? record.memberId : null,
    );
    const amount = current.amountsByKey.get(scopeKey);

    if (!amount) {
      throw new Error(`Missing spending scope ${scopeKey} for category aggregation.`);
    }

    amount.amount = addMoney(amount.amount, record.normalizedAmount);
    amount.itemCount += 1;
    current.expenseTotal = addMoney(current.expenseTotal, record.normalizedAmount);
    current.itemCount += 1;
    breakdown.set(categoryKey, current);
  }

  return Array.from(breakdown.values())
    .map(({ amountsByKey, ...item }) => ({
      ...item,
      amounts: spendingScopes.map((scope) => amountsByKey.get(scope.key)!),
    }))
    .sort((left, right) => {
      const totalDifference = right.expenseTotal - left.expenseTotal;
      return totalDifference !== 0 ? totalDifference : left.category.localeCompare(right.category);
    });
}

export function buildMemberIncomeSummaries(
  records: ScopeAggregationRecord[],
  members: ReportMember[],
): MemberIncomeSummary[] {
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const summaries = new Map<string, MemberIncomeSummary>();

  for (const record of records) {
    if (record.direction !== "income" || record.classificationType !== "income") {
      continue;
    }

    const key = record.memberId ?? "unassigned";
    const current = summaries.get(key) ?? {
      memberId: record.memberId,
      memberName: record.memberId
        ? memberNames.get(record.memberId) ?? "Unknown member"
        : "Unassigned",
      incomeTotal: 0,
      itemCount: 0,
    };
    current.incomeTotal = addMoney(current.incomeTotal, record.normalizedAmount);
    current.itemCount += 1;
    summaries.set(key, current);
  }

  return Array.from(summaries.values()).sort((left, right) => {
    const totalDifference = right.incomeTotal - left.incomeTotal;
    return totalDifference !== 0 ? totalDifference : left.memberName.localeCompare(right.memberName);
  });
}

function alignSpendingScopes(
  scopes: SpendingScopeSummary[],
  template: SpendingScopeSummary[],
) {
  const scopesByKey = new Map(scopes.map((scope) => [scope.key, scope]));

  return template.map((scope) => ({
    ...scope,
    expenseTotal: scopesByKey.get(scope.key)?.expenseTotal ?? 0,
    itemCount: scopesByKey.get(scope.key)?.itemCount ?? 0,
  }));
}

export function buildYearReportData(input: {
  year: number;
  workspaceCurrency: string;
  includedMonths: string[];
  records: YearAggregationRecord[];
  members: ReportMember[];
  completeness: MonthCompleteness[];
}): YearReportData {
  const completenessByMonth = new Map(
    input.completeness.map((completeness) => [completeness.month, completeness]),
  );
  const yearScopeTemplate = buildSpendingScopeSummaries(input.records, input.members);
  const months = input.includedMonths.map<YearMonthSummary>((month) => {
    const monthRecords = input.records.filter(
      (record) => getRecordMonthKey(record.eventDate) === month,
    );
    const completeness = completenessByMonth.get(month);
    const scopes = alignSpendingScopes(
      buildSpendingScopeSummaries(monthRecords, input.members),
      yearScopeTemplate,
    );
    const incomeTotal = sumMoney(
      monthRecords
        .filter((record) => record.direction === "income")
        .map((record) => record.normalizedAmount),
    );
    const expenseTotal = sumMoney(scopes.map((scope) => scope.expenseTotal));

    return {
      month,
      status: completeness?.status ?? "empty",
      reviewedTransactionCount: completeness?.reviewedTransactionCount ?? 0,
      totalTransactionCount: completeness?.importedTransactionCount ?? 0,
      incomeTotal,
      expenseTotal,
      savingsTotal: subtractMoney(incomeTotal, expenseTotal),
      scopes,
    };
  });
  const monthCount = months.length;
  const incomeTotal = sumMoney(months.map((month) => month.incomeTotal));
  const expenseTotal = sumMoney(months.map((month) => month.expenseTotal));
  const savingsTotal = sumMoney(months.map((month) => month.savingsTotal));
  const totalScopes = yearScopeTemplate.map((scope) => ({
    ...scope,
    expenseTotal: sumMoney(
      months.map(
        (month) => month.scopes.find((monthScope) => monthScope.key === scope.key)?.expenseTotal ?? 0,
      ),
    ),
    itemCount: months.reduce(
      (total, month) =>
        total + (month.scopes.find((monthScope) => monthScope.key === scope.key)?.itemCount ?? 0),
      0,
    ),
  }));

  return {
    year: input.year,
    workspaceCurrency: input.workspaceCurrency,
    months,
    totals: {
      incomeTotal,
      expenseTotal,
      savingsTotal,
      scopes: totalScopes,
    },
    averages: {
      monthlyIncome: divideMoney(incomeTotal, monthCount),
      monthlyExpense: divideMoney(expenseTotal, monthCount),
      monthlySavings: divideMoney(savingsTotal, monthCount),
      scopes: totalScopes.map((scope) => ({
        ...scope,
        expenseTotal: divideMoney(scope.expenseTotal, monthCount),
        itemCount: scope.itemCount / Math.max(monthCount, 1),
      })),
    },
  };
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

async function getReportMembers(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
) {
  const members = await listWorkspaceMembersForSettings(context, db);
  return members.map((member) => ({
    id: member.id,
    displayName: member.displayName,
    isActive: member.isActive,
  }));
}

async function listPaymentDateReportRecordsForRange(
  context: CurrentWorkspaceContext,
  startMonth: string,
  endMonth: string,
  db: DbExecutor,
) {
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
        categoryId: transactionClassifications.categoryId,
        personalOwnerMemberId: transactionClassifications.personalOwnerMemberId,
        paidByMemberId: transactionClassifications.paidByMemberId,
        receivedByMemberId: transactionClassifications.receivedByMemberId,
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
        categoryId: manualEntries.categoryId,
        payerMemberId: manualEntries.payerMemberId,
        personalOwnerMemberId: manualEntries.personalOwnerMemberId,
        receivedByMemberId: manualEntries.receivedByMemberId,
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

  const importedRecords: ReportRecord[] = importedTransactions.map((transaction) => {
    const attribution = {
      personalOwnerMemberId: transaction.personalOwnerMemberId,
      paidByMemberId: transaction.paidByMemberId,
      receivedByMemberId: transaction.receivedByMemberId,
    };

    return {
      id: transaction.id,
      sourceKind: "imported_transaction" as const,
      sourceRecordId: transaction.id,
      title: transaction.merchantRaw?.trim() || transaction.description,
      eventDate: transaction.transactionDate,
      direction: normalizeImportedDirection(transaction.classificationType),
      normalizedAmount: toNumber(transaction.normalizedAmount),
      classificationType: transaction.classificationType,
      category: transaction.category,
      categoryId: transaction.categoryId,
      memberId: attributionMemberId(transaction.classificationType, attribution),
      personalOwnerMemberId: attribution.personalOwnerMemberId,
      paidByMemberId: attribution.paidByMemberId,
      receivedByMemberId: attribution.receivedByMemberId,
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
    };
  });

  const manualRecords: ReportRecord[] = rangedManualEntries.map((entry) => {
    const attribution = {
      personalOwnerMemberId: entry.personalOwnerMemberId,
      paidByMemberId: entry.payerMemberId,
      receivedByMemberId: entry.receivedByMemberId,
    };

    return {
      id: entry.id,
      sourceKind: entry.sourceType,
      sourceRecordId: entry.id,
      title: entry.title,
      eventDate: entry.eventDate,
      direction: entry.eventKind,
      normalizedAmount: toNumber(entry.normalizedAmount),
      classificationType: entry.classificationType,
      category: entry.category,
      categoryId: entry.categoryId,
      memberId: attributionMemberId(entry.classificationType, attribution),
      personalOwnerMemberId: attribution.personalOwnerMemberId,
      paidByMemberId: attribution.paidByMemberId,
      receivedByMemberId: attribution.receivedByMemberId,
      fxDetails: null,
    };
  });

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
  db: DbExecutor,
) {
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
      categoryId: expenseEvents.categoryId,
      payerMemberId: expenseEvents.payerMemberId,
      personalOwnerMemberId: expenseEvents.personalOwnerMemberId,
      receivedByMemberId: expenseEvents.receivedByMemberId,
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
    .map<ReportRecord>((row) => {
      const attribution = {
        personalOwnerMemberId: row.personalOwnerMemberId,
        paidByMemberId: row.payerMemberId,
        receivedByMemberId: row.receivedByMemberId,
      };

      return {
      id: row.id,
      sourceKind: expenseEventSourceToLineItemSourceKind(row.sourceType),
      sourceRecordId: row.sourceId,
      title: row.title,
      eventDate: row.reportMonth,
      direction: row.eventKind,
      normalizedAmount: toNumber(row.allocatedAmount),
      classificationType: row.classificationType,
      category: row.category,
      categoryId: row.categoryId,
      memberId: attributionMemberId(row.classificationType, attribution),
      personalOwnerMemberId: attribution.personalOwnerMemberId,
      paidByMemberId: attribution.paidByMemberId,
      receivedByMemberId: attribution.receivedByMemberId,
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
    };
    })
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
  db: DbExecutor,
) {
  if (reportingMode === "allocated_period") {
    return listAllocatedPeriodReportRecordsForRange(context, startMonth, endMonth, db);
  }

  return listPaymentDateReportRecordsForRange(context, startMonth, endMonth, db);
}

export async function getMonthlyReport(
  context: CurrentWorkspaceContext,
  input?: { month?: string; mode?: ReportingViewMode | string },
  db: DbExecutor = getDb(),
): Promise<MonthlyReportData> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const reportingMode = normalizeReportingModeInput(input?.mode);

  const [members, allRecords, completeness] = await Promise.all([
    getReportMembers(context, db),
    listReportRecordsForRange(context, selectedMonth, selectedMonth, reportingMode, db),
    getMonthCompleteness(context, { month: selectedMonth }, db),
  ]);
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const spendingScopes = buildSpendingScopeSummaries(allRecords, members);

  const incomeTotal = sumMoney(
    allRecords
      .filter((record) => record.direction === "income")
      .map((record) => record.normalizedAmount),
  );
  const expenseTotal = sumMoney(spendingScopes.map((scope) => scope.expenseTotal));
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
      savingsTotal: subtractMoney(incomeTotal, expenseTotal),
      importedTransactionCount: importedRecords.length,
      manualEntryCount: manualRecords.length,
    },
    completeness,
    spendingScopes,
    categoryScopeBreakdown: buildCategoryScopeBreakdown(allRecords, spendingScopes),
    memberIncome: buildMemberIncomeSummaries(allRecords, members),
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
      memberName: formatLineItemMemberName(record, memberNames),
      personalOwnerName: record.personalOwnerMemberId
        ? memberNames.get(record.personalOwnerMemberId) ?? "Unknown member"
        : null,
      paidByName: record.paidByMemberId
        ? memberNames.get(record.paidByMemberId) ?? "Unknown member"
        : null,
      receivedByName: record.receivedByMemberId
        ? memberNames.get(record.receivedByMemberId) ?? "Unknown member"
        : null,
      fxDetails: record.fxDetails,
    })),
  };
}

export async function loadYearReportSource(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string; mode?: ReportingViewMode | string },
  db: DbExecutor = getDb(),
): Promise<YearReportSource> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const currentMonth = normalizeMonthInput();
  const reportingMode = normalizeReportingModeInput(input?.mode);
  const year = Number(selectedMonth.slice(0, 4));
  const currentYear = Number(currentMonth.slice(0, 4));
  const startMonth = `${year}-01-01`;
  const endMonth =
    year < currentYear
      ? `${year}-12-01`
      : year === currentYear
        ? selectedMonth < currentMonth
          ? selectedMonth
          : currentMonth
        : selectedMonth;
  const includedMonths = listMonthsBetween(
    new Date(`${startMonth}T00:00:00.000Z`),
    new Date(`${endMonth}T00:00:00.000Z`),
  ).map(monthKey);
  const [members, records, completeness] = await Promise.all([
    getReportMembers(context, db),
    listReportRecordsForRange(context, startMonth, endMonth, reportingMode, db),
    getMonthCompletenessForMonths(context, includedMonths, db),
  ]);

  return {
    year,
    workspaceCurrency: context.baseCurrency,
    includedMonths,
    records,
    members,
    completeness,
    reportingMode,
    throughMonth: endMonth,
  };
}

export async function getYearReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string; mode?: ReportingViewMode | string },
  db: DbExecutor = getDb(),
): Promise<YearReportData> {
  return buildYearReportData(await loadYearReportSource(context, input, db));
}

export async function getYearToDateReport(
  context: CurrentWorkspaceContext,
  input?: { throughMonth?: string; mode?: ReportingViewMode | string },
  db: DbExecutor = getDb(),
): Promise<YearToDateReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const reportingMode = normalizeReportingModeInput(input?.mode);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildYearToDateWindow(selectedMonthDate);

  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
    reportingMode,
    db,
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
  db: DbExecutor = getDb(),
): Promise<RollingTwelveReportData> {
  const selectedMonth = normalizeMonthInput(input?.throughMonth);
  const reportingMode = normalizeReportingModeInput(input?.mode);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const window = buildRollingTwelveWindow(selectedMonthDate);

  const records = await listReportRecordsForRange(
    context,
    window.periodStart,
    window.periodEnd,
    reportingMode,
    db,
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
  db: DbExecutor = getDb(),
): Promise<DashboardSnapshot> {
  const selectedMonth = normalizeMonthInput(input?.month);
  const reportingMode = normalizeReportingModeInput(input?.mode, "allocated_period");
  const [monthReport, rollingTwelveReport] = await Promise.all([
    getMonthlyReport(context, { month: selectedMonth, mode: reportingMode }, db),
    getRollingTwelveReport(context, {
      throughMonth: selectedMonth,
      mode: reportingMode,
    }, db),
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

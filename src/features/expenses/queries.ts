import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import {
  financialAccounts,
  classificationRules,
  imports,
  importSources,
  transactionClassifications,
  transactions,
  users,
  workspaceMembers,
} from "@/db/schema";
import { listTransactionAllocationStates } from "@/features/expenses/allocation";
import type {
  ClassificationSuggestion,
  ExpenseTransactionItem,
  ExpensesPageData,
  ReviewQueueImportSummary,
  ReviewQueueResponse,
  ReviewQueueSummary,
  WorkspaceMemberOption,
} from "@/features/expenses/types";
import {
  buildExactMerchantSuggestions,
  normalizeMerchantRuleValue,
} from "@/features/expenses/suggestions";
import { filterAndSortReviewQueue, reviewImportIsUnscoped } from "@/features/expenses/review-filtering";
import {
  defaultReviewQuery,
  resolveReviewLandingImportId,
  type ReviewQuery,
} from "@/features/expenses/review-query";
import {
  historyImportIsUnscoped,
  historyMonthIsUnscoped,
  isHistoryMonthUnresolved,
  type HistoryQuery,
  type ParsedHistoryQuery,
} from "@/features/expenses/history-query";
import { listSavedImports } from "@/features/imports/persistence";
import { getLatestFinancialActivityMonth } from "@/features/reporting/monthly-report";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { addMonths, monthKey } from "@/lib/dates/months";

type RawTransactionRow = {
  id: string;
  accountId: string;
  importId: string;
  transactionDate: string;
  bookingDate: string | null;
  description: string;
  merchantRaw: string | null;
  originalAmount: string;
  originalCurrency: string | null;
  settlementAmount: string | null;
  settlementCurrency: string | null;
  normalizedAmount: string;
  workspaceCurrency: string;
  normalizationRateSource: string | null;
  direction: string;
  accountDisplayName: string;
  accountOwnerMemberId: string | null;
  importSourceName: string | null;
  importOriginalFilename: string;
  importUploadedByUserId: string;
  classificationType:
    | "personal"
    | "shared"
    | "household"
    | "income"
    | "transfer"
    | "ignore"
    | null;
  category: string | null;
  categoryId: string | null;
  personalOwnerMemberId: string | null;
  paidByMemberId: string | null;
  receivedByMemberId: string | null;
  decidedBy: "rule" | "user" | "system_default" | null;
  reviewedAt: Date | null;
};

async function listMemberNamesById(memberIds: string[], db: DbExecutor) {
  if (memberIds.length === 0) {
    return new Map<string, string>();
  }

  const members = await db
    .select({
      id: workspaceMembers.id,
      displayNameOverride: workspaceMembers.displayNameOverride,
      userDisplayName: users.displayName,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(inArray(workspaceMembers.id, memberIds));

  return new Map(
    members.map((member) => [
      member.id,
      member.displayNameOverride?.trim() || member.userDisplayName,
    ]),
  );
}

async function listMemberIdsByUserId(
  context: CurrentWorkspaceContext,
  userIds: string[],
  db: DbExecutor,
) {
  if (userIds.length === 0) {
    return new Map<string, string>();
  }

  const members = await db
    .select({ userId: workspaceMembers.userId, memberId: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        eq(workspaceMembers.isActive, true),
        inArray(workspaceMembers.userId, userIds),
      ),
    );

  return new Map(members.map((member) => [member.userId, member.memberId]));
}

async function mapTransactionRows(
  context: CurrentWorkspaceContext,
  rows: RawTransactionRow[],
  db: DbExecutor,
) {
  const memberIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.personalOwnerMemberId,
        row.paidByMemberId,
        row.receivedByMemberId,
        row.accountOwnerMemberId,
      ]).filter((value): value is string => Boolean(value)),
    ),
  );
  const memberNamesById = await listMemberNamesById(memberIds, db);
  const importerMemberIdsByUserId = await listMemberIdsByUserId(
    context,
    Array.from(new Set(rows.map((row) => row.importUploadedByUserId))),
    db,
  );
  const allocationStatesByTransactionId = await listTransactionAllocationStates(
    context,
    rows.map((row) => row.id),
    db,
  );

  return rows.map<ExpenseTransactionItem>((row) => ({
    id: row.id,
    accountId: row.accountId,
    importId: row.importId,
    importerMemberId: importerMemberIdsByUserId.get(row.importUploadedByUserId) ?? null,
    accountOwnerMemberId: row.accountOwnerMemberId,
    transactionDate: row.transactionDate,
    bookingDate: row.bookingDate,
    description: row.description,
    merchantRaw: row.merchantRaw,
    originalAmount: row.originalAmount,
    originalCurrency: row.originalCurrency,
    settlementAmount: row.settlementAmount,
    settlementCurrency: row.settlementCurrency,
    normalizedAmount: row.normalizedAmount,
    workspaceCurrency: row.workspaceCurrency,
    normalizationRateSource: row.normalizationRateSource,
    direction: row.direction,
    accountDisplayName: row.accountDisplayName,
    importSourceName: row.importSourceName,
    importOriginalFilename: row.importOriginalFilename,
    classification: row.classificationType
      ? {
          classificationType: row.classificationType,
          category: row.category,
          categoryId: row.categoryId,
          personalOwnerMemberId: row.personalOwnerMemberId,
          personalOwnerName: row.personalOwnerMemberId
            ? memberNamesById.get(row.personalOwnerMemberId) ?? null
            : null,
          paidByMemberId: row.paidByMemberId,
          paidByName: row.paidByMemberId
            ? memberNamesById.get(row.paidByMemberId) ?? null
            : null,
          receivedByMemberId: row.receivedByMemberId,
          receivedByName: row.receivedByMemberId
            ? memberNamesById.get(row.receivedByMemberId) ?? null
            : null,
          decidedBy: row.decidedBy ?? "user",
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
        }
      : null,
    allocation: allocationStatesByTransactionId.get(row.id) ?? null,
    suggestion: null,
    similarQueueCount: 0,
    exactRuleExists: false,
  }));
}

function monthWindow(month: string) {
  const monthStart = `${month}-01`;
  return {
    monthStart,
    nextMonthStart: monthKey(addMonths(new Date(`${monthStart}T00:00:00.000Z`), 1)),
  };
}

function escapeLikePattern(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function transactionSearchFilters(searchQuery: string) {
  const normalized = searchQuery.trim();
  if (!normalized) return [];
  const pattern = `%${escapeLikePattern(normalized)}%`;
  const search = or(
    ilike(transactions.merchantRaw, pattern),
    ilike(transactions.description, pattern),
    ilike(financialAccounts.displayName, pattern),
    ilike(imports.originalFilename, pattern),
    ilike(importSources.name, pattern),
  );
  return search ? [search] : [];
}

function buildTransactionListFilters(input: {
  workspaceId: string;
  onlyUnclassified?: boolean;
  transactionId?: string;
  importId?: string;
  month?: string;
  reviewStatus?: HistoryQuery["reviewStatus"];
  searchQuery?: string;
}) {
  const filters = [eq(transactions.workspaceId, input.workspaceId)];

  if (input.onlyUnclassified || input.reviewStatus === "needs_review") {
    filters.push(isNull(transactionClassifications.id));
  } else if (input.reviewStatus === "reviewed") {
    filters.push(isNotNull(transactionClassifications.id));
  }

  if (input.transactionId) {
    filters.push(eq(transactions.id, input.transactionId));
  }

  if (input.importId && !reviewImportIsUnscoped(input.importId) && !historyImportIsUnscoped(input.importId)) {
    filters.push(eq(transactions.importId, input.importId));
  }

  if (input.month && input.month !== "all" && !historyMonthIsUnscoped(input.month)) {
    const { monthStart, nextMonthStart } = monthWindow(input.month);
    filters.push(gte(transactions.transactionDate, monthStart));
    filters.push(lt(transactions.transactionDate, nextMonthStart));
  }

  if (input.searchQuery) {
    filters.push(...transactionSearchFilters(input.searchQuery));
  }

  return filters;
}

async function listTransactionsByWorkspace(input: {
  context: CurrentWorkspaceContext;
  workspaceId: string;
  onlyUnclassified?: boolean;
  transactionId?: string;
  importId?: string;
  month?: string;
  reviewStatus?: HistoryQuery["reviewStatus"];
  searchQuery?: string;
  limit?: number;
  offset?: number;
  db: DbExecutor;
}) {
  const filters = buildTransactionListFilters(input);

  const orderedQuery = input.db
    .select({
      id: transactions.id,
      accountId: transactions.accountId,
      importId: transactions.importId,
      transactionDate: transactions.transactionDate,
      bookingDate: transactions.bookingDate,
      description: transactions.description,
      merchantRaw: transactions.merchantRaw,
      originalAmount: transactions.originalAmount,
      originalCurrency: transactions.originalCurrency,
      settlementAmount: transactions.settlementAmount,
      settlementCurrency: transactions.settlementCurrency,
      normalizedAmount: transactions.normalizedAmount,
      workspaceCurrency: transactions.workspaceCurrency,
      normalizationRateSource: transactions.normalizationRateSource,
      direction: transactions.direction,
      accountDisplayName: financialAccounts.displayName,
      accountOwnerMemberId: financialAccounts.ownerMemberId,
      importSourceName: importSources.name,
      importOriginalFilename: imports.originalFilename,
      importUploadedByUserId: imports.uploadedByUserId,
      classificationType: transactionClassifications.classificationType,
      category: transactionClassifications.category,
      categoryId: transactionClassifications.categoryId,
      personalOwnerMemberId: transactionClassifications.personalOwnerMemberId,
      paidByMemberId: transactionClassifications.paidByMemberId,
      receivedByMemberId: transactionClassifications.receivedByMemberId,
      decidedBy: transactionClassifications.decidedBy,
      reviewedAt: transactionClassifications.reviewedAt,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .innerJoin(imports, eq(imports.id, transactions.importId))
    .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
    .leftJoin(
      transactionClassifications,
      eq(transactionClassifications.transactionId, transactions.id),
    )
    .where(and(...filters))
    .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));

  const rows =
    typeof input.limit === "number"
      ? await orderedQuery.limit(input.limit).offset(input.offset ?? 0)
      : await orderedQuery;
  return mapTransactionRows(input.context, rows, input.db);
}

async function countTransactionsByWorkspace(input: {
  workspaceId: string;
  onlyUnclassified?: boolean;
  importId?: string;
  month?: string;
  reviewStatus?: HistoryQuery["reviewStatus"];
  searchQuery?: string;
  db: DbExecutor;
}) {
  const filters = buildTransactionListFilters(input);
  const [row] = await input.db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .innerJoin(imports, eq(imports.id, transactions.importId))
    .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
    .leftJoin(
      transactionClassifications,
      eq(transactionClassifications.transactionId, transactions.id),
    )
    .where(and(...filters));
  return Number(row?.count ?? 0);
}

export async function listExpenseTransactions(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
) {
  return listTransactionsByWorkspace({
    context,
    workspaceId: context.workspaceId,
    db,
  });
}

export async function listWorkspaceMembers(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceMemberOption[]> {
  const members = await db
    .select({
      id: workspaceMembers.id,
      displayNameOverride: workspaceMembers.displayNameOverride,
      userDisplayName: users.displayName,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(
      and(
        eq(workspaceMembers.workspaceId, context.workspaceId),
        eq(workspaceMembers.isActive, true),
      ),
    );

  return members.map((member) => ({
    id: member.id,
    displayName: member.displayNameOverride?.trim() || member.userDisplayName,
  }));
}

export async function listReviewQueue(
  context: CurrentWorkspaceContext,
  query: ReviewQuery = defaultReviewQuery(),
  db: DbExecutor = getDb(),
  options?: { resolveLanding?: boolean },
): Promise<ReviewQueueResponse> {
  const scopedImportId = reviewImportIsUnscoped(query.importId) ? undefined : query.importId;
  const scopedMonth = query.month !== "all" ? query.month : undefined;
  const [rawQueue, focusTransaction, members, categoryCatalog, recentCategories, summary, savedImports] =
    await Promise.all([
      listTransactionsByWorkspace({
        context,
        workspaceId: context.workspaceId,
        onlyUnclassified: true,
        importId: scopedImportId,
        month: scopedMonth,
        db,
      }),
      query.transactionId
        ? listTransactionsByWorkspace({
            context,
            workspaceId: context.workspaceId,
            transactionId: query.transactionId,
            db,
          }).then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      listWorkspaceMembers(context, db),
      listWorkspaceCategories(context, db),
      listRecentReviewCategories(context, db),
      getReviewQueueSummary(context, query, db),
      listSavedImports(context, { type: "bank" }, db),
    ]);

  const resolvedImportId = options?.resolveLanding
    ? resolveReviewLandingImportId(summary.remainingByImport, query)
    : query.importId;
  const resolvedQuery = { ...query, importId: resolvedImportId };
  const statementLibrary = buildStatementLibrary(savedImports, summary.remainingByImport);
  const selectedImport =
    summary.selectedImport ??
    statementLibrary.find((item) => item.importId === resolvedImportId) ??
    summary.remainingByImport.find((item) => item.importId === resolvedImportId) ??
    null;

  const merchantValues = [
    ...rawQueue.map((transaction) => transaction.merchantRaw),
    focusTransaction?.merchantRaw ?? null,
  ];
  const [suggestionsByMerchant, existingExactRuleValues] = await Promise.all([
    listHistoricalClassificationSuggestions(context, merchantValues, db, query.transactionId),
    listExistingExactRuleValues(context, merchantValues, db),
  ]);
  const queueCountByMerchant = new Map<string, number>();
  rawQueue.forEach((transaction) => {
    const merchant = transaction.merchantRaw?.trim();
    if (!merchant) return;
    const key = normalizeMerchantRuleValue(merchant);
    queueCountByMerchant.set(key, (queueCountByMerchant.get(key) ?? 0) + 1);
  });
  const enrichedQueue = rawQueue.map((transaction) => {
    const merchant = transaction.merchantRaw?.trim();
    if (!merchant) return transaction;
    const key = normalizeMerchantRuleValue(merchant);
    return {
      ...transaction,
      suggestion: suggestionsByMerchant.get(key) ?? null,
      similarQueueCount: Math.max((queueCountByMerchant.get(key) ?? 1) - 1, 0),
      exactRuleExists: existingExactRuleValues.has(key),
    };
  });
  const enrichedFocusTransaction = focusTransaction?.merchantRaw?.trim()
    ? {
        ...focusTransaction,
        exactRuleExists: existingExactRuleValues.has(
          normalizeMerchantRuleValue(focusTransaction.merchantRaw),
        ),
      }
    : focusTransaction;
  const filteredQueue = filterAndSortReviewQueue(enrichedQueue, resolvedQuery);
  const filteredCount = filteredQueue.length;
  const totalPages = Math.max(Math.ceil(filteredCount / resolvedQuery.pageSize), 1);
  const page = Math.min(resolvedQuery.page, totalPages);
  const pageStart = (page - 1) * resolvedQuery.pageSize;
  const queue = filteredQueue.slice(pageStart, pageStart + resolvedQuery.pageSize);
  const months = Array.from(
    new Set(rawQueue.map((transaction) => transaction.transactionDate.slice(0, 7))),
  ).sort((left, right) => right.localeCompare(left));
  const importLabels = new Map<string, string>();
  const importRemainingCounts = new Map<string, number>();
  const accountLabels = new Map<string, string>();
  rawQueue.forEach((transaction) => {
    importLabels.set(transaction.importId, transaction.importOriginalFilename);
    importRemainingCounts.set(
      transaction.importId,
      (importRemainingCounts.get(transaction.importId) ?? 0) + 1,
    );
    accountLabels.set(transaction.accountId, transaction.accountDisplayName);
  });
  const categories = categoryCatalog.map((category) => category.name);

  return {
    queue,
    focusTransaction: enrichedFocusTransaction,
    members,
    categories,
    categoryCatalog,
    recentCategories,
    summary: {
      ...summary,
      statementLibrary,
      selectedImport,
    },
    resolvedImportId,
    pagination: {
      page,
      pageSize: resolvedQuery.pageSize,
      filteredCount,
      totalPages,
    },
    filterOptions: {
      months,
      imports: Array.from(importLabels, ([id, label]) => ({
        id,
        label: `${label} · ${importRemainingCounts.get(id) ?? 0} left`,
      })).sort((a, b) => a.label.localeCompare(b.label)),
      accounts: Array.from(accountLabels, ([id, label]) => ({ id, label })).sort((a, b) =>
        a.label.localeCompare(b.label),
      ),
    },
  };
}

async function listExistingExactRuleValues(
  context: CurrentWorkspaceContext,
  merchantValues: Array<string | null>,
  db: DbExecutor,
) {
  const normalizedMerchants = Array.from(
    new Set(
      merchantValues
        .map((merchant) => merchant?.trim())
        .filter((merchant): merchant is string => Boolean(merchant))
        .map(normalizeMerchantRuleValue),
    ),
  );
  if (normalizedMerchants.length === 0) return new Set<string>();

  const rows = await db
    .select({ matchValue: classificationRules.matchValue })
    .from(classificationRules)
    .where(
      and(
        eq(classificationRules.workspaceId, context.workspaceId),
        eq(classificationRules.matchType, "exact"),
        inArray(classificationRules.matchValue, normalizedMerchants),
      ),
    );
  return new Set(rows.map((row) => row.matchValue));
}

async function listRecentReviewCategories(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
) {
  const rows = await db
    .select({ category: transactionClassifications.category })
    .from(transactionClassifications)
    .innerJoin(transactions, eq(transactions.id, transactionClassifications.transactionId))
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        isNotNull(transactionClassifications.category),
      ),
    )
    .orderBy(desc(transactionClassifications.reviewedAt), desc(transactionClassifications.updatedAt))
    .limit(30);

  const seen = new Set<string>();
  const recent: string[] = [];
  rows.forEach((row) => {
    const category = row.category?.trim();
    if (!category) return;
    const key = category.toLocaleLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    recent.push(category);
  });
  return recent.slice(0, 6);
}

async function listHistoricalClassificationSuggestions(
  context: CurrentWorkspaceContext,
  merchantValues: Array<string | null>,
  db: DbExecutor,
  excludeTransactionId?: string,
) {
  const normalizedMerchants = Array.from(
    new Set(
      merchantValues
        .map((merchant) => merchant?.trim())
        .filter((merchant): merchant is string => Boolean(merchant))
        .map(normalizeMerchantRuleValue),
    ),
  );
  if (normalizedMerchants.length === 0) return new Map<string, ClassificationSuggestion>();

  const filters = [
    eq(transactions.workspaceId, context.workspaceId),
    isNotNull(transactions.merchantRaw),
    inArray(sql<string>`lower(btrim(${transactions.merchantRaw}))`, normalizedMerchants),
  ];
  if (excludeTransactionId) {
    filters.push(ne(transactions.id, excludeTransactionId));
  }

  const rows = await db
    .select({
      merchantRaw: transactions.merchantRaw,
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
    .where(and(...filters))
    .orderBy(desc(transactionClassifications.reviewedAt), desc(transactionClassifications.updatedAt))
    .limit(5000);

  const memberIds = Array.from(
    new Set(
      rows.flatMap((row) => [
        row.personalOwnerMemberId,
        row.paidByMemberId,
        row.receivedByMemberId,
      ]).filter((id): id is string => Boolean(id)),
    ),
  );
  const memberNames = await listMemberNamesById(memberIds, db);
  return buildExactMerchantSuggestions(rows, memberNames);
}

async function getReviewQueueSummary(
  context: CurrentWorkspaceContext,
  query: Pick<ReviewQuery, "importId" | "month"> = { importId: "all", month: "all" },
  db: DbExecutor = getDb(),
): Promise<ReviewQueueSummary> {
  const selectedImportId = query.importId;
  const monthFilters =
    query.month !== "all"
      ? (() => {
          const { monthStart, nextMonthStart } = monthWindow(query.month);
          return [
            gte(transactions.transactionDate, monthStart),
            lt(transactions.transactionDate, nextMonthStart),
          ];
        })()
      : [];
  const [
    totalTransactionCount,
    totalByImportRows,
    remainingByImportRows,
    latestTransactionRow,
    selectedImportRow,
    selectedMonthRow,
  ] = await Promise.all([
    db.$count(transactions, eq(transactions.workspaceId, context.workspaceId)),
    db
      .select({
        importId: imports.id,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .innerJoin(imports, eq(imports.id, transactions.importId))
      .where(eq(transactions.workspaceId, context.workspaceId))
      .groupBy(imports.id),
    db
      .select({
        importId: imports.id,
        originalFilename: imports.originalFilename,
        sourceName: importSources.name,
        remainingCount: sql<number>`count(*)::int`,
        earliestTransactionDate: sql<string | null>`min(${transactions.transactionDate})::text`,
        latestTransactionDate: sql<string | null>`max(${transactions.transactionDate})::text`,
      })
      .from(transactions)
      .innerJoin(imports, eq(imports.id, transactions.importId))
      .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
      .leftJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          isNull(transactionClassifications.id),
        ),
      )
      .groupBy(imports.id, imports.originalFilename, importSources.name, imports.createdAt)
      .orderBy(
        desc(sql`max(${transactions.transactionDate})`),
        desc(sql`count(*)`),
        desc(imports.createdAt),
      ),
    db
      .select({
        latestTransactionDate: sql<string | null>`max(${transactions.transactionDate})::text`,
      })
      .from(transactions)
      .where(eq(transactions.workspaceId, context.workspaceId))
      .then((rows) => rows[0] ?? null),
    reviewImportIsUnscoped(selectedImportId)
      ? Promise.resolve(null)
      : db
          .select({
            importId: imports.id,
            originalFilename: imports.originalFilename,
            sourceName: importSources.name,
            totalCount: sql<number>`count(*)::int`,
            remainingCount: sql<number>`count(*) filter (where ${transactionClassifications.id} is null)::int`,
            earliestTransactionDate: sql<string | null>`min(${transactions.transactionDate})::text`,
            latestTransactionDate: sql<string | null>`max(${transactions.transactionDate})::text`,
          })
          .from(transactions)
          .innerJoin(imports, eq(imports.id, transactions.importId))
          .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
          .leftJoin(
            transactionClassifications,
            eq(transactionClassifications.transactionId, transactions.id),
          )
          .where(
            and(
              eq(transactions.workspaceId, context.workspaceId),
              eq(imports.id, selectedImportId),
            ),
          )
          .groupBy(imports.id, imports.originalFilename, importSources.name)
          .then((rows) => rows[0] ?? null),
    monthFilters.length === 0
      ? Promise.resolve(null)
      : db
          .select({
            totalCount: sql<number>`count(*)::int`,
            remainingCount: sql<number>`count(*) filter (where ${transactionClassifications.id} is null)::int`,
          })
          .from(transactions)
          .leftJoin(
            transactionClassifications,
            eq(transactionClassifications.transactionId, transactions.id),
          )
          .where(and(eq(transactions.workspaceId, context.workspaceId), ...monthFilters))
          .then((rows) => rows[0] ?? null),
  ]);

  const totalCountByImportId = new Map(
    totalByImportRows.map((row) => [row.importId, Number(row.totalCount)]),
  );
  const remainingByImport: ReviewQueueImportSummary[] = remainingByImportRows.map((row) => {
    const totalCount = totalCountByImportId.get(row.importId) ?? Number(row.remainingCount);

    return {
      importId: row.importId,
      originalFilename: row.originalFilename,
      sourceName: row.sourceName,
      totalCount,
      reviewedCount: Math.max(totalCount - Number(row.remainingCount), 0),
      remainingCount: Number(row.remainingCount),
      earliestTransactionDate: row.earliestTransactionDate ?? null,
      latestTransactionDate: row.latestTransactionDate ?? null,
    };
  });
  const queueCount = remainingByImport.reduce((sum, row) => sum + row.remainingCount, 0);
  const reviewedCount = Math.max(totalTransactionCount - queueCount, 0);
  const completionPercentage =
    totalTransactionCount === 0
      ? 100
      : Math.round((reviewedCount / totalTransactionCount) * 100);
  const selectedImport = selectedImportRow
    ? {
        importId: selectedImportRow.importId,
        originalFilename: selectedImportRow.originalFilename,
        sourceName: selectedImportRow.sourceName,
        totalCount: Number(selectedImportRow.totalCount),
        reviewedCount: Math.max(
          Number(selectedImportRow.totalCount) - Number(selectedImportRow.remainingCount),
          0,
        ),
        remainingCount: Number(selectedImportRow.remainingCount),
        earliestTransactionDate: selectedImportRow.earliestTransactionDate ?? null,
        latestTransactionDate: selectedImportRow.latestTransactionDate ?? null,
      }
    : null;
  const selectedMonth =
    query.month !== "all" && selectedMonthRow
      ? {
          month: query.month,
          totalCount: Number(selectedMonthRow.totalCount),
          remainingCount: Number(selectedMonthRow.remainingCount),
          reviewedCount: Math.max(
            Number(selectedMonthRow.totalCount) - Number(selectedMonthRow.remainingCount),
            0,
          ),
        }
      : null;

  return {
    totalTransactionCount,
    reviewedCount,
    queueCount,
    completionPercentage,
    latestTransactionMonth: latestTransactionRow?.latestTransactionDate?.slice(0, 7) ?? null,
    remainingByImport,
    statementLibrary: [],
    selectedImport,
    selectedMonth,
  };
}

function buildStatementLibrary(
  savedImports: Array<{
    id: string;
    originalFilename: string;
    sourceName: string | null;
    transactionCount: number;
    reviewedTransactionCount: number;
    reviewPendingCount: number;
    earliestTransactionDate: string | null;
    latestTransactionDate: string | null;
  }>,
  remainingByImport: ReviewQueueImportSummary[],
): ReviewQueueImportSummary[] {
  const remainingOrder = new Map(
    remainingByImport.map((item, index) => [item.importId, index]),
  );
  const mapped = savedImports.map<ReviewQueueImportSummary>((item) => ({
    importId: item.id,
    originalFilename: item.originalFilename,
    sourceName: item.sourceName,
    totalCount: item.transactionCount,
    reviewedCount: item.reviewedTransactionCount,
    remainingCount: item.reviewPendingCount,
    earliestTransactionDate: item.earliestTransactionDate,
    latestTransactionDate: item.latestTransactionDate,
  }));
  const incomplete = mapped
    .filter((item) => item.remainingCount > 0)
    .sort(
      (left, right) =>
        (remainingOrder.get(left.importId) ?? Number.MAX_SAFE_INTEGER) -
        (remainingOrder.get(right.importId) ?? Number.MAX_SAFE_INTEGER),
    );
  const complete = mapped.filter((item) => item.remainingCount === 0);
  return [...incomplete, ...complete];
}

async function listHistoryFilterOptions(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
) {
  const [monthRows, savedImports] = await Promise.all([
    db
      .select({
        month: sql<string>`to_char(${transactions.transactionDate}, 'YYYY-MM')`,
      })
      .from(transactions)
      .where(eq(transactions.workspaceId, context.workspaceId))
      .groupBy(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`)
      .orderBy(desc(sql`to_char(${transactions.transactionDate}, 'YYYY-MM')`)),
    listSavedImports(context, { type: "bank" }, db),
  ]);

  return {
    months: monthRows.map((row) => row.month),
    imports: savedImports.map((item) => ({
      id: item.id,
      label: item.originalFilename,
    })),
  };
}

async function findHistoryFocusTransaction(
  context: CurrentWorkspaceContext,
  transactionId: string,
  db: DbExecutor,
) {
  const rows = await listTransactionsByWorkspace({
    context,
    workspaceId: context.workspaceId,
    transactionId,
    db,
  });
  return rows[0] ?? null;
}

async function findHistoryPageForTransaction(input: {
  workspaceId: string;
  importId?: string;
  month?: string;
  reviewStatus?: HistoryQuery["reviewStatus"];
  searchQuery?: string;
  transactionId: string;
  pageSize: number;
  db: DbExecutor;
}) {
  const focus = await input.db
    .select({
      id: transactions.id,
      transactionDate: transactions.transactionDate,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(eq(transactions.workspaceId, input.workspaceId), eq(transactions.id, input.transactionId)),
    )
    .then((rows) => rows[0] ?? null);
  if (!focus) return 1;

  const filters = buildTransactionListFilters({
    workspaceId: input.workspaceId,
    importId: input.importId,
    month: input.month,
    reviewStatus: input.reviewStatus,
    searchQuery: input.searchQuery,
  });
  const [row] = await input.db
    .select({ count: sql<number>`count(*)::int` })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .innerJoin(imports, eq(imports.id, transactions.importId))
    .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
    .leftJoin(
      transactionClassifications,
      eq(transactionClassifications.transactionId, transactions.id),
    )
    .where(
      and(
        ...filters,
        or(
          gt(transactions.transactionDate, focus.transactionDate),
          and(
            eq(transactions.transactionDate, focus.transactionDate),
            gt(transactions.createdAt, focus.createdAt),
          ),
        ),
      ),
    );
  const position = Number(row?.count ?? 0);
  return Math.floor(position / input.pageSize) + 1;
}

export async function resolveHistoryQuery(
  context: CurrentWorkspaceContext,
  parsed: ParsedHistoryQuery,
  db: DbExecutor = getDb(),
  defaultMonth?: string,
): Promise<HistoryQuery> {
  let month = parsed.month;
  let page = parsed.page;

  if (parsed.transactionId && isHistoryMonthUnresolved(parsed.month)) {
    const focus = await findHistoryFocusTransaction(context, parsed.transactionId, db);
    const focusMonth = focus?.transactionDate.slice(0, 7) ?? null;
    if (focusMonth) month = focusMonth;
  }

  if (isHistoryMonthUnresolved(month) && historyImportIsUnscoped(parsed.importId)) {
    month =
      defaultMonth ??
      (await getLatestFinancialActivityMonth(context, db)).slice(0, 7);
  }

  if (parsed.transactionId && !parsed.pageSpecified) {
    page = await findHistoryPageForTransaction({
      workspaceId: context.workspaceId,
      importId: parsed.importId,
      month,
      reviewStatus: parsed.reviewStatus,
      searchQuery: parsed.searchQuery,
      transactionId: parsed.transactionId,
      pageSize: parsed.pageSize,
      db,
    });
  }

  return {
    month,
    importId: parsed.importId,
    searchQuery: parsed.searchQuery,
    reviewStatus: parsed.reviewStatus,
    page,
    pageSize: parsed.pageSize,
    transactionId: parsed.transactionId,
  };
}

export async function listHistoryPageData(
  context: CurrentWorkspaceContext,
  parsed: ParsedHistoryQuery,
  db: DbExecutor = getDb(),
): Promise<Omit<ExpensesPageData, "oneTimeManualEntries"> & { defaultMonth: string }> {
  const defaultMonth = (await getLatestFinancialActivityMonth(context, db)).slice(0, 7);
  const query = await resolveHistoryQuery(context, parsed, db, defaultMonth);
  const listInput = {
    workspaceId: context.workspaceId,
    importId: query.importId,
    month: query.month,
    reviewStatus: query.reviewStatus,
    searchQuery: query.searchQuery,
  };
  const [filteredCount, scopeTotalCount, scopePendingCount, filterOptions, members, categoryCatalog] =
    await Promise.all([
      countTransactionsByWorkspace({ ...listInput, db }),
      countTransactionsByWorkspace({
        workspaceId: context.workspaceId,
        importId: query.importId,
        month: query.month,
        db,
      }),
      countTransactionsByWorkspace({
        workspaceId: context.workspaceId,
        importId: query.importId,
        month: query.month,
        reviewStatus: "needs_review",
        db,
      }),
      listHistoryFilterOptions(context, db),
      listWorkspaceMembers(context, db),
      listWorkspaceCategories(context, db),
    ]);
  const totalPages = Math.max(Math.ceil(filteredCount / query.pageSize), 1);
  const page = Math.min(query.page, totalPages);
  const transactions = await listTransactionsByWorkspace({
    context,
    ...listInput,
    limit: query.pageSize,
    offset: (page - 1) * query.pageSize,
    db,
  });

  return {
    transactions,
    members,
    categories: categoryCatalog.map((category) => category.name),
    categoryCatalog,
    pagination: {
      page,
      pageSize: query.pageSize,
      filteredCount,
      totalPages,
    },
    filterOptions,
    scope: {
      month: query.month,
      importId: query.importId,
      pendingCount: scopePendingCount,
      totalCount: scopeTotalCount,
      defaultMonth,
    },
    query: {
      ...query,
      page,
    },
    defaultMonth,
  };
}

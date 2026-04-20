import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  financialAccounts,
  imports,
  importSources,
  transactionClassifications,
  transactions,
  users,
  workspaceMembers,
} from "@/db/schema";
import { listTransactionAllocationStates } from "@/features/expenses/allocation";
import type {
  ExpenseTransactionItem,
  ReviewQueueImportSummary,
  ReviewQueueResponse,
  ReviewQueueSummary,
  WorkspaceMemberOption,
} from "@/features/expenses/types";
import { listWorkspaceCategoryNames } from "@/features/workspaces/categories";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

type RawTransactionRow = {
  id: string;
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
  importSourceName: string | null;
  importOriginalFilename: string;
  classificationType:
    | "personal"
    | "shared"
    | "household"
    | "income"
    | "transfer"
    | "ignore"
    | null;
  category: string | null;
  memberOwnerId: string | null;
  decidedBy: "rule" | "user" | "system_default" | null;
  reviewedAt: Date | null;
};

async function listMemberNamesById(memberIds: string[]) {
  if (memberIds.length === 0) {
    return new Map<string, string>();
  }

  const db = getDb();
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

async function mapTransactionRows(
  context: CurrentWorkspaceContext,
  rows: RawTransactionRow[],
) {
  const memberIds = Array.from(
    new Set(
      rows
        .map((row) => row.memberOwnerId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const memberNamesById = await listMemberNamesById(memberIds);
  const allocationStatesByTransactionId = await listTransactionAllocationStates(
    context,
    rows.map((row) => row.id),
  );

  return rows.map<ExpenseTransactionItem>((row) => ({
    id: row.id,
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
          memberOwnerId: row.memberOwnerId,
          memberOwnerName: row.memberOwnerId
            ? memberNamesById.get(row.memberOwnerId) ?? null
            : null,
          decidedBy: row.decidedBy ?? "user",
          reviewedAt: row.reviewedAt?.toISOString() ?? null,
        }
      : null,
    allocation: allocationStatesByTransactionId.get(row.id) ?? null,
  }));
}

async function listTransactionsByWorkspace(input: {
  context: CurrentWorkspaceContext;
  workspaceId: string;
  onlyUnclassified?: boolean;
  transactionId?: string;
}) {
  const db = getDb();
  const filters = [eq(transactions.workspaceId, input.workspaceId)];

  if (input.onlyUnclassified) {
    filters.push(isNull(transactionClassifications.id));
  }

  if (input.transactionId) {
    filters.push(eq(transactions.id, input.transactionId));
  }

  const rows = await db
    .select({
      id: transactions.id,
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
      importSourceName: importSources.name,
      importOriginalFilename: imports.originalFilename,
      classificationType: transactionClassifications.classificationType,
      category: transactionClassifications.category,
      memberOwnerId: transactionClassifications.memberOwnerId,
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

  return mapTransactionRows(input.context, rows);
}

export async function listExpenseTransactions(context: CurrentWorkspaceContext) {
  return listTransactionsByWorkspace({
    context,
    workspaceId: context.workspaceId,
  });
}

export async function listWorkspaceMembers(
  context: CurrentWorkspaceContext,
): Promise<WorkspaceMemberOption[]> {
  const db = getDb();
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
  transactionId?: string,
): Promise<ReviewQueueResponse> {
  const [queue, focusTransaction, members, categories, summary] = await Promise.all([
    listTransactionsByWorkspace({
      context,
      workspaceId: context.workspaceId,
      onlyUnclassified: true,
    }),
    transactionId
      ? listTransactionsByWorkspace({
          context,
          workspaceId: context.workspaceId,
          transactionId,
        }).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    listWorkspaceMembers(context),
    listWorkspaceCategoryNames(context),
    getReviewQueueSummary(context),
  ]);

  return {
    queue,
    focusTransaction,
    members,
    categories,
    summary,
  };
}

async function getReviewQueueSummary(
  context: CurrentWorkspaceContext,
): Promise<ReviewQueueSummary> {
  const db = getDb();
  const [
    totalTransactionCount,
    totalByImportRows,
    remainingByImportRows,
    latestTransactionRow,
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
      .groupBy(imports.id, imports.originalFilename, importSources.name)
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

  return {
    totalTransactionCount,
    reviewedCount,
    queueCount,
    completionPercentage,
    latestTransactionMonth: latestTransactionRow?.latestTransactionDate?.slice(0, 7) ?? null,
    remainingByImport,
  };
}

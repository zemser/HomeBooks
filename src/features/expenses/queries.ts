import { and, desc, eq, inArray, isNull } from "drizzle-orm";

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
import type {
  ExpenseTransactionItem,
  ReviewQueueResponse,
  WorkspaceMemberOption,
} from "@/features/expenses/types";
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

async function mapTransactionRows(rows: RawTransactionRow[]) {
  const memberIds = Array.from(
    new Set(
      rows
        .map((row) => row.memberOwnerId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const memberNamesById = await listMemberNamesById(memberIds);

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
  }));
}

async function listTransactionsByWorkspace(input: {
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

  return mapTransactionRows(rows);
}

export async function listExpenseTransactions(context: CurrentWorkspaceContext) {
  return listTransactionsByWorkspace({
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
  const [queue, focusTransaction, members] = await Promise.all([
    listTransactionsByWorkspace({
      workspaceId: context.workspaceId,
      onlyUnclassified: true,
    }),
    transactionId
      ? listTransactionsByWorkspace({
          workspaceId: context.workspaceId,
          transactionId,
        }).then((rows) => rows[0] ?? null)
      : Promise.resolve(null),
    listWorkspaceMembers(context),
  ]);

  return {
    queue,
    focusTransaction,
    members,
  };
}

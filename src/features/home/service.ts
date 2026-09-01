import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import {
  imports,
  transactionClassifications,
  transactions,
} from "@/db/schema";
import {
  getMonthlyReport,
  normalizeMonthInput,
} from "@/features/reporting/monthly-report";
import type {
  AppShellSnapshot,
  WorkspaceHomeActivitySnapshot,
  WorkspaceHomeImportActivity,
  WorkspaceHomePrimarySnapshot,
  WorkspaceHomeReportingSnapshot,
} from "@/features/home/types";
import { listSavedImports } from "@/features/imports/persistence";
import {
  runWithWorkspaceDatabaseUser,
  type CurrentWorkspaceContext,
} from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";

async function getWorkspaceName(context: CurrentWorkspaceContext) {
  return context.workspaceName ?? "Workspace";
}

async function getReviewQueueCount(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(transactions)
    .leftJoin(
      transactionClassifications,
      eq(transactionClassifications.transactionId, transactions.id),
    )
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        isNull(transactionClassifications.id),
      ),
    );

  return Number(row?.count ?? 0);
}

async function listLatestBankImports(
  context: CurrentWorkspaceContext,
  limit = 3,
  db: DbExecutor = getDb(),
): Promise<WorkspaceHomeImportActivity[]> {
  const recentImports = await listSavedImports(context, { type: "bank" }, db);
  return recentImports.slice(0, limit);
}

export async function getAppShellSnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<AppShellSnapshot> {
  return runWithWorkspaceDatabaseUser(context, async () => {
    const [workspaceName, members, reviewQueueCount] = await Promise.all([
      getWorkspaceName(context),
      listWorkspaceMembersForSettings(context, db),
      getReviewQueueCount(context, db),
    ]);
    const activeMembers = members.filter((member) => member.isActive);
    const pairwiseSettlementReady = activeMembers.length === 2;

    return {
      workspaceName,
      baseCurrency: context.baseCurrency,
      activeMemberCount: activeMembers.length,
      pairwiseSettlementReady,
      reviewQueueCount,
    };
  });
}

export async function getWorkspaceHomePrimarySnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceHomePrimarySnapshot> {
  return runWithWorkspaceDatabaseUser(context, async () => {
    const [workspaceName, members, importCount, latestTransactionRow, reviewQueueCount] =
      await Promise.all([
      getWorkspaceName(context),
      listWorkspaceMembersForSettings(context, db),
      db.$count(
        imports,
        and(
          eq(imports.workspaceId, context.workspaceId),
          eq(imports.type, "bank"),
        ),
      ),
      db
        .select({
          latestTransactionDate: sql<string | null>`max(${transactions.transactionDate})::text`,
        })
        .from(transactions)
        .where(eq(transactions.workspaceId, context.workspaceId))
        .then((rows) => rows[0] ?? null),
      getReviewQueueCount(context, db),
    ]);
    const activeMembers = members.filter((member) => member.isActive);
    const latestTransactionMonth =
      latestTransactionRow?.latestTransactionDate?.slice(0, 7) ?? null;

    return {
      workspaceName,
      setup: {
        activeMemberCount: activeMembers.length,
      },
      workflow: {
        importCount,
        latestTransactionMonth,
        reviewQueueCount,
      },
    };
  });
}

export async function getWorkspaceHomeReportingSnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceHomeReportingSnapshot> {
  return runWithWorkspaceDatabaseUser(context, async () => {
    const selectedMonth = normalizeMonthInput();
    const report = await getMonthlyReport(context, {
      month: selectedMonth,
      mode: "payment_date",
    }, db);
    const hasActivity =
      report.completeness.importedTransactionCount > 0 ||
      report.completeness.manualEntryCount > 0;

    return {
      selectedMonth,
      reportingMode: "payment_date",
      available: hasActivity,
      completeness: report.completeness,
      monthSummary: hasActivity ? report.summary : null,
    };
  });
}

export async function getWorkspaceHomeActivitySnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceHomeActivitySnapshot> {
  return runWithWorkspaceDatabaseUser(context, async () => ({
    latestImports: await listLatestBankImports(context, 3, db),
  }));
}

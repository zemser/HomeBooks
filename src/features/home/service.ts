import { and, eq, isNull, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  imports,
  manualEntries,
  manualRecurringExpenses,
  transactionClassifications,
  transactions,
  workspaces,
} from "@/db/schema";
import { syncExpenseEventsForRange } from "@/features/reporting/expense-events";
import {
  getDashboardSnapshot,
  normalizeMonthInput,
} from "@/features/reporting/monthly-report";
import { buildRollingTwelveWindow } from "@/features/reporting/periods";
import type {
  AppShellSnapshot,
  WorkspaceHomeImportActivity,
  WorkspaceHomeNotableState,
  WorkspaceHomeSnapshot,
} from "@/features/home/types";
import { listSavedImports } from "@/features/imports/persistence";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { getWorkspaceSettingsSnapshot } from "@/features/workspaces/settings";

async function getWorkspaceName(context: CurrentWorkspaceContext) {
  const db = getDb();
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.id, context.workspaceId),
    columns: {
      name: true,
    },
  });

  if (!workspace) {
    throw new Error("Workspace was not found.");
  }

  return workspace.name;
}

async function getReviewQueueCount(context: CurrentWorkspaceContext) {
  const db = getDb();
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
): Promise<WorkspaceHomeImportActivity[]> {
  const recentImports = await listSavedImports(context, { type: "bank" });
  return recentImports.slice(0, limit);
}

export async function getAppShellSnapshot(
  context: CurrentWorkspaceContext,
): Promise<AppShellSnapshot> {
  const [workspaceName, members, reviewQueueCount] = await Promise.all([
    getWorkspaceName(context),
    listWorkspaceMembersForSettings(context),
    getReviewQueueCount(context),
  ]);
  const activeMembers = members.filter((member) => member.isActive);
  const pairwiseSettlementReady = activeMembers.length === 2;

  return {
    workspaceName,
    baseCurrency: context.baseCurrency,
    activeMemberCount: activeMembers.length,
    pairwiseSettlementReady,
    reviewQueueCount,
    settingsNeedsAttention: !pairwiseSettlementReady,
  };
}

export async function getWorkspaceHomeSnapshot(
  context: CurrentWorkspaceContext,
): Promise<WorkspaceHomeSnapshot> {
  const db = getDb();
  const selectedMonth = normalizeMonthInput();
  const [workspaceName, settings, members, importCount, transactionCount, reviewQueueCount, manualEntryCount, recurringRuleCount, latestImports] =
    await Promise.all([
      getWorkspaceName(context),
      getWorkspaceSettingsSnapshot(context),
      listWorkspaceMembersForSettings(context),
      db.$count(
        imports,
        and(
          eq(imports.workspaceId, context.workspaceId),
          eq(imports.type, "bank"),
        ),
      ),
      db.$count(transactions, eq(transactions.workspaceId, context.workspaceId)),
      getReviewQueueCount(context),
      db.$count(manualEntries, eq(manualEntries.workspaceId, context.workspaceId)),
      db.$count(
        manualRecurringExpenses,
        eq(manualRecurringExpenses.workspaceId, context.workspaceId),
      ),
      listLatestBankImports(context),
    ]);
  const activeMembers = members.filter((member) => member.isActive);
  const activeOwners = activeMembers.filter((member) => member.role === "owner");
  const pairwiseSettlementReady = activeMembers.length === 2;
  const hasPotentialReportingInputs = transactionCount > 0 || manualEntryCount > 0;

  let monthSummary: WorkspaceHomeSnapshot["reporting"]["monthSummary"] = null;
  let rollingTwelveSummary: WorkspaceHomeSnapshot["reporting"]["rollingTwelveSummary"] = null;
  let reportingAvailable = false;

  if (hasPotentialReportingInputs) {
    const rollingWindow = buildRollingTwelveWindow(
      new Date(`${selectedMonth}T00:00:00.000Z`),
    );

    await syncExpenseEventsForRange(context, {
      startMonth: rollingWindow.periodStart,
      endMonth: selectedMonth,
    });

    const dashboard = await getDashboardSnapshot(context, {
      month: selectedMonth,
      mode: "allocated_period",
    });

    const reportableItemCount =
      dashboard.rollingTwelveSummary.importedTransactionCount +
      dashboard.rollingTwelveSummary.manualEntryCount;

    monthSummary = dashboard.monthSummary;
    rollingTwelveSummary = dashboard.rollingTwelveSummary;
    reportingAvailable = reportableItemCount > 0;
  }

  const notableStates: WorkspaceHomeNotableState[] = [];

  if (reviewQueueCount > 0) {
    notableStates.push({
      title: "Review queue",
      description: `${reviewQueueCount} transaction${reviewQueueCount === 1 ? "" : "s"} still need a human decision before the reports tell the right story.`,
      href: "/imports/review",
      tone: "warning",
    });
  } else if (importCount > 0) {
    notableStates.push({
      title: "Review queue",
      description: "Imported transactions are no longer waiting in the queue, so you can move on to the ledger and reports.",
      href: "/expenses",
      tone: "neutral",
    });
  }

  notableStates.push({
    title: "Shared settlements",
    description: pairwiseSettlementReady
      ? "Exactly two active household members are in place, so shared settlements are ready when you need them."
      : "Shared settlements stay blocked until exactly two active household members are configured.",
    href: pairwiseSettlementReady ? "/settlements" : "/settings",
    tone: pairwiseSettlementReady ? "neutral" : "warning",
  });

  notableStates.push({
    title: "Workspace currency",
    description: settings.canUpdateBaseCurrency
      ? `Base currency is still editable, so you can change ${settings.baseCurrency} before the workspace locks onto real financial data.`
      : `Base currency is locked to ${settings.baseCurrency} because financial records already exist in the workspace.`,
    href: "/settings",
    tone: settings.canUpdateBaseCurrency ? "neutral" : "warning",
  });

  return {
    workspaceName,
    setup: {
      baseCurrency: settings.baseCurrency,
      canUpdateBaseCurrency: settings.canUpdateBaseCurrency,
      activeMemberCount: activeMembers.length,
      activeOwnerCount: activeOwners.length,
      pairwiseSettlementReady,
    },
    workflow: {
      importCount,
      transactionCount,
      reviewQueueCount,
      manualEntryCount,
      recurringRuleCount,
      hasManualEntries: manualEntryCount > 0,
      hasRecurringRules: recurringRuleCount > 0,
    },
    reporting: {
      selectedMonth,
      reportingMode: "allocated_period",
      available: reportingAvailable,
      monthSummary,
      rollingTwelveSummary,
    },
    recentActivity: {
      latestImports,
      notableStates,
    },
  };
}

import { eq } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import {
  holdingSnapshots,
  imports,
  investmentActivities,
  manualEntries,
  manualRecurringExpenses,
  transactions,
  workspaces,
} from "@/db/schema";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type { WorkspaceSettingsSnapshot } from "@/features/workspaces/types";

const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

function normalizeBaseCurrency(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!CURRENCY_CODE_PATTERN.test(normalized)) {
    throw new Error("Base currency must be a 3-letter code.");
  }

  return normalized;
}

async function workspaceHasFinancialData(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
) {

  const [
    existingImport,
    existingTransaction,
    existingManualEntry,
    existingRecurringEntry,
    existingInvestmentActivity,
    existingHoldingSnapshot,
  ] = await Promise.all([
    db.query.imports.findFirst({
      where: eq(imports.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
    db.query.transactions.findFirst({
      where: eq(transactions.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
    db.query.manualEntries.findFirst({
      where: eq(manualEntries.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
    db.query.manualRecurringExpenses.findFirst({
      where: eq(manualRecurringExpenses.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
    db.query.investmentActivities.findFirst({
      where: eq(investmentActivities.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
    db.query.holdingSnapshots.findFirst({
      where: eq(holdingSnapshots.workspaceId, context.workspaceId),
      columns: { id: true },
    }),
  ]);

  return Boolean(
    existingImport
      || existingTransaction
      || existingManualEntry
      || existingRecurringEntry
      || existingInvestmentActivity
      || existingHoldingSnapshot,
  );
}

export async function getWorkspaceSettingsSnapshot(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceSettingsSnapshot> {
  const hasFinancialData = await workspaceHasFinancialData(context, db);

  return {
    workspaceId: context.workspaceId,
    baseCurrency: context.baseCurrency,
    canUpdateBaseCurrency: !hasFinancialData,
    baseCurrencyLockReason: hasFinancialData
      ? "Base currency can only be changed before imports, manual entries, recurring inputs, or other financial records exist in the workspace."
      : null,
  };
}

export async function updateWorkspaceBaseCurrency(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
  input: { baseCurrency: string },
): Promise<WorkspaceSettingsSnapshot> {
  const nextBaseCurrency = normalizeBaseCurrency(input.baseCurrency);

  const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.id, context.workspaceId),
      columns: {
        id: true,
        baseCurrency: true,
      },
    });

    if (!workspace) {
      throw new Error("Workspace was not found.");
    }

    if (workspace.baseCurrency === nextBaseCurrency) {
      return getWorkspaceSettingsSnapshot(context, db);
    }

    const hasFinancialData = await workspaceHasFinancialData(context, db);

    if (hasFinancialData) {
      throw new Error(
        "Base currency can only be changed before imports, manual entries, recurring inputs, or other financial records exist in the workspace.",
      );
    }

    await db
      .update(workspaces)
      .set({
        baseCurrency: nextBaseCurrency,
        updatedAt: new Date(),
      })
      .where(eq(workspaces.id, workspace.id));

  return {
    workspaceId: workspace.id,
    baseCurrency: nextBaseCurrency,
    canUpdateBaseCurrency: true,
    baseCurrencyLockReason: null,
  };
}

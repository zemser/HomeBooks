import { and, eq, or, sql } from "drizzle-orm";

import type { DbExecutor } from "@/db";
import { transactions } from "@/db/schema";
import {
  collectBackfillYearMonths,
  importedFxNeedsRewrite,
  recomputeImportedFx,
  type ImportedFxRow,
} from "@/features/currency/recompute-imported-fx";
import {
  createRateLookupFromMap,
  loadSeededMonthlyRates,
} from "@/features/currency/monthly-rates";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

export async function backfillImportedFxForWorkspace(
  context: CurrentWorkspaceContext,
  db: DbExecutor,
): Promise<{ updatedCount: number }> {
  const candidateRows = await db
    .select({
      id: transactions.id,
      originalAmount: transactions.originalAmount,
      originalCurrency: transactions.originalCurrency,
      settlementAmount: transactions.settlementAmount,
      settlementCurrency: transactions.settlementCurrency,
      statementSection: transactions.statementSection,
      transactionDate: transactions.transactionDate,
      workspaceCurrency: transactions.workspaceCurrency,
      normalizedAmount: transactions.normalizedAmount,
      normalizationRate: transactions.normalizationRate,
      normalizationRateSource: transactions.normalizationRateSource,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        or(
          sql`coalesce(${transactions.normalizationRateSource}, '') like '%placeholder%'`,
          and(
            sql`${transactions.originalCurrency} is not distinct from ${transactions.settlementCurrency}`,
            sql`abs(${transactions.originalAmount} - coalesce(${transactions.settlementAmount}, ${transactions.originalAmount})) > 0.06 * greatest(abs(${transactions.originalAmount}), abs(coalesce(${transactions.settlementAmount}, ${transactions.originalAmount})), 0.000001)`,
          ),
          sql`coalesce(${transactions.statementSection}, '') like '%אירו%'`,
          sql`coalesce(${transactions.statementSection}, '') like '%דולר%'`,
        ),
      ),
    );

  if (candidateRows.length === 0) {
    return { updatedCount: 0 };
  }

  const rates = createRateLookupFromMap(
    await loadSeededMonthlyRates(db, collectBackfillYearMonths(candidateRows)),
  );
  const changedIds: string[] = [];

  for (const row of candidateRows) {
    const current: ImportedFxRow = {
      originalAmount: Number(row.originalAmount),
      originalCurrency: row.originalCurrency,
      settlementAmount: row.settlementAmount === null ? null : Number(row.settlementAmount),
      settlementCurrency: row.settlementCurrency,
      statementSection: row.statementSection,
      transactionDate: row.transactionDate,
      workspaceCurrency: row.workspaceCurrency || context.baseCurrency,
      normalizedAmount: Number(row.normalizedAmount),
      normalizationRate: row.normalizationRate === null ? null : Number(row.normalizationRate),
      normalizationRateSource: row.normalizationRateSource,
    };
    const next = recomputeImportedFx(current, rates);

    if (!importedFxNeedsRewrite(current, next)) {
      continue;
    }

    await db
      .update(transactions)
      .set({
        originalCurrency: next.originalCurrency,
        settlementCurrency: next.settlementCurrency,
        normalizedAmount: next.normalizedAmount.toFixed(6),
        normalizationRate: next.normalizationRate.toFixed(8),
        normalizationRateSource: next.normalizationRateSource,
        updatedAt: new Date(),
      })
      .where(eq(transactions.id, row.id));
    changedIds.push(row.id);
  }

  if (changedIds.length > 0) {
    await syncTransactionExpenseEvents(context, changedIds, db);
  }

  return { updatedCount: changedIds.length };
}

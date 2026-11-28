import Big from "big.js";
import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { DbExecutor } from "@/db";
import {
  expenseEvents,
  expenseAllocations,
  sharedExpenseSplits,
  transactionClassifications,
  transactions,
} from "@/db/schema";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";

export class RefundLinkError extends Error {}

export function refundValue(
  original: string,
  valued: string,
  returned: string,
  alreadyReturned: string,
  alreadyValued: string,
) {
  const cumulative = Big(alreadyReturned).plus(returned);
  if (Big(returned).lte(0) || Big(original).lte(0) || cumulative.gt(original)) {
    throw new RefundLinkError(
      "The refund exceeds the remaining purchase amount.",
    );
  }
  const total = cumulative.eq(original)
    ? Big(valued)
    : Big(valued).times(cumulative).div(original).round(2);
  return total.minus(alreadyValued).toFixed(6);
}

export async function refundCandidates(
  db: DbExecutor,
  workspace: string,
  id: string,
) {
  const [credit] = await db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.workspaceId, workspace), eq(transactions.id, id)),
    );
  if (
    !credit ||
    credit.direction !== "credit" ||
    !credit.settlementCurrency ||
    !credit.settlementAmount ||
    credit.refundOfTransactionId ||
    credit.valuationPolicy !== "previous-month-v1" ||
    credit.valuationState === "recorded" ||
    credit.settlementCurrency === credit.workspaceCurrency
  )
    return [];
  const linked = alias(transactions, "linked_credit");
  const alreadyReturned = db
    .select({ amount: sql`coalesce(sum(${linked.settlementAmount}), 0)` })
    .from(linked)
    .where(and(
      eq(linked.refundOfTransactionId, transactions.id),
      eq(linked.workspaceId, transactions.workspaceId),
    ));
  return db
    .select({
      id: transactions.id,
      date: transactions.transactionDate,
      description: transactions.description,
      amount: transactions.settlementAmount,
      currency: transactions.settlementCurrency,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspace),
        eq(transactions.accountId, credit.accountId),
        eq(transactions.settlementCurrency, credit.settlementCurrency),
        eq(transactions.workspaceCurrency, credit.workspaceCurrency),
        eq(transactions.direction, "debit"),
        lte(transactions.transactionDate, credit.transactionDate),
        sql`${transactions.settlementAmount} - ${alreadyReturned} >= ${credit.settlementAmount}`,
        sql`${transactions.normalizationRate} > 0
        and coalesce(${transactions.normalizationRateSource},'') not like '%placeholder%'
        and ${transactions.valuationState} <> 'pending'`,
      ),
    )
    .orderBy(desc(transactions.transactionDate), asc(transactions.id))
    .limit(100);
}

// Call inside the request transaction so purchase locking covers all linked credits.
export async function linkRefund(
  tx: DbExecutor,
  context: CurrentWorkspaceContext,
  creditId: string,
  purchaseId: string,
) {
  const pair = await tx
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        inArray(transactions.id, [creditId, purchaseId]),
      ),
    )
    .orderBy(asc(transactions.id))
    .for("update");
  const credit = pair.find((row) => row.id === creditId);
  const purchase = pair.find((row) => row.id === purchaseId);
  if (
    !credit ||
    !purchase ||
    !credit.settlementAmount ||
    !purchase.settlementAmount ||
    credit.direction !== "credit" ||
    purchase.direction !== "debit" ||
    credit.transactionDate < purchase.transactionDate ||
    credit.accountId !== purchase.accountId ||
    credit.workspaceCurrency !== purchase.workspaceCurrency ||
    !credit.settlementCurrency ||
    credit.settlementCurrency !== purchase.settlementCurrency ||
    credit.settlementCurrency === credit.workspaceCurrency ||
    credit.valuationPolicy !== "previous-month-v1" ||
    credit.valuationState === "recorded" ||
    purchase.valuationState === "pending" ||
    !Number(purchase.normalizationRate) ||
    purchase.normalizationRateSource?.includes("placeholder")
  ) {
    throw new RefundLinkError(
      "Choose a valued purchase billed to the same account in the refund currency.",
    );
  }
  if (credit.refundOfTransactionId === purchaseId)
    return { normalizedAmount: credit.normalizedAmount };
  await tx
    .select({ id: transactionClassifications.id })
    .from(transactionClassifications)
    .where(eq(transactionClassifications.transactionId, creditId))
    .for("update");
  const events = await tx
    .select({ id: expenseEvents.id, mode: expenseEvents.reportingMode })
    .from(expenseEvents)
    .where(
      and(
        eq(expenseEvents.sourceId, creditId),
        eq(expenseEvents.sourceType, "transaction"),
        eq(expenseEvents.workspaceId, context.workspaceId),
      ),
    )
    .for("update");
  let protectedEvent = events.length > 1;
  for (const event of events) {
    const splits = await tx
      .select({ id: sharedExpenseSplits.id })
      .from(sharedExpenseSplits)
      .where(eq(sharedExpenseSplits.expenseEventId, event.id))
      .for("update");
    const allocations = await tx
      .select({ method: expenseAllocations.allocationMethod })
      .from(expenseAllocations)
      .where(eq(expenseAllocations.expenseEventId, event.id))
      .for("update");
    protectedEvent ||=
      event.mode !== "payment_date" ||
      !!splits.length ||
      allocations.some((row) => row.method !== "single_month");
  }
  if (credit.refundOfTransactionId || protectedEvent)
    throw new RefundLinkError(
      "This credit already has a link, saved split, or custom allocation. Its value is protected.",
    );
  const [prior] = await tx
    .select({
      amount: sql<string>`coalesce(sum(${transactions.settlementAmount}),0)::text`,
      value: sql<string>`coalesce(sum(${transactions.normalizedAmount}),0)::text`,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        eq(transactions.refundOfTransactionId, purchaseId),
      ),
    );
  const normalizedAmount = refundValue(
    purchase.settlementAmount,
    purchase.normalizedAmount,
    credit.settlementAmount,
    prior.amount,
    prior.value,
  );
  await tx
    .update(transactions)
    .set({
      refundOfTransactionId: purchaseId,
      normalizedAmount,
      normalizationRate: purchase.normalizationRate,
      normalizationRateSource: "linked-purchase-refund",
      referenceMonth: purchase.referenceMonth,
      exchangeRateId: purchase.exchangeRateId,
      valuationState: "converted",
      updatedAt: new Date(),
    })
    .where(eq(transactions.id, credit.id));
  await syncTransactionExpenseEvents(context, [creditId], tx);
  return { normalizedAmount };
}

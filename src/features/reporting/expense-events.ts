import { and, asc, eq, gte, inArray, lt, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenseAllocations,
  expenseEvents,
  manualEntries,
  transactions,
  transactionClassifications,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import {
  buildSingleMonthAllocation,
  rebuildStoredAllocations,
  type AllocationMethod,
} from "@/features/expenses/allocation-core";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { addMonths, monthKey, startOfMonth } from "@/lib/dates/months";

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

type ExpenseEventSourceType = "transaction" | "manual" | "recurring";
type ExpenseEventKind = "expense" | "income";

type ActiveSourceRow = {
  sourceId: string;
  sourceType: ExpenseEventSourceType;
  eventKind: ExpenseEventKind;
  title: string;
  totalAmount: string;
  workspaceCurrency: string;
  classificationType: ClassificationType;
  payerMemberId: string | null;
  category: string | null;
  reportingMode: "payment_date";
  reportMonth: string;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
};

type ExistingExpenseEventRow = {
  id: string;
  sourceId: string;
  sourceType: ExpenseEventSourceType;
  reportingMode: "payment_date" | "allocated_period";
  allocations: ExistingExpenseAllocationRow[];
};

type ExistingExpenseAllocationRow = {
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  reportMonth: string;
  allocatedAmount: string;
};

type MonthRangeInput = {
  startMonth: string;
  endMonth: string;
};

function normalizeIds(ids: string[]) {
  return Array.from(new Set(ids));
}

function eventRowKey(input: {
  sourceType: ExpenseEventSourceType;
  sourceId: string;
}) {
  return `${input.sourceType}:${input.sourceId}`;
}

function actualDateToReportMonth(value: string) {
  return monthKey(startOfMonth(new Date(`${value}T00:00:00.000Z`)));
}

function buildRangeWindow(input: MonthRangeInput) {
  const rangeStart = actualDateToReportMonth(input.startMonth);
  const nextMonthStart = monthKey(
    addMonths(new Date(`${actualDateToReportMonth(input.endMonth)}T00:00:00.000Z`), 1),
  );

  return {
    rangeStart,
    nextMonthStart,
  };
}

function classificationToEventKind(classificationType: ClassificationType): ExpenseEventKind {
  return classificationType === "income" ? "income" : "expense";
}

function manualEntryToEventSourceType(
  sourceType: "one_time_manual" | "recurring_generated",
): ExpenseEventSourceType {
  return sourceType === "recurring_generated" ? "recurring" : "manual";
}

async function deleteEventIds(db: DbExecutor, eventIds: string[]) {
  if (eventIds.length === 0) {
    return;
  }

  await db.delete(expenseAllocations).where(inArray(expenseAllocations.expenseEventId, eventIds));
  await db.delete(expenseEvents).where(inArray(expenseEvents.id, eventIds));
}

async function applyExpenseEventSync(
  db: DbExecutor,
  context: CurrentWorkspaceContext,
  inputIds: string[],
  activeRows: ActiveSourceRow[],
  existingRows: ExistingExpenseEventRow[],
) {
  const groupedExistingRows = new Map<string, ExistingExpenseEventRow[]>();

  for (const row of existingRows) {
    const key = eventRowKey(row);
    const current = groupedExistingRows.get(key) ?? [];
    current.push(row);
    groupedExistingRows.set(key, current);
  }

  const activeKeys = new Set(activeRows.map((row) => eventRowKey(row)));

  for (const row of activeRows) {
    const key = eventRowKey(row);
    const currentRows = groupedExistingRows.get(key) ?? [];
    const [primaryRow, ...duplicateRows] = currentRows;
    let eventId = primaryRow?.id;
    const shouldPreserveAllocations = primaryRow?.reportingMode === "allocated_period";
    const nextReportingMode = shouldPreserveAllocations
      ? primaryRow.reportingMode
      : row.reportingMode;

    if (!eventId) {
      const [createdEvent] = await db
        .insert(expenseEvents)
        .values({
          workspaceId: context.workspaceId,
          sourceType: row.sourceType,
          sourceId: row.sourceId,
          eventKind: row.eventKind,
          title: row.title,
          totalAmount: row.totalAmount,
          workspaceCurrency: row.workspaceCurrency,
          classificationType: row.classificationType,
          payerMemberId: row.payerMemberId,
          category: row.category,
          reportingMode: nextReportingMode,
        })
        .returning({
          id: expenseEvents.id,
        });

      eventId = createdEvent.id;
    } else {
      await db
        .update(expenseEvents)
        .set({
          eventKind: row.eventKind,
          title: row.title,
          totalAmount: row.totalAmount,
          workspaceCurrency: row.workspaceCurrency,
          classificationType: row.classificationType,
          payerMemberId: row.payerMemberId,
          category: row.category,
          reportingMode: nextReportingMode,
          updatedAt: new Date(),
        })
        .where(eq(expenseEvents.id, eventId));
    }

    if (duplicateRows.length > 0) {
      await deleteEventIds(
        db,
        duplicateRows.map((duplicateRow) => duplicateRow.id),
      );
    }

    const nextAllocations = shouldPreserveAllocations
      ? rebuildStoredAllocations({
          amount: row.totalAmount,
          sourceDate: row.coverageStartDate ?? row.reportMonth,
          rows: primaryRow?.allocations ?? [],
        })
      : buildSingleMonthAllocation({
          amount: row.totalAmount,
          sourceDate: row.coverageStartDate ?? row.reportMonth,
        });

    await db.delete(expenseAllocations).where(eq(expenseAllocations.expenseEventId, eventId));
    await db.insert(expenseAllocations).values(
      nextAllocations.map((allocation) => ({
        expenseEventId: eventId,
        reportMonth: allocation.reportMonth,
        allocatedAmount: allocation.allocatedAmount,
        allocationMethod: allocation.allocationMethod,
        coverageStartDate: allocation.coverageStartDate,
        coverageEndDate: allocation.coverageEndDate,
      })),
    );
  }

  const staleEventIds = existingRows
    .filter((row) => !activeKeys.has(eventRowKey(row)) && inputIds.includes(row.sourceId))
    .map((row) => row.id);

  await deleteEventIds(db, staleEventIds);
}

async function listExistingExpenseEvents(
  db: DbExecutor,
  context: CurrentWorkspaceContext,
  input: {
    sourceIds: string[];
    sourceTypes: ExpenseEventSourceType[];
  },
) {
  if (input.sourceIds.length === 0 || input.sourceTypes.length === 0) {
    return [];
  }

  const existingRows = await db
    .select({
      id: expenseEvents.id,
      sourceId: expenseEvents.sourceId,
      sourceType: expenseEvents.sourceType,
      reportingMode: expenseEvents.reportingMode,
    })
    .from(expenseEvents)
    .where(
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        inArray(expenseEvents.sourceId, input.sourceIds),
        inArray(expenseEvents.sourceType, input.sourceTypes),
      ),
    )
    .orderBy(asc(expenseEvents.createdAt));

  if (existingRows.length === 0) {
    return [];
  }

  const allocationRows = await db
    .select({
      expenseEventId: expenseAllocations.expenseEventId,
      allocationMethod: expenseAllocations.allocationMethod,
      coverageStartDate: expenseAllocations.coverageStartDate,
      coverageEndDate: expenseAllocations.coverageEndDate,
      reportMonth: expenseAllocations.reportMonth,
      allocatedAmount: expenseAllocations.allocatedAmount,
    })
    .from(expenseAllocations)
    .where(
      inArray(
        expenseAllocations.expenseEventId,
        existingRows.map((row) => row.id),
      ),
    )
    .orderBy(asc(expenseAllocations.reportMonth), asc(expenseAllocations.createdAt));

  const allocationsByEventId = new Map<string, ExistingExpenseAllocationRow[]>();

  for (const row of allocationRows) {
    const current = allocationsByEventId.get(row.expenseEventId) ?? [];
    current.push({
      allocationMethod: row.allocationMethod,
      coverageStartDate: row.coverageStartDate,
      coverageEndDate: row.coverageEndDate,
      reportMonth: row.reportMonth,
      allocatedAmount: row.allocatedAmount,
    });
    allocationsByEventId.set(row.expenseEventId, current);
  }

  return existingRows.map((row) => ({
    ...row,
    allocations: allocationsByEventId.get(row.id) ?? [],
  }));
}

export async function syncTransactionExpenseEvents(
  context: CurrentWorkspaceContext,
  transactionIds: string[],
  db: DbExecutor = getDb(),
) {
  const normalizedIds = normalizeIds(transactionIds);

  if (normalizedIds.length === 0) {
    return;
  }

  const [qualifiedTransactions, existingRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
        description: transactions.description,
        merchantRaw: transactions.merchantRaw,
        normalizedAmount: transactions.normalizedAmount,
        workspaceCurrency: transactions.workspaceCurrency,
        classificationType: transactionClassifications.classificationType,
        memberOwnerId: transactionClassifications.memberOwnerId,
        category: transactionClassifications.category,
        transactionDate: transactions.transactionDate,
      })
      .from(transactions)
      .innerJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          inArray(transactions.id, normalizedIds),
          ne(transactionClassifications.classificationType, "transfer"),
          ne(transactionClassifications.classificationType, "ignore"),
        ),
      ),
    listExistingExpenseEvents(db, context, {
      sourceIds: normalizedIds,
      sourceTypes: ["transaction"],
    }),
  ]);

  const activeRows: ActiveSourceRow[] = qualifiedTransactions.map((transaction) => ({
    sourceId: transaction.id,
    sourceType: "transaction",
    eventKind: classificationToEventKind(transaction.classificationType),
    title: transaction.merchantRaw?.trim() || transaction.description,
    totalAmount: transaction.normalizedAmount,
    workspaceCurrency: transaction.workspaceCurrency,
    classificationType: transaction.classificationType,
    payerMemberId: transaction.memberOwnerId,
    category: transaction.category,
    reportingMode: "payment_date",
    reportMonth: actualDateToReportMonth(transaction.transactionDate),
    coverageStartDate: transaction.transactionDate,
    coverageEndDate: transaction.transactionDate,
  }));

  await applyExpenseEventSync(db, context, normalizedIds, activeRows, existingRows);
}

export async function syncManualEntryExpenseEvents(
  context: CurrentWorkspaceContext,
  manualEntryIds: string[],
  db: DbExecutor = getDb(),
) {
  const normalizedIds = normalizeIds(manualEntryIds);

  if (normalizedIds.length === 0) {
    return;
  }

  const [qualifiedEntries, existingRows] = await Promise.all([
    db
      .select({
        id: manualEntries.id,
        sourceType: manualEntries.sourceType,
        eventKind: manualEntries.eventKind,
        title: manualEntries.title,
        normalizedAmount: manualEntries.normalizedAmount,
        workspaceCurrency: manualEntries.workspaceCurrency,
        classificationType: manualEntries.classificationType,
        payerMemberId: manualEntries.payerMemberId,
        category: manualEntries.category,
        eventDate: manualEntries.eventDate,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          inArray(manualEntries.id, normalizedIds),
          ne(manualEntries.classificationType, "transfer"),
          ne(manualEntries.classificationType, "ignore"),
        ),
      ),
    listExistingExpenseEvents(db, context, {
      sourceIds: normalizedIds,
      sourceTypes: ["manual", "recurring"],
    }),
  ]);

  const activeRows: ActiveSourceRow[] = qualifiedEntries.map((entry) => ({
    sourceId: entry.id,
    sourceType: manualEntryToEventSourceType(entry.sourceType),
    eventKind: entry.eventKind,
    title: entry.title,
    totalAmount: entry.normalizedAmount,
    workspaceCurrency: entry.workspaceCurrency,
    classificationType: entry.classificationType,
    payerMemberId: entry.payerMemberId,
    category: entry.category,
    reportingMode: "payment_date",
    reportMonth: actualDateToReportMonth(entry.eventDate),
    coverageStartDate: entry.eventDate,
    coverageEndDate: entry.eventDate,
  }));

  await applyExpenseEventSync(db, context, normalizedIds, activeRows, existingRows);
}

export async function syncExpenseEventsForRange(
  context: CurrentWorkspaceContext,
  input: MonthRangeInput,
  db: DbExecutor = getDb(),
) {
  const { rangeStart, nextMonthStart } = buildRangeWindow(input);
  const [transactionRows, manualEntryRows] = await Promise.all([
    db
      .select({
        id: transactions.id,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, context.workspaceId),
          gte(transactions.transactionDate, rangeStart),
          lt(transactions.transactionDate, nextMonthStart),
        ),
      ),
    db
      .select({
        id: manualEntries.id,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          gte(manualEntries.eventDate, rangeStart),
          lt(manualEntries.eventDate, nextMonthStart),
        ),
      ),
  ]);

  await syncTransactionExpenseEvents(
    context,
    transactionRows.map((row) => row.id),
    db,
  );
  await syncManualEntryExpenseEvents(
    context,
    manualEntryRows.map((row) => row.id),
    db,
  );
}

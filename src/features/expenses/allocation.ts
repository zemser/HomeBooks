import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenseAllocations,
  expenseEvents,
  manualEntries,
  transactions,
  transactionClassifications,
} from "@/db/schema";
import {
  type AllocationLine,
  type AllocationMethod,
  type AllocationStrategy,
  type ExpenseAllocation,
  type ExpenseAllocationState,
  type ReportingMode,
  buildEqualMonthlyAllocations,
  buildManualMonthlyAllocations,
  buildSingleMonthAllocation,
  normalizeDateInput,
} from "@/features/expenses/allocation-core";
import {
  syncManualEntryExpenseEvents,
  syncTransactionExpenseEvents,
} from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

export type {
  AllocationMethod,
  AllocationStrategy,
  ExpenseAllocation,
  ExpenseAllocationState,
  ReportingMode,
} from "@/features/expenses/allocation-core";

export type AllocationSourceType = "transaction" | "manual";
export type TransactionAllocationLine = AllocationLine;
export type TransactionAllocationState = ExpenseAllocationState;

type UpdateExpenseAllocationInput = {
  sourceType: AllocationSourceType;
  sourceId: string;
  reportingMode: ReportingMode;
  allocationStrategy?: AllocationStrategy | null;
  coverageStartDate?: string | null;
  coverageEndDate?: string | null;
  allocations?: Array<{
    reportMonth: string;
    allocatedAmount: string;
  }> | null;
};

type UpdateTransactionAllocationInput = Omit<
  UpdateExpenseAllocationInput,
  "sourceType" | "sourceId"
> & {
  transactionId: string;
};

type AllocationSourceRecord = {
  sourceId: string;
  sourceType: AllocationSourceType;
  normalizedAmount: string;
  sourceDate: string;
  expenseEventId: string;
};

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

function mapAllocationState(
  rows: Array<{
    expenseEventId: string;
    reportingMode: ReportingMode;
    allocationMethod: AllocationMethod;
    coverageStartDate: string | null;
    coverageEndDate: string | null;
    reportMonth: string;
    allocatedAmount: string;
  }>,
) {
  if (rows.length === 0) {
    return null;
  }

  return {
    expenseEventId: rows[0].expenseEventId,
    reportingMode: rows[0].reportingMode,
    allocationCount: rows.length,
    allocationMethod: rows[0].allocationMethod,
    coverageStartDate: rows[0].coverageStartDate,
    coverageEndDate: rows[0].coverageEndDate,
    reportMonths: rows.map((row) => row.reportMonth),
    allocations: rows.map((row) => ({
      reportMonth: row.reportMonth,
      allocatedAmount: row.allocatedAmount,
      allocationMethod: row.allocationMethod,
    })),
  } satisfies ExpenseAllocationState;
}

async function listAllocationStatesBySourceType(
  context: CurrentWorkspaceContext,
  sourceType: AllocationSourceType,
  sourceIds: string[],
  db: DbExecutor = getDb(),
) {
  const normalizedIds = Array.from(new Set(sourceIds));

  if (normalizedIds.length === 0) {
    return new Map<string, ExpenseAllocationState>();
  }

  const rows = await db
    .select({
      sourceId: expenseEvents.sourceId,
      expenseEventId: expenseEvents.id,
      reportingMode: expenseEvents.reportingMode,
      allocationMethod: expenseAllocations.allocationMethod,
      coverageStartDate: expenseAllocations.coverageStartDate,
      coverageEndDate: expenseAllocations.coverageEndDate,
      reportMonth: expenseAllocations.reportMonth,
      allocatedAmount: expenseAllocations.allocatedAmount,
    })
    .from(expenseEvents)
    .innerJoin(expenseAllocations, eq(expenseAllocations.expenseEventId, expenseEvents.id))
    .where(
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        eq(expenseEvents.sourceType, sourceType),
        inArray(expenseEvents.sourceId, normalizedIds),
      ),
    )
    .orderBy(asc(expenseAllocations.reportMonth), asc(expenseAllocations.createdAt));

  const rowsBySourceId = new Map<string, typeof rows>();

  for (const row of rows) {
    const current = rowsBySourceId.get(row.sourceId) ?? [];
    current.push(row);
    rowsBySourceId.set(row.sourceId, current);
  }

  return new Map(
    normalizedIds.flatMap((sourceId) => {
      const state = mapAllocationState(rowsBySourceId.get(sourceId) ?? []);
      return state ? [[sourceId, state] as const] : [];
    }),
  );
}

export async function listTransactionAllocationStates(
  context: CurrentWorkspaceContext,
  transactionIds: string[],
  db: DbExecutor = getDb(),
) {
  return listAllocationStatesBySourceType(context, "transaction", transactionIds, db);
}

export async function listManualEntryAllocationStates(
  context: CurrentWorkspaceContext,
  manualEntryIds: string[],
  db: DbExecutor = getDb(),
) {
  return listAllocationStatesBySourceType(context, "manual", manualEntryIds, db);
}

async function syncAllocationSource(
  context: CurrentWorkspaceContext,
  input: Pick<UpdateExpenseAllocationInput, "sourceType" | "sourceId">,
  db: DbExecutor,
) {
  if (input.sourceType === "manual") {
    await syncManualEntryExpenseEvents(context, [input.sourceId], db);
    return;
  }

  await syncTransactionExpenseEvents(context, [input.sourceId], db);
}

async function loadTransactionAllocationSource(
  context: CurrentWorkspaceContext,
  sourceId: string,
  db: DbExecutor,
) {
  return db
    .select({
      sourceId: transactions.id,
      normalizedAmount: transactions.normalizedAmount,
      sourceDate: transactions.transactionDate,
      expenseEventId: expenseEvents.id,
    })
    .from(transactions)
    .innerJoin(
      transactionClassifications,
      eq(transactionClassifications.transactionId, transactions.id),
    )
    .innerJoin(
      expenseEvents,
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        eq(expenseEvents.sourceType, "transaction"),
        eq(expenseEvents.sourceId, transactions.id),
      ),
    )
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        eq(transactions.id, sourceId),
        ne(transactionClassifications.classificationType, "transfer"),
        ne(transactionClassifications.classificationType, "ignore"),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

async function loadManualAllocationSource(
  context: CurrentWorkspaceContext,
  sourceId: string,
  db: DbExecutor,
) {
  return db
    .select({
      sourceId: manualEntries.id,
      normalizedAmount: manualEntries.normalizedAmount,
      sourceDate: manualEntries.eventDate,
      expenseEventId: expenseEvents.id,
    })
    .from(manualEntries)
    .innerJoin(
      expenseEvents,
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        eq(expenseEvents.sourceType, "manual"),
        eq(expenseEvents.sourceId, manualEntries.id),
      ),
    )
    .where(
      and(
        eq(manualEntries.workspaceId, context.workspaceId),
        eq(manualEntries.id, sourceId),
        eq(manualEntries.sourceType, "one_time_manual"),
        ne(manualEntries.classificationType, "transfer"),
        ne(manualEntries.classificationType, "ignore"),
      ),
    )
    .then((rows) => rows[0] ?? null);
}

async function loadAllocationSource(
  context: CurrentWorkspaceContext,
  input: Pick<UpdateExpenseAllocationInput, "sourceType" | "sourceId">,
  db: DbExecutor,
): Promise<AllocationSourceRecord | null> {
  if (input.sourceType === "manual") {
    const source = await loadManualAllocationSource(context, input.sourceId, db);

    return source
      ? {
          ...source,
          sourceType: input.sourceType,
        }
      : null;
  }

  const source = await loadTransactionAllocationSource(context, input.sourceId, db);

  return source
    ? {
        ...source,
        sourceType: input.sourceType,
      }
    : null;
}

export async function updateExpenseAllocation(
  context: CurrentWorkspaceContext,
  input: UpdateExpenseAllocationInput,
) {
  const db = getDb();
  const coverageStartDate = normalizeDateInput(input.coverageStartDate);
  const coverageEndDate = normalizeDateInput(input.coverageEndDate);

  return db.transaction(async (tx) => {
    await syncAllocationSource(context, input, tx);

    const source = await loadAllocationSource(context, input, tx);

    if (!source) {
      throw new Error(
        input.sourceType === "manual"
          ? "One-time manual entry must exist and stay reportable before allocations can be edited."
          : "Transaction must be classified as an expense or income before allocations can be edited.",
      );
    }

    let allocations: ExpenseAllocation[];

    if (input.reportingMode === "allocated_period") {
      if (input.allocationStrategy === "manual_split") {
        allocations = buildManualMonthlyAllocations({
          amount: source.normalizedAmount,
          rows: input.allocations ?? [],
        });
      } else {
        if (!coverageStartDate || !coverageEndDate) {
          throw new Error("Adjusted-period allocations require coverage start and end dates.");
        }

        if (coverageStartDate > coverageEndDate) {
          throw new Error("Coverage start date must be before or equal to coverage end date.");
        }

        allocations = buildEqualMonthlyAllocations({
          amount: source.normalizedAmount,
          coverageStart: new Date(`${coverageStartDate}T00:00:00.000Z`),
          coverageEnd: new Date(`${coverageEndDate}T00:00:00.000Z`),
        });
      }
    } else {
      allocations = buildSingleMonthAllocation({
        amount: source.normalizedAmount,
        sourceDate: source.sourceDate,
      });
    }

    await tx
      .update(expenseEvents)
      .set({
        reportingMode: input.reportingMode,
        updatedAt: new Date(),
      })
      .where(eq(expenseEvents.id, source.expenseEventId));

    await tx
      .delete(expenseAllocations)
      .where(eq(expenseAllocations.expenseEventId, source.expenseEventId));

    await tx.insert(expenseAllocations).values(
      allocations.map((allocation) => ({
        expenseEventId: source.expenseEventId,
        reportMonth: allocation.reportMonth,
        allocatedAmount: allocation.allocatedAmount,
        allocationMethod: allocation.allocationMethod,
        coverageStartDate: allocation.coverageStartDate,
        coverageEndDate: allocation.coverageEndDate,
      })),
    );

    return {
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      reportingMode: input.reportingMode,
      allocationCount: allocations.length,
      allocationMethod: allocations[0]?.allocationMethod ?? "single_month",
    };
  });
}

export async function updateTransactionAllocation(
  context: CurrentWorkspaceContext,
  input: UpdateTransactionAllocationInput,
) {
  const result = await updateExpenseAllocation(context, {
    sourceType: "transaction",
    sourceId: input.transactionId,
    reportingMode: input.reportingMode,
    allocationStrategy: input.allocationStrategy,
    coverageStartDate: input.coverageStartDate,
    coverageEndDate: input.coverageEndDate,
    allocations: input.allocations,
  });

  return {
    transactionId: result.sourceId,
    reportingMode: result.reportingMode,
    allocationCount: result.allocationCount,
    allocationMethod: result.allocationMethod,
  };
}

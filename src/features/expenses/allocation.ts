import { and, asc, eq, inArray, ne } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenseAllocations,
  expenseEvents,
  transactions,
  transactionClassifications,
} from "@/db/schema";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listMonthsBetween, monthKey, startOfMonth } from "@/lib/dates/months";

export type AllocationMethod = "single_month" | "equal_split" | "manual_split";
export type ReportingMode = "payment_date" | "allocated_period";
export type AllocationStrategy = "equal_split" | "manual_split";

export type ExpenseAllocation = {
  reportMonth: string;
  allocatedAmount: string;
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
};

export type TransactionAllocationLine = {
  reportMonth: string;
  allocatedAmount: string;
  allocationMethod: AllocationMethod;
};

export type TransactionAllocationState = {
  expenseEventId: string;
  reportingMode: ReportingMode;
  allocationCount: number;
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  reportMonths: string[];
  allocations: TransactionAllocationLine[];
};

type EqualAllocationInput = {
  amount: string;
  coverageStart: Date;
  coverageEnd: Date;
};

type ManualAllocationInput = {
  amount: string;
  rows: Array<{
    reportMonth: string;
    allocatedAmount: string;
  }>;
};

type UpdateTransactionAllocationInput = {
  transactionId: string;
  reportingMode: ReportingMode;
  allocationStrategy?: AllocationStrategy | null;
  coverageStartDate?: string | null;
  coverageEndDate?: string | null;
  allocations?: Array<{
    reportMonth: string;
    allocatedAmount: string;
  }> | null;
};

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

const MICRO_MULTIPLIER = 1_000_000n;

function normalizeDateInput(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Coverage dates must use YYYY-MM-DD.");
  }

  return trimmed;
}

function normalizeReportMonthInput(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.length === 7 ? `${trimmed}-01` : trimmed;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Allocation months must use YYYY-MM or YYYY-MM-01.");
  }

  return monthKey(parsed);
}

function amountStringToMicros(amount: string) {
  const normalized = amount.trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Allocation amounts must be numeric.");
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const safeWhole = wholePart === "" ? "0" : wholePart;
  const paddedFraction = `${fractionPart}000000`.slice(0, 6);
  const micros = BigInt(safeWhole) * MICRO_MULTIPLIER + BigInt(paddedFraction);

  return negative ? micros * -1n : micros;
}

function microsToAmountString(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const whole = absolute / MICRO_MULTIPLIER;
  const fraction = absolute % MICRO_MULTIPLIER;
  const fractionText = fraction.toString().padStart(6, "0");

  return `${negative ? "-" : ""}${whole.toString()}.${fractionText}`;
}

function actualDateToReportMonth(value: string) {
  return monthKey(startOfMonth(new Date(`${value}T00:00:00.000Z`)));
}

function monthKeyToCoverageStart(value: string) {
  return value;
}

function monthKeyToCoverageEnd(value: string) {
  const start = new Date(`${value}T00:00:00.000Z`);
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const lastDay = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  return lastDay.toISOString().slice(0, 10);
}

// Split micros first so the per-month allocations add back to the original amount.
export function buildEqualMonthlyAllocations(input: EqualAllocationInput): ExpenseAllocation[] {
  const { amount, coverageStart, coverageEnd } = input;
  const months = listMonthsBetween(coverageStart, coverageEnd);
  const totalMicros = amountStringToMicros(amount);
  const monthCount = BigInt(months.length);
  const baseMicros = totalMicros / monthCount;
  let remainder = totalMicros % monthCount;
  const coverageStartDate = input.coverageStart.toISOString().slice(0, 10);
  const coverageEndDate = input.coverageEnd.toISOString().slice(0, 10);

  return months.map((month) => {
    const direction = remainder === 0n ? 0n : remainder > 0n ? 1n : -1n;
    const bonus = direction;
    remainder -= direction;

    return {
      reportMonth: monthKey(month),
      allocatedAmount: microsToAmountString(baseMicros + bonus),
      allocationMethod: months.length === 1 ? "single_month" : "equal_split",
      coverageStartDate,
      coverageEndDate,
    };
  });
}

export function buildManualMonthlyAllocations(input: ManualAllocationInput): ExpenseAllocation[] {
  const rows = input.rows
    .map((row) => ({
      reportMonth: normalizeReportMonthInput(row.reportMonth),
      allocatedAmount: row.allocatedAmount.trim(),
    }))
    .sort((left, right) => left.reportMonth.localeCompare(right.reportMonth));

  if (rows.length === 0) {
    throw new Error("Manual split allocations require at least one month row.");
  }

  const uniqueMonths = new Set(rows.map((row) => row.reportMonth));

  if (uniqueMonths.size !== rows.length) {
    throw new Error("Manual split allocations cannot repeat the same month.");
  }

  const totalMicros = amountStringToMicros(input.amount);
  const allocatedMicros = rows.reduce(
    (sum, row) => sum + amountStringToMicros(row.allocatedAmount),
    0n,
  );

  if (allocatedMicros !== totalMicros) {
    throw new Error("Manual split amounts must add up to the transaction total.");
  }

  const coverageStartDate = monthKeyToCoverageStart(rows[0].reportMonth);
  const coverageEndDate = monthKeyToCoverageEnd(rows[rows.length - 1].reportMonth);

  return rows.map((row) => ({
    reportMonth: row.reportMonth,
    allocatedAmount: microsToAmountString(amountStringToMicros(row.allocatedAmount)),
    allocationMethod: rows.length === 1 ? "single_month" : "manual_split",
    coverageStartDate,
    coverageEndDate,
  }));
}

function buildSingleMonthAllocation(input: {
  amount: string;
  sourceDate: string;
}): ExpenseAllocation[] {
  return [
    {
      reportMonth: actualDateToReportMonth(input.sourceDate),
      allocatedAmount: input.amount,
      allocationMethod: "single_month",
      coverageStartDate: input.sourceDate,
      coverageEndDate: input.sourceDate,
    },
  ];
}

function mapAllocationState(rows: Array<{
  expenseEventId: string;
  reportingMode: ReportingMode;
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  reportMonth: string;
  allocatedAmount: string;
}>) {
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
  } satisfies TransactionAllocationState;
}

export async function listTransactionAllocationStates(
  context: CurrentWorkspaceContext,
  transactionIds: string[],
  db: DbExecutor = getDb(),
) {
  const normalizedIds = Array.from(new Set(transactionIds));

  if (normalizedIds.length === 0) {
    return new Map<string, TransactionAllocationState>();
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
        eq(expenseEvents.sourceType, "transaction"),
        inArray(expenseEvents.sourceId, normalizedIds),
      ),
    )
    .orderBy(asc(expenseAllocations.reportMonth), asc(expenseAllocations.createdAt));

  const rowsByTransactionId = new Map<string, typeof rows>();

  for (const row of rows) {
    const current = rowsByTransactionId.get(row.sourceId) ?? [];
    current.push(row);
    rowsByTransactionId.set(row.sourceId, current);
  }

  return new Map(
    normalizedIds.flatMap((transactionId) => {
      const state = mapAllocationState(rowsByTransactionId.get(transactionId) ?? []);
      return state ? [[transactionId, state] as const] : [];
    }),
  );
}

export async function updateTransactionAllocation(
  context: CurrentWorkspaceContext,
  input: UpdateTransactionAllocationInput,
) {
  const db = getDb();
  const coverageStartDate = normalizeDateInput(input.coverageStartDate);
  const coverageEndDate = normalizeDateInput(input.coverageEndDate);

  return db.transaction(async (tx) => {
    await syncTransactionExpenseEvents(context, [input.transactionId], tx);

    const transaction = await tx
      .select({
        id: transactions.id,
        normalizedAmount: transactions.normalizedAmount,
        transactionDate: transactions.transactionDate,
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
          eq(transactions.id, input.transactionId),
          ne(transactionClassifications.classificationType, "transfer"),
          ne(transactionClassifications.classificationType, "ignore"),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!transaction) {
      throw new Error(
        "Transaction must be classified as an expense or income before allocations can be edited.",
      );
    }

    let allocations: ExpenseAllocation[];

    if (input.reportingMode === "allocated_period") {
      if (input.allocationStrategy === "manual_split") {
        allocations = buildManualMonthlyAllocations({
          amount: transaction.normalizedAmount,
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
          amount: transaction.normalizedAmount,
          coverageStart: new Date(`${coverageStartDate}T00:00:00.000Z`),
          coverageEnd: new Date(`${coverageEndDate}T00:00:00.000Z`),
        });
      }
    } else {
      allocations = buildSingleMonthAllocation({
        amount: transaction.normalizedAmount,
        sourceDate: transaction.transactionDate,
      });
    }

    await tx
      .update(expenseEvents)
      .set({
        reportingMode: input.reportingMode,
        updatedAt: new Date(),
      })
      .where(eq(expenseEvents.id, transaction.expenseEventId));

    await tx
      .delete(expenseAllocations)
      .where(eq(expenseAllocations.expenseEventId, transaction.expenseEventId));

    await tx.insert(expenseAllocations).values(
      allocations.map((allocation) => ({
        expenseEventId: transaction.expenseEventId,
        reportMonth: allocation.reportMonth,
        allocatedAmount: allocation.allocatedAmount,
        allocationMethod: allocation.allocationMethod,
        coverageStartDate: allocation.coverageStartDate,
        coverageEndDate: allocation.coverageEndDate,
      })),
    );

    return {
      transactionId: transaction.id,
      reportingMode: input.reportingMode,
      allocationCount: allocations.length,
      allocationMethod: allocations[0]?.allocationMethod ?? "single_month",
    };
  });
}

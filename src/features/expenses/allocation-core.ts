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

export type AllocationLine = {
  reportMonth: string;
  allocatedAmount: string;
  allocationMethod: AllocationMethod;
};

export type ExpenseAllocationState = {
  expenseEventId: string;
  reportingMode: ReportingMode;
  allocationCount: number;
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  reportMonths: string[];
  allocations: AllocationLine[];
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

type StoredAllocationRow = {
  allocationMethod: AllocationMethod;
  coverageStartDate: string | null;
  coverageEndDate: string | null;
  reportMonth: string;
  allocatedAmount: string;
};

const MICRO_MULTIPLIER = 1_000_000n;

export function normalizeDateInput(value?: string | null) {
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

export function normalizeReportMonthInput(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.length === 7 ? `${trimmed}-01` : trimmed;
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Allocation months must use YYYY-MM or YYYY-MM-01.");
  }

  return monthKey(parsed);
}

export function amountStringToMicros(amount: string) {
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

export function microsToAmountString(value: bigint) {
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

function monthKeyToCoverageEnd(value: string) {
  const start = new Date(`${value}T00:00:00.000Z`);
  const nextMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  const lastDay = new Date(nextMonth.getTime() - 24 * 60 * 60 * 1000);
  return lastDay.toISOString().slice(0, 10);
}

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
    throw new Error("Manual split amounts must add up to the source total.");
  }

  const coverageStartDate = rows[0].reportMonth;
  const coverageEndDate = monthKeyToCoverageEnd(rows[rows.length - 1].reportMonth);

  return rows.map((row) => ({
    reportMonth: row.reportMonth,
    allocatedAmount: microsToAmountString(amountStringToMicros(row.allocatedAmount)),
    allocationMethod: rows.length === 1 ? "single_month" : "manual_split",
    coverageStartDate,
    coverageEndDate,
  }));
}

export function buildSingleMonthAllocation(input: {
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

function scaleManualMonthlyAllocationRows(input: ManualAllocationInput) {
  const rows = input.rows
    .map((row) => ({
      reportMonth: normalizeReportMonthInput(row.reportMonth),
      allocatedMicros: amountStringToMicros(row.allocatedAmount),
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
  const existingTotalMicros = rows.reduce((sum, row) => sum + row.allocatedMicros, 0n);

  if (existingTotalMicros === 0n) {
    const rowCount = BigInt(rows.length);
    const baseMicros = totalMicros / rowCount;
    let remainder = totalMicros % rowCount;

    return rows.map((row) => {
      const direction = remainder === 0n ? 0n : remainder > 0n ? 1n : -1n;
      const bonus = direction;
      remainder -= direction;

      return {
        reportMonth: row.reportMonth,
        allocatedAmount: microsToAmountString(baseMicros + bonus),
      };
    });
  }

  const absoluteTargetMicros = totalMicros < 0n ? totalMicros * -1n : totalMicros;
  const absoluteExistingTotalMicros =
    existingTotalMicros < 0n ? existingTotalMicros * -1n : existingTotalMicros;
  const targetSign = totalMicros < 0n ? -1n : 1n;

  const scaledRows = rows.map((row) => {
    const absoluteExistingMicros =
      row.allocatedMicros < 0n ? row.allocatedMicros * -1n : row.allocatedMicros;
    const numerator = absoluteExistingMicros * absoluteTargetMicros;
    const baseMicros = (numerator / absoluteExistingTotalMicros) * targetSign;
    const remainder = numerator % absoluteExistingTotalMicros;

    return {
      reportMonth: row.reportMonth,
      allocatedMicros: baseMicros,
      remainder,
    };
  });

  let remainingMicros =
    totalMicros - scaledRows.reduce((sum, row) => sum + row.allocatedMicros, 0n);
  const direction = remainingMicros === 0n ? 0n : remainingMicros > 0n ? 1n : -1n;
  const rowsByRemainder = [...scaledRows].sort((left, right) => {
    if (left.remainder === right.remainder) {
      return left.reportMonth.localeCompare(right.reportMonth);
    }

    return left.remainder > right.remainder ? -1 : 1;
  });

  let index = 0;

  while (remainingMicros !== 0n && rowsByRemainder.length > 0) {
    rowsByRemainder[index].allocatedMicros += direction;
    remainingMicros -= direction;
    index = (index + 1) % rowsByRemainder.length;
  }

  return scaledRows.map((row) => ({
    reportMonth: row.reportMonth,
    allocatedAmount: microsToAmountString(row.allocatedMicros),
  }));
}

export function rebuildStoredAllocations(input: {
  amount: string;
  sourceDate: string;
  rows: StoredAllocationRow[];
}): ExpenseAllocation[] {
  const rows = input.rows
    .map((row) => ({
      ...row,
      reportMonth: normalizeReportMonthInput(row.reportMonth),
      allocatedAmount: microsToAmountString(amountStringToMicros(row.allocatedAmount)),
    }))
    .sort((left, right) => left.reportMonth.localeCompare(right.reportMonth));

  if (rows.length === 0) {
    return buildSingleMonthAllocation({
      amount: input.amount,
      sourceDate: input.sourceDate,
    });
  }

  const allocationMethod = rows[0].allocationMethod;

  if (allocationMethod === "equal_split") {
    const coverageStartDate = rows[0].coverageStartDate ?? rows[0].reportMonth;
    const coverageEndDate =
      rows[rows.length - 1].coverageEndDate ??
      monthKeyToCoverageEnd(rows[rows.length - 1].reportMonth);

    return buildEqualMonthlyAllocations({
      amount: input.amount,
      coverageStart: new Date(`${coverageStartDate}T00:00:00.000Z`),
      coverageEnd: new Date(`${coverageEndDate}T00:00:00.000Z`),
    });
  }

  if (allocationMethod === "manual_split") {
    const coverageStartDate = rows[0].coverageStartDate ?? rows[0].reportMonth;
    const coverageEndDate =
      rows[rows.length - 1].coverageEndDate ??
      monthKeyToCoverageEnd(rows[rows.length - 1].reportMonth);
    const scaledRows = scaleManualMonthlyAllocationRows({
      amount: input.amount,
      rows: rows.map((row) => ({
        reportMonth: row.reportMonth,
        allocatedAmount: row.allocatedAmount,
      })),
    });

    return scaledRows.map((row) => ({
      reportMonth: row.reportMonth,
      allocatedAmount: row.allocatedAmount,
      allocationMethod: scaledRows.length === 1 ? "single_month" : "manual_split",
      coverageStartDate,
      coverageEndDate,
    }));
  }

  return [
    {
      reportMonth: rows[0].reportMonth,
      allocatedAmount: input.amount,
      allocationMethod: "single_month",
      coverageStartDate: rows[0].coverageStartDate ?? input.sourceDate,
      coverageEndDate: rows[0].coverageEndDate ?? rows[0].coverageStartDate ?? input.sourceDate,
    },
  ];
}

import { listMonthsBetween, monthKey } from "@/lib/dates/months";

export type AllocationMethod = "singleMonth" | "equalSplit" | "manualSplit";

export type ExpenseAllocation = {
  reportMonth: string;
  allocatedAmount: number;
  allocationMethod: AllocationMethod;
  coverageStartDate?: string;
  coverageEndDate?: string;
};

type EqualAllocationInput = {
  amount: number;
  coverageStart: Date;
  coverageEnd: Date;
};

function toCents(amount: number): number {
  return Math.round(amount * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

// Split cents first so the per-month allocations add back to the original amount.
export function buildEqualMonthlyAllocations(
  input: EqualAllocationInput,
): ExpenseAllocation[] {
  const { amount, coverageStart, coverageEnd } = input;
  const months = listMonthsBetween(coverageStart, coverageEnd);
  const totalCents = toCents(amount);
  const baseCents = Math.trunc(totalCents / months.length);
  let remainder = totalCents - baseCents * months.length;

  return months.map((month) => {
    const bonusCent = remainder > 0 ? 1 : 0;
    remainder -= bonusCent;

    return {
      reportMonth: monthKey(month),
      allocatedAmount: fromCents(baseCents + bonusCent),
      allocationMethod: months.length === 1 ? "singleMonth" : "equalSplit",
      coverageStartDate: coverageStart.toISOString().slice(0, 10),
      coverageEndDate: coverageEnd.toISOString().slice(0, 10),
    };
  });
}


import type { ClassificationType } from "@/features/expenses/constants";
import type { ExpenseAllocationState } from "@/features/expenses/allocation";
import type {
  ExpenseTransactionItem,
  TransactionClassificationState,
} from "@/features/expenses/types";
import type { OneTimeManualEntryItem } from "@/features/manual-entries/types";

const CLASSIFICATION_LABELS: Record<ClassificationType, string> = {
  personal: "Personal",
  shared: "Shared",
  household: "Household",
  income: "Income",
  transfer: "Transfer",
  ignore: "Ignore",
};

export function formatClassificationTypeLabel(value: ClassificationType) {
  return CLASSIFICATION_LABELS[value];
}

function formatClassifiedEntrySummary(input: {
  classificationType: ClassificationType;
  memberOwnerName: string | null;
  category: string | null;
}) {
  const parts = [formatClassificationTypeLabel(input.classificationType)];

  if (input.memberOwnerName) {
    parts.push(input.memberOwnerName);
  }

  if (input.category) {
    parts.push(input.category);
  }

  return parts.join(" / ");
}

export function formatClassificationSummary(
  classification: TransactionClassificationState,
) {
  if (!classification) {
    return "Needs review";
  }

  return formatClassifiedEntrySummary({
    classificationType: classification.classificationType,
    memberOwnerName: classification.memberOwnerName,
    category: classification.category,
  });
}

export function formatDecisionSourceLabel(value: "rule" | "user" | "system_default") {
  switch (value) {
    case "rule":
      return "Rule";
    case "user":
      return "Reviewed";
    default:
      return "System";
  }
}

export function formatAllocationSummary(allocation: ExpenseAllocationState | null) {
  if (!allocation) {
    return "Not materialized";
  }

  if (allocation.reportingMode === "payment_date") {
    return "Payment month";
  }

  if (allocation.allocationMethod === "manual_split") {
    return `Manual split across ${allocation.allocationCount} month${allocation.allocationCount === 1 ? "" : "s"}`;
  }

  if (allocation.coverageStartDate && allocation.coverageEndDate) {
    if (allocation.coverageStartDate === allocation.coverageEndDate) {
      return `Adjusted: ${allocation.coverageStartDate}`;
    }

    return `Adjusted: ${allocation.coverageStartDate} to ${allocation.coverageEndDate}`;
  }

  return `Adjusted across ${allocation.allocationCount} month${allocation.allocationCount === 1 ? "" : "s"}`;
}

export function formatMoneyDisplay(
  amount: string | number | null | undefined,
  currency: string | null | undefined,
  direction?: string,
) {
  if (amount === null || amount === undefined || currency === null || currency === undefined) {
    return "-";
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return `${amount} ${currency}`;
  }

  const signedAmount = direction === "credit" ? numericAmount * -1 : numericAmount;

  return `${signedAmount.toFixed(2)} ${currency}`;
}

export function getTransactionMerchant(item: ExpenseTransactionItem) {
  return item.merchantRaw?.trim() || item.description;
}

function formatReportDrillInMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

export type TransactionReportTarget = {
  month: string;
  mode: "payment_date" | "allocated_period";
  href: string;
  label: string;
};

export function buildTransactionReportTargets(
  item: Pick<ExpenseTransactionItem, "transactionDate" | "allocation">,
): TransactionReportTarget[] {
  const adjustedMonths =
    item.allocation?.reportingMode === "allocated_period"
      ? Array.from(
          new Set(item.allocation.reportMonths.map((value) => value.slice(0, 7))),
        ).sort((left, right) => left.localeCompare(right))
      : [];

  if (adjustedMonths.length > 0) {
    return adjustedMonths.map((month) => ({
      month,
      mode: "allocated_period",
      href: `/reports?month=${month}&mode=allocated_period`,
      label: `Open ${formatReportDrillInMonthLabel(month)} adjusted report`,
    }));
  }

  const paymentMonth = item.transactionDate.slice(0, 7);

  if (!paymentMonth) {
    return [];
  }

  return [
    {
      month: paymentMonth,
      mode: "payment_date",
      href: `/reports?month=${paymentMonth}&mode=payment_date`,
      label: `Open ${formatReportDrillInMonthLabel(paymentMonth)} payment-date report`,
    },
  ];
}

export function formatManualEntryClassificationSummary(
  item: Pick<OneTimeManualEntryItem, "classificationType" | "payerMemberName" | "category">,
) {
  return formatClassifiedEntrySummary({
    classificationType: item.classificationType,
    memberOwnerName: item.payerMemberName,
    category: item.category,
  });
}

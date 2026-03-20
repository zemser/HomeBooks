import type { ClassificationType } from "@/features/expenses/constants";
import type { TransactionAllocationState } from "@/features/expenses/allocation";
import type {
  ExpenseTransactionItem,
  TransactionClassificationState,
} from "@/features/expenses/types";

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

export function formatClassificationSummary(
  classification: TransactionClassificationState,
) {
  if (!classification) {
    return "Needs review";
  }

  const parts = [formatClassificationTypeLabel(classification.classificationType)];

  if (classification.memberOwnerName) {
    parts.push(classification.memberOwnerName);
  }

  if (classification.category) {
    parts.push(classification.category);
  }

  return parts.join(" / ");
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

export function formatAllocationSummary(allocation: TransactionAllocationState | null) {
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

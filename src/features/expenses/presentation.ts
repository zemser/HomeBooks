import type { ClassificationType } from "@/features/expenses/constants";
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

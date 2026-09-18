import { formatClassificationTypeLabel } from "@/features/expenses/presentation";
import type {
  MonthCompleteness,
  MonthCompletenessStatus,
  ReportingViewMode,
} from "@/features/reporting/monthly-report";
import { formatMoneyWithCurrency } from "@/lib/money/format";

const MONTH_COMPLETENESS_PRESENTATION = {
  empty: { label: "Empty", tone: "neutral" },
  in_progress: { label: "In progress", tone: "warning" },
  complete: { label: "Complete", tone: "success" },
} as const satisfies Record<
  MonthCompletenessStatus,
  { label: string; tone: "neutral" | "warning" | "success" }
>;

export function getMonthCompletenessPresentation(status: MonthCompletenessStatus) {
  return MONTH_COMPLETENESS_PRESENTATION[status];
}

export function formatMonthInputValue(value: string) {
  return value.slice(0, 7);
}

type CompletenessNextStep = Pick<
  MonthCompleteness,
  "status" | "pendingTransactionCount" | "unresolvedAttributionCount" | "importedTransactionCount" | "reviewedTransactionCount"
>;

export function getMonthCompletenessNextAction(completeness: CompletenessNextStep, month: string) {
  const monthKey = formatMonthInputValue(month);
  if (completeness.status === "empty") {
    return { href: "/transactions", label: "Import transactions" };
  }
  if (completeness.status !== "in_progress") {
    return { href: `/reports?month=${monthKey}&mode=payment_date`, label: "View monthly report" };
  }
  if (completeness.pendingTransactionCount > 0) {
    const count = completeness.pendingTransactionCount;
    return {
      href: `/transactions/review?month=${monthKey}`,
      label: `Review ${count} transaction${count === 1 ? "" : "s"}`,
    };
  }
  const unresolved = completeness.unresolvedAttributionCount ?? 0;
  return {
    href: `/transactions/all?month=${monthKey}&import=all`,
    label: unresolved === 1 ? "Confirm people on 1 transaction" : `Confirm people on ${unresolved} transactions`,
  };
}

export function getMonthCompletenessProgressCopy(completeness: CompletenessNextStep) {
  if (completeness.status === "empty") {
    return "No imported or manual activity exists for this month.";
  }
  if (completeness.status === "in_progress") {
    if (completeness.pendingTransactionCount > 0) {
      return `${completeness.reviewedTransactionCount} of ${completeness.importedTransactionCount} imported transactions reviewed. Totals are based on reviewed transactions.`;
    }
    const unresolved = completeness.unresolvedAttributionCount ?? 0;
    return `All ${completeness.importedTransactionCount} imported transactions are classified, but ${unresolved} classified transaction${unresolved === 1 ? "" : "s"} still need${unresolved === 1 ? "s" : ""} payer or income-recipient confirmation.`;
  }
  if (completeness.importedTransactionCount === 0) {
    return "Manual activity exists and no imported transactions need review.";
  }
  return `All ${completeness.importedTransactionCount} imported transactions have been reviewed.`;
}

export function formatReportMonthLabel(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatReportMoney(amount: number, currency: string) {
  return formatMoneyWithCurrency(amount, currency);
}

export function formatSourceKind(value: "imported_transaction" | "one_time_manual" | "recurring_generated") {
  switch (value) {
    case "imported_transaction":
      return "Imported";
    case "one_time_manual":
      return "Manual";
    case "recurring_generated":
      return "Recurring generated";
  }
}

export function formatReportingModeLabel(value: ReportingViewMode) {
  switch (value) {
    case "payment_date":
      return "Payment date";
    case "allocated_period":
      return "Adjusted period";
  }
}

export { formatClassificationTypeLabel };

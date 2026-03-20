import { formatClassificationTypeLabel } from "@/features/expenses/presentation";

export function formatMonthInputValue(value: string) {
  return value.slice(0, 7);
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
  return `${amount.toFixed(2)} ${currency}`;
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

export { formatClassificationTypeLabel };

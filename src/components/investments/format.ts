import { formatMoneyWithCurrency } from "@/lib/money/format";

const percentFormat = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const signedPercentFormat = new Intl.NumberFormat("en", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: "exceptZero",
});

const snapshotDateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export function formatPercent(value: number | null) {
  return value === null ? "-" : `${percentFormat.format(value)}%`;
}

export function formatSignedPercent(value: number | null) {
  return value === null ? "-" : `${signedPercentFormat.format(value)}%`;
}

export function formatSignedMoney(value: number, currency: string) {
  return formatMoneyWithCurrency(value, currency, { signDisplay: "exceptZero" });
}

export function formatSnapshotDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(`${value}T00:00:00Z`);

  return Number.isNaN(date.getTime()) ? value : snapshotDateFormat.format(date);
}

export function formatDaysAgo(days: number | null) {
  if (days === null) {
    return null;
  }

  if (days === 0) {
    return "today";
  }

  if (days === 1) {
    return "yesterday";
  }

  return `${days} days ago`;
}

export function changeTone(value: number | null) {
  if (value === null || value === 0) {
    return "";
  }

  return value > 0 ? "value-positive" : "value-negative";
}

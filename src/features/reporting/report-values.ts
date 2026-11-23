import Big from "big.js";

export const REPORTING_VIEW_MODES = ["payment_date", "allocated_period"] as const;
export type ReportingViewMode = (typeof REPORTING_VIEW_MODES)[number];

export function getCategoryLabel(value: string | null) {
  return value?.trim() || "Uncategorized";
}

export function subtractMoney(left: number, right: number) {
  return Number(new Big(left).minus(right).toString());
}

export function reportCategoryKey(categoryId: string | null, category: string | null) {
  return categoryId ?? `uncatalogued:${getCategoryLabel(category)}`;
}

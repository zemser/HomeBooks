import Big from "big.js";
import type { MonthlyReportData, MonthlyReportLineItem, ReportingViewMode } from "./monthly-report";

export type ReportLineItemKind = "income" | "expense" | "personal" | "shared";
export type ReportLineItemSlice = {
  kind?: ReportLineItemKind;
  memberId?: string;
  categoryId?: string;
};
export type SliceState =
  | { status: "none" }
  | { status: "unavailable" }
  | { status: "valid"; slice: ReportLineItemSlice };

export const SLICE_PARAMS = ["kind", "member", "category"] as const;

export function parseReportLineItemSlice(
  params: URLSearchParams,
  metadata: MonthlyReportData["sliceMetadata"],
): SliceState {
  if (params.get("view") === "year" || !SLICE_PARAMS.some((key) => params.has(key))) return { status: "none" };
  const invalid: SliceState = { status: "unavailable" };
  if (SLICE_PARAMS.some((key) => params.getAll(key).length > 1 || params.get(key) === "")) return invalid;
  const memberId = params.get("member") ?? undefined;
  const categoryId = params.get("category") ?? undefined;
  const kind = params.get("kind") ?? (categoryId && !memberId ? "expense" : undefined);
  if (!kind || !["income", "expense", "personal", "shared"].includes(kind)) return invalid;
  if (kind === "personal" && !memberId) return invalid;
  if (memberId && kind !== "personal" && kind !== "income") return invalid;
  if (memberId && memberId !== "unassigned" && !metadata.members.some((member) => member.id === memberId)) return invalid;
  if (categoryId && categoryId !== "uncategorized" && !metadata.categories.some((category) => category.id === categoryId)) return invalid;
  return { status: "valid", slice: { kind: kind as ReportLineItemKind, memberId, categoryId } };
}

export function serializeReportLineItemSlice(slice?: ReportLineItemSlice) {
  const params = new URLSearchParams();
  const kind = slice?.kind ?? (slice?.categoryId && !slice.memberId ? "expense" : undefined);
  if (kind) params.set("kind", kind);
  if (slice?.memberId) params.set("member", slice.memberId);
  if (slice?.categoryId) params.set("category", slice.categoryId);
  return params;
}

export function buildReportsHref(view: "month" | "year", month: string, mode: ReportingViewMode, slice?: ReportLineItemSlice, anchor = false) {
  const params = new URLSearchParams({ view, month: month.slice(0, 7), mode });
  if (view === "month") serializeReportLineItemSlice(slice).forEach((value, key) => params.set(key, value));
  return `/reports?${params}${anchor && view === "month" ? "#line-items" : ""}`;
}

export function lineItemMatchesSlice(item: MonthlyReportLineItem, slice: ReportLineItemSlice) {
  if (slice.kind === "expense" && item.classificationType !== "personal" && item.classificationType !== "shared") return false;
  if (slice.kind && slice.kind !== "expense" && item.classificationType !== slice.kind) return false;
  if (slice.memberId && item.memberId !== (slice.memberId === "unassigned" ? null : slice.memberId)) return false;
  if (slice.categoryId && item.categoryId !== (slice.categoryId === "uncategorized" ? null : slice.categoryId)) return false;
  return true;
}

export function getReportSliceLabel(slice: ReportLineItemSlice, metadata: MonthlyReportData["sliceMetadata"]) {
  const member = slice.memberId === "unassigned" ? "Unassigned" : metadata.members.find((member) => member.id === slice.memberId)?.displayName;
  const category = slice.categoryId === "uncategorized" ? "Uncategorized" : metadata.categories.find((category) => category.id === slice.categoryId)?.name;
  const scope = slice.kind === "personal" ? `Personal · ${member}`
    : slice.kind === "income" ? `Income${member ? ` · ${member}` : ""}`
    : slice.kind === "shared" ? "Shared" : category ? "" : "Total spent";
  return [category, scope].filter(Boolean).join(" · ");
}

// Reuse the server's summary amounts for every selectable control, including deep links.
// Other valid URL intersections use the same decimal summation as report aggregation.
export function getReportSliceAmount(report: MonthlyReportData, slice: ReportLineItemSlice) {
  if (!slice.categoryId) {
    if (slice.kind === "expense") return report.summary.expenseTotal;
    if (slice.kind === "income") return slice.memberId
      ? report.memberIncome.find((member) => (member.memberId ?? "unassigned") === slice.memberId)?.incomeTotal ?? 0
      : report.summary.incomeTotal;
    return report.spendingScopes.find((scope) => scope.scope === slice.kind &&
      (scope.scope === "shared" || (scope.memberId ?? "unassigned") === slice.memberId))?.expenseTotal ?? 0;
  }
  if (slice.kind !== "income") {
    const category = report.categoryScopeBreakdown.find((category) => (category.categoryId ?? "uncategorized") === slice.categoryId);
    if (slice.kind === "expense") return category?.expenseTotal ?? 0;
    return category?.amounts.find((amount) => amount.scope === slice.kind &&
      (amount.scope === "shared" || (amount.memberId ?? "unassigned") === slice.memberId))?.amount ?? 0;
  }
  return Number(report.lineItems.filter((item) => lineItemMatchesSlice(item, slice))
    .reduce((total, item) => total.plus(item.normalizedAmount), new Big(0)).toString());
}

export function buildReportHistoryHref(item: MonthlyReportLineItem) {
  if (item.sourceKind !== "imported_transaction" || !item.sourceRecordId || !item.sourceEventDate) return null;
  return `/transactions/all?${new URLSearchParams({ transactionId: item.sourceRecordId, month: item.sourceEventDate.slice(0, 7) })}`;
}

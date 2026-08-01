import type { ExpenseTransactionItem } from "@/features/expenses/types";
import { getTransactionMerchant } from "@/features/expenses/presentation";

export type ReviewSort = "newest" | "oldest" | "amount_desc" | "amount_asc" | "merchant";
export type ReviewView = "all" | "suggested" | "no_suggestion" | "repeated" | "high_value";

export type ReviewFilterState = {
  searchQuery: string;
  month: string;
  importId: string;
  accountId: string;
  minimumAmount: string;
  maximumAmount: string;
  sort: ReviewSort;
  view: ReviewView;
};

export const defaultReviewFilterState: ReviewFilterState = {
  searchQuery: "",
  month: "all",
  importId: "all",
  accountId: "all",
  minimumAmount: "",
  maximumAmount: "",
  sort: "newest",
  view: "all",
};

const reviewSorts = new Set<ReviewSort>([
  "newest",
  "oldest",
  "amount_desc",
  "amount_asc",
  "merchant",
]);
const reviewViews = new Set<ReviewView>([
  "all",
  "suggested",
  "no_suggestion",
  "repeated",
  "high_value",
]);

export function parseReviewFilterState(search: string): ReviewFilterState {
  const params = new URLSearchParams(search);
  const requestedSort = params.get("sort") as ReviewSort | null;
  const requestedView = params.get("view") as ReviewView | null;

  return {
    searchQuery: params.get("q") ?? "",
    month: params.get("month") ?? "all",
    importId: params.get("import") ?? "all",
    accountId: params.get("account") ?? "all",
    minimumAmount: params.get("min") ?? "",
    maximumAmount: params.get("max") ?? "",
    sort: requestedSort && reviewSorts.has(requestedSort) ? requestedSort : "newest",
    view: requestedView && reviewViews.has(requestedView) ? requestedView : "all",
  };
}

export function serializeReviewFilterState(
  existingSearch: string,
  state: ReviewFilterState,
) {
  const params = new URLSearchParams(existingSearch);
  const setOrDelete = (key: string, value: string, defaultValue = "") => {
    if (!value || value === defaultValue) params.delete(key);
    else params.set(key, value);
  };

  setOrDelete("q", state.searchQuery);
  setOrDelete("month", state.month, "all");
  setOrDelete("import", state.importId, "all");
  setOrDelete("account", state.accountId, "all");
  setOrDelete("min", state.minimumAmount);
  setOrDelete("max", state.maximumAmount);
  setOrDelete("sort", state.sort, "newest");
  setOrDelete("view", state.view, "all");
  return params.toString();
}

export function hasActiveReviewFilters(state: ReviewFilterState) {
  return (
    Boolean(state.searchQuery.trim()) ||
    state.month !== "all" ||
    state.importId !== "all" ||
    state.accountId !== "all" ||
    Boolean(state.minimumAmount) ||
    Boolean(state.maximumAmount) ||
    state.sort !== "newest" ||
    state.view !== "all"
  );
}

export function filterAndSortReviewQueue(
  queue: ExpenseTransactionItem[],
  state: ReviewFilterState,
) {
  const normalizedSearch = state.searchQuery.trim().toLocaleLowerCase();
  const minimum = state.minimumAmount.trim() ? Number(state.minimumAmount) : null;
  const maximum = state.maximumAmount.trim() ? Number(state.maximumAmount) : null;
  const filtered = queue.filter((transaction) => {
    const amount = Math.abs(Number(transaction.normalizedAmount));
    const matchesSearch =
      !normalizedSearch ||
      [
        getTransactionMerchant(transaction),
        transaction.description,
        transaction.accountDisplayName,
        transaction.importSourceName ?? "",
        transaction.importOriginalFilename,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedSearch);
    const matchesView =
      state.view === "all" ||
      (state.view === "suggested" && Boolean(transaction.suggestion)) ||
      (state.view === "no_suggestion" && !transaction.suggestion) ||
      (state.view === "repeated" && transaction.similarQueueCount > 0) ||
      (state.view === "high_value" && amount >= 500);

    return (
      matchesSearch &&
      (state.month === "all" || transaction.transactionDate.startsWith(state.month)) &&
      (state.importId === "all" || transaction.importId === state.importId) &&
      (state.accountId === "all" || transaction.accountId === state.accountId) &&
      (minimum === null || Number.isNaN(minimum) || amount >= minimum) &&
      (maximum === null || Number.isNaN(maximum) || amount <= maximum) &&
      matchesView
    );
  });

  return filtered.sort((left, right) => {
    if (state.sort === "oldest") {
      return left.transactionDate.localeCompare(right.transactionDate);
    }
    if (state.sort === "amount_desc") {
      return Math.abs(Number(right.normalizedAmount)) - Math.abs(Number(left.normalizedAmount));
    }
    if (state.sort === "amount_asc") {
      return Math.abs(Number(left.normalizedAmount)) - Math.abs(Number(right.normalizedAmount));
    }
    if (state.sort === "merchant") {
      return getTransactionMerchant(left).localeCompare(getTransactionMerchant(right));
    }
    return right.transactionDate.localeCompare(left.transactionDate);
  });
}

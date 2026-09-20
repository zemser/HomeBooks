export const DEFAULT_HISTORY_PAGE_SIZE = 50;
export const MAX_HISTORY_PAGE_SIZE = 100;
export const HISTORY_MONTH_ALL = "all";
export const HISTORY_MONTH_UNRESOLVED = "default";
export const HISTORY_ACCOUNT_ALL = "all";

export type HistoryReviewStatus = "all" | "needs_review" | "reviewed" | "automatic";

export type HistoryQuery = {
  month: string;
  accountId: string;
  searchQuery: string;
  reviewStatus: HistoryReviewStatus;
  page: number;
  pageSize: number;
  transactionId?: string;
};

export type ParsedHistoryQuery = HistoryQuery & {
  monthSpecified: boolean;
  pageSpecified: boolean;
};

const MONTH_PATTERN = /^\d{4}-\d{2}$/;
const historyReviewStatuses = new Set<HistoryReviewStatus>([
  "all",
  "needs_review",
  "reviewed",
  "automatic",
]);

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseMonthParam(value: string | null) {
  if (!value) return HISTORY_MONTH_UNRESOLVED;
  if (value === HISTORY_MONTH_ALL) return HISTORY_MONTH_ALL;
  return MONTH_PATTERN.test(value) ? value : HISTORY_MONTH_UNRESOLVED;
}

function parseAccountParam(value: string | null) {
  const trimmed = value?.trim();
  return trimmed || HISTORY_ACCOUNT_ALL;
}

export function isHistoryMonthUnresolved(month: string) {
  return month === HISTORY_MONTH_UNRESOLVED;
}

export function isHistoryMonthAll(month: string) {
  return month === HISTORY_MONTH_ALL;
}

export function historyMonthIsUnscoped(month: string) {
  return isHistoryMonthAll(month) || isHistoryMonthUnresolved(month);
}

export function isHistoryAccountAll(accountId: string) {
  return !accountId || accountId === HISTORY_ACCOUNT_ALL;
}

export function shouldShowHistoryManuals(query: { month: string }) {
  return !historyMonthIsUnscoped(query.month);
}

export function parseHistoryQuery(params: URLSearchParams): ParsedHistoryQuery {
  const monthParam = params.get("month");
  const requestedStatus = params.get("reviewStatus") as HistoryReviewStatus | null;

  return {
    month: params.has("month") ? parseMonthParam(monthParam) : HISTORY_MONTH_UNRESOLVED,
    accountId: parseAccountParam(params.get("account")),
    searchQuery: params.get("q") ?? "",
    reviewStatus:
      requestedStatus && historyReviewStatuses.has(requestedStatus) ? requestedStatus : "all",
    page: positiveInteger(params.get("page"), 1),
    pageSize: Math.min(
      positiveInteger(params.get("pageSize"), DEFAULT_HISTORY_PAGE_SIZE),
      MAX_HISTORY_PAGE_SIZE,
    ),
    transactionId: params.get("transactionId")?.trim() || undefined,
    monthSpecified: params.has("month"),
    pageSpecified: params.has("page"),
  };
}

export function serializeHistoryQuery(existingSearch: string, state: HistoryQuery) {
  const params = new URLSearchParams(existingSearch);
  const setOrDelete = (key: string, value: string, defaultValue = "") => {
    if (!value || value === defaultValue) params.delete(key);
    else params.set(key, value);
  };

  setOrDelete("q", state.searchQuery);
  if (isHistoryMonthAll(state.month)) {
    params.set("month", HISTORY_MONTH_ALL);
  } else if (isHistoryMonthUnresolved(state.month) || !state.month) {
    params.delete("month");
  } else {
    params.set("month", state.month);
  }
  params.delete("import");
  setOrDelete("account", state.accountId, HISTORY_ACCOUNT_ALL);
  setOrDelete("reviewStatus", state.reviewStatus, "all");
  // An omitted page asks the server to locate transactionId on its page.
  // Serialized state already has a resolved page, including page 1.
  params.set("page", String(state.page));
  if (state.pageSize !== DEFAULT_HISTORY_PAGE_SIZE) {
    params.set("pageSize", String(state.pageSize));
  } else {
    params.delete("pageSize");
  }
  if (state.transactionId) params.set("transactionId", state.transactionId);
  else params.delete("transactionId");
  return params.toString();
}

export function defaultHistoryQuery(): HistoryQuery {
  return {
    month: HISTORY_MONTH_UNRESOLVED,
    accountId: HISTORY_ACCOUNT_ALL,
    searchQuery: "",
    reviewStatus: "all",
    page: 1,
    pageSize: DEFAULT_HISTORY_PAGE_SIZE,
  };
}

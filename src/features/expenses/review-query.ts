import {
  defaultReviewFilterState,
  isReviewImportUnresolved,
  parseReviewFilterState,
  REVIEW_IMPORT_UNRESOLVED,
  type ReviewFilterState,
} from "@/features/expenses/review-filtering";
import type { ReviewQueueImportSummary } from "@/features/expenses/types";

export const DEFAULT_REVIEW_PAGE_SIZE = 50;
export const MAX_REVIEW_PAGE_SIZE = 100;

export type ReviewQuery = ReviewFilterState & {
  page: number;
  pageSize: number;
  transactionId?: string;
};

function positiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseReviewQuery(params: URLSearchParams): ReviewQuery {
  const filters = parseReviewFilterState(params.toString());
  return {
    ...filters,
    page: positiveInteger(params.get("page"), 1),
    pageSize: Math.min(
      positiveInteger(params.get("pageSize"), DEFAULT_REVIEW_PAGE_SIZE),
      MAX_REVIEW_PAGE_SIZE,
    ),
    transactionId: params.get("transactionId")?.trim() || undefined,
  };
}

export function defaultReviewQuery(transactionId?: string): ReviewQuery {
  return {
    ...defaultReviewFilterState,
    page: 1,
    pageSize: DEFAULT_REVIEW_PAGE_SIZE,
    transactionId,
  };
}

export function resolveReviewLandingImportId(
  remainingByImport: Array<Pick<ReviewQueueImportSummary, "importId">>,
  query: Pick<ReviewQuery, "importId" | "month">,
) {
  if (!isReviewImportUnresolved(query.importId)) {
    return query.importId;
  }
  if (query.month !== "all") {
    return query.importId;
  }
  return remainingByImport[0]?.importId ?? REVIEW_IMPORT_UNRESOLVED;
}

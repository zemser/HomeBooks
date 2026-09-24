import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { ReviewQueueClient } from "@/components/expenses/review-queue-client";
import { listReviewQueue } from "@/features/expenses/queries";
import { parseReviewQuery } from "@/features/expenses/review-query";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type ReviewPageProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

async function ReviewQueue({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const urlParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") urlParams.set(key, value);
  });
  const parsedQuery = parseReviewQuery(urlParams);
  const initialData = await withCurrentWorkspaceDb((context, db) =>
    listReviewQueue(context, parsedQuery, db, { resolveLanding: true }),
  );
  const initialQuery = {
    ...parsedQuery,
    importId: initialData.resolvedImportId,
    page: initialData.pagination.page,
    pageSize: initialData.pagination.pageSize,
  };

  return (
    <div data-testid="transactions-review-content">
      <ReviewQueueClient
        initialData={initialData}
        initialQuery={initialQuery}
        initialTransactionId={parsedQuery.transactionId ?? null}
      />
    </div>
  );
}

export default function TransactionsReviewPage({ searchParams }: ReviewPageProps) {
  return (
    <Suspense fallback={<RouteDataFallback label="Review queue" presentation="spinner" />}>
      <ReviewQueue searchParams={searchParams} />
    </Suspense>
  );
}

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
  const query = parseReviewQuery(urlParams);
  const transactionId = query.transactionId ?? null;
  const initialData = await withCurrentWorkspaceDb((context, db) =>
    listReviewQueue(context, query, db),
  );

  return (
    <div data-testid="review-content">
      <ReviewQueueClient initialData={initialData} initialTransactionId={transactionId} />
    </div>
  );
}

export default function ReviewPage({ searchParams }: ReviewPageProps) {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header review-page-header" data-testid="review-shell">
          <div>
            <span className="eyebrow">Review queue</span>
            <h1>Review transactions</h1>
            <p>Choose a row, make a decision, and move to the next one.</p>
          </div>
        </section>

        <Suspense fallback={<RouteDataFallback label="Review queue" />}>
          <ReviewQueue searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";

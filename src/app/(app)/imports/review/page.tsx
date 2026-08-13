import { ReviewQueueClient } from "@/components/expenses/review-queue-client";
import { listReviewQueue } from "@/features/expenses/queries";
import { parseReviewQuery } from "@/features/expenses/review-query";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type ReviewPageProps = {
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
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
    <main>
      <div className="page-shell stack">
        <section className="page-header review-page-header">
          <div>
            <span className="eyebrow">Review queue</span>
            <h1>Review transactions</h1>
            <p>Choose a row, make a decision, and move to the next one.</p>
          </div>
        </section>

        <ReviewQueueClient initialData={initialData} initialTransactionId={transactionId} />
      </div>
    </main>
  );
}

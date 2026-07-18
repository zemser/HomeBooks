import { ReviewQueueClient } from "@/components/expenses/review-queue-client";
import { listReviewQueue } from "@/features/expenses/queries";
import { withCurrentWorkspace } from "@/features/workspaces/current-context";

type ReviewPageProps = {
  searchParams: Promise<{
    transactionId?: string | string[];
  }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const transactionId =
    typeof params.transactionId === "string" ? params.transactionId : null;
  const initialData = await withCurrentWorkspace((context) =>
    listReviewQueue(context, transactionId ?? undefined),
  );

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <span className="eyebrow">Review queue</span>
          <div>
            <h1>Review transactions</h1>
            <p>Choose a row, make a decision, and move to the next one.</p>
          </div>
        </section>

        <ReviewQueueClient initialData={initialData} initialTransactionId={transactionId} />
      </div>
    </main>
  );
}

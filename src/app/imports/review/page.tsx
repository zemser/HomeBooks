import Link from "next/link";

import { ReviewQueueClient } from "@/components/expenses/review-queue-client";
import { listReviewQueue } from "@/features/expenses/queries";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

type ReviewPageProps = {
  searchParams: Promise<{
    transactionId?: string | string[];
  }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const transactionId =
    typeof params.transactionId === "string" ? params.transactionId : null;
  const context = await resolveCurrentWorkspaceContext();
  const initialData = await listReviewQueue(context, transactionId ?? undefined);

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Review queue</span>
          <h1>Confirm the rows the importer cannot safely decide for you.</h1>
          <p>
            This queue focuses on transactions without a saved classification, while still
            letting you jump in from the expenses page to correct a reviewed row.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Keep the workflow moving</h2>
              <p className="muted-text">
                Review is the bridge between raw imports and a ledger that actually feels usable.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/imports">
                Back to imports
              </Link>
              <Link className="button" href="/expenses">
                Continue to expenses
              </Link>
            </div>
          </div>
        </section>

        <ReviewQueueClient initialData={initialData} initialTransactionId={transactionId} />
      </div>
    </main>
  );
}

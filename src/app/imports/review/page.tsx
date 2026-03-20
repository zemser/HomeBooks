import { ReviewQueueClient } from "@/components/expenses/review-queue-client";

type ReviewPageProps = {
  searchParams: Promise<{
    transactionId?: string | string[];
  }>;
};

export default async function ReviewPage({ searchParams }: ReviewPageProps) {
  const params = await searchParams;
  const transactionId =
    typeof params.transactionId === "string" ? params.transactionId : null;

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

        <ReviewQueueClient initialTransactionId={transactionId} />
      </div>
    </main>
  );
}

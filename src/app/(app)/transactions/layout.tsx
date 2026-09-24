import { Suspense } from "react";

import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";
import { TransactionsPageFrame } from "@/components/transactions/transactions-page-frame";
import { TransactionsWorkflowNav } from "@/components/transactions/transactions-workflow-nav";

export default function TransactionsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main>
      <TransactionsPageFrame>
        <section className="page-header" data-testid="transactions-shell">
          <div>
            <span className="eyebrow">Transactions</span>
            <h1>Transactions</h1>
            <p>Import a statement, review it, or add a cash expense for the month.</p>
          </div>
        </section>

        <TransactionsWorkflowNav
          reviewBadge={(
            <Suspense fallback={null}>
              <ReviewQueueBadge />
            </Suspense>
          )}
        />

        {children}
      </TransactionsPageFrame>
    </main>
  );
}

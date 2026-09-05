import { Suspense } from "react";

import { ReviewQueueBadge } from "@/components/app-shell/review-queue-badge";
import { TransactionsWorkflowNav } from "@/components/transactions/transactions-workflow-nav";

export default function TransactionsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="transactions-shell">
          <div>
            <span className="eyebrow">Transactions</span>
            <h1>Transactions</h1>
            <p>Import statements, review activity, and browse your complete history.</p>
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
      </div>
    </main>
  );
}

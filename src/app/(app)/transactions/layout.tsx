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
          <h1>Transactions</h1>
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

import Link from "next/link";
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { ExpensesPageClient } from "@/components/expenses/expenses-page-client";
import { listExpenseTransactions, listWorkspaceMembers } from "@/features/expenses/queries";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type AllTransactionsPageProps = {
  searchParams: Promise<{
    transactionId?: string | string[];
  }>;
};

async function TransactionLedger({ searchParams }: AllTransactionsPageProps) {
  const params = await searchParams;
  const transactionId =
    typeof params.transactionId === "string" ? params.transactionId : null;
  const [transactions, oneTimeManualEntries, members, categoryCatalog] =
    await withCurrentWorkspaceDb((context, db) =>
      Promise.all([
        listExpenseTransactions(context, db),
        listOneTimeManualEntries(context, db),
        listWorkspaceMembers(context, db),
        listWorkspaceCategories(context, db),
      ]),
    );
  const reviewCount = transactions.filter((transaction) => !transaction.classification).length;

  return (
    <div className="stack" data-testid="transactions-all-content">
      <section className="card">
        <div className="ledger-action-header">
          <div>
            <h2>Ledger actions</h2>
            <p className="muted-text">
              Use the ledger to check transactions and their reporting details.
            </p>
          </div>
          <div className="action-row">
            <Link className="button button-secondary" href="/transactions/review">
              {reviewCount > 0
                ? `Review ${reviewCount} left`
                : "Open review queue"}
            </Link>
            <Link className="button" href="/reports">Open reports</Link>
          </div>
        </div>
      </section>

      <ExpensesPageClient
        initialData={{
          transactions,
          oneTimeManualEntries,
          members,
          categories: categoryCatalog.map((category) => category.name),
          categoryCatalog,
        }}
        initialTransactionId={transactionId}
      />
    </div>
  );
}

export default function AllTransactionsPage({ searchParams }: AllTransactionsPageProps) {
  return (
    <Suspense fallback={<RouteDataFallback label="All transactions" />}>
      <TransactionLedger searchParams={searchParams} />
    </Suspense>
  );
}

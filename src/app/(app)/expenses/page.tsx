import Link from "next/link";

import { ExpensesPageClient } from "@/components/expenses/expenses-page-client";
import { listExpenseTransactions, listWorkspaceMembers } from "@/features/expenses/queries";
import { formatReportMonthLabel } from "@/features/reporting/presentation";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import { listWorkspaceCategories } from "@/features/workspaces/categories";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type ExpensesPageProps = {
  searchParams: Promise<{
    transactionId?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";

export default async function ExpensesPage({ searchParams }: ExpensesPageProps) {
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
  const latestTransactionMonth = transactions[0]?.transactionDate.slice(0, 7) ?? null;
  const reportHref = latestTransactionMonth
    ? `/reports?month=${latestTransactionMonth}`
    : "/reports";
  const reportLabel = latestTransactionMonth
    ? `Open ${formatReportMonthLabel(`${latestTransactionMonth}-01`)} report`
    : "Open reports";

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Expenses</span>
            <h1>Household ledger</h1>
            <p>Browse, search, and inspect transactions across all months.</p>
          </div>
        </section>

        <section className="card">
          <div className="ledger-action-header">
            <div>
              <h2>Ledger actions</h2>
              <p className="muted-text">
                Use the ledger to check transactions and their reporting details.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/imports/review">
                {reviewCount > 0
                  ? `Review ${reviewCount} left`
                  : "Open review queue"}
              </Link>
              <Link className="button" href={reportHref}>
                {reportLabel}
              </Link>
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
    </main>
  );
}

import Link from "next/link";

import { ExpensesPageClient } from "@/components/expenses/expenses-page-client";
import { listExpenseTransactions, listWorkspaceMembers } from "@/features/expenses/queries";
import { formatReportMonthLabel } from "@/features/reporting/presentation";
import { listOneTimeManualEntries } from "@/features/manual-entries/service";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

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
  const context = await resolveCurrentWorkspaceContext();
  const [transactions, oneTimeManualEntries, members] = await Promise.all([
    listExpenseTransactions(context),
    listOneTimeManualEntries(context),
    listWorkspaceMembers(context),
  ]);
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
        <section className="hero">
          <span className="eyebrow">Expenses</span>
          <h1>Persisted transactions become the household ledger.</h1>
          <p>
            This page shows normalized imported transactions, the source account they came
            from, and whether each row still needs a human decision.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Ledger actions</h2>
              <p className="muted-text">
                Use the ledger to validate normalized behavior, add one-off entries, and then move
                forward into recurring rules or reporting.
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
          }}
          initialTransactionId={transactionId}
        />
      </div>
    </main>
  );
}

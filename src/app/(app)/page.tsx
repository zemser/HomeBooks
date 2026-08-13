import Link from "next/link";

import { getWorkspaceHomeSnapshot } from "@/features/home/service";
import type { WorkspaceHomeSnapshot } from "@/features/home/types";
import {
  formatReportMoney,
  formatReportMonthLabel,
} from "@/features/reporting/presentation";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

function buildReportTarget(month: string) {
  const normalizedMonth = month.slice(0, 7);
  return `/reports?month=${normalizedMonth}&mode=payment_date`;
}

function getNextAction(snapshot: WorkspaceHomeSnapshot) {
  if (snapshot.setup.activeMemberCount === 0) {
    return {
      href: "/settings",
      label: "Finish workspace setup",
      description: "Add your first household member to get started.",
    };
  }

  if (snapshot.workflow.importCount === 0) {
    return {
      href: "/imports",
      label: "Import your first bank file",
      description: "Add a statement so your transactions can appear in the ledger.",
    };
  }

  if (snapshot.workflow.reviewQueueCount > 0) {
    return {
      href: "/imports/review",
      label: `Review ${snapshot.workflow.reviewQueueCount} pending transaction${snapshot.workflow.reviewQueueCount === 1 ? "" : "s"}`,
      description: "Confirm the transactions that need a decision before relying on reports.",
    };
  }

  if (snapshot.workflow.latestTransactionMonth) {
    return {
      href: buildReportTarget(snapshot.workflow.latestTransactionMonth),
      label: `Check your ${formatReportMonthLabel(`${snapshot.workflow.latestTransactionMonth}-01`)} report`,
      description: "Review the latest month once the queue is clear.",
    };
  }

  return {
    href: "/expenses",
    label: "Open the household ledger",
    description: "Browse transactions and add anything missing.",
  };
}

function formatActivityTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function HomePage() {
  const snapshot = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomeSnapshot(context, db),
  );
  const nextAction = getNextAction(snapshot);
  const reportTarget = snapshot.reporting.available
    ? buildReportTarget(snapshot.reporting.selectedMonth)
    : "/reports";

  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header">
          <div>
            <span className="eyebrow">Home</span>
            <h1>Good to see you.</h1>
            <p>{snapshot.workspaceName} at a glance.</p>
          </div>
          <Link className="button button-secondary" href="/settings">
            Settings
          </Link>
        </section>

        <section className="home-next card">
          <div>
            <span className="badge badge-warning">Next up</span>
            <h2>{nextAction.label}</h2>
            <p>{nextAction.description}</p>
          </div>
          <Link className="button" href={nextAction.href}>
            Open
          </Link>
        </section>

        <section className="summary-strip card" aria-label="Household summary">
          <div>
            <strong>{snapshot.workflow.reviewQueueCount}</strong>
            <span>Transactions to review</span>
          </div>
          <div>
            <strong>
              {snapshot.reporting.available && snapshot.reporting.monthSummary
                ? formatReportMoney(
                    snapshot.reporting.monthSummary.savingsTotal,
                    snapshot.setup.baseCurrency,
                  )
                : "—"}
            </strong>
            <span>
              {snapshot.reporting.available
                ? `${formatReportMonthLabel(snapshot.reporting.selectedMonth)} savings`
                : "Current-month savings"}
            </span>
          </div>
        </section>

        <section className="two-up">
          <article className="card stack compact">
            <div className="home-card-header">
              <div>
                <h2>This month</h2>
                <p className="muted-text">A quick view of the latest reporting period.</p>
              </div>
              <Link className="link-button" href={reportTarget}>Open reports</Link>
            </div>
            {snapshot.reporting.available && snapshot.reporting.monthSummary ? (
              <div className="summary-strip">
                <div>
                  <strong>{formatReportMoney(snapshot.reporting.monthSummary.incomeTotal, snapshot.setup.baseCurrency)}</strong>
                  <span>Income</span>
                </div>
                <div>
                  <strong>{formatReportMoney(snapshot.reporting.monthSummary.expenseTotal, snapshot.setup.baseCurrency)}</strong>
                  <span>Expenses</span>
                </div>
              </div>
            ) : (
              <p className="empty-state">Reports will appear after transactions are added.</p>
            )}
          </article>

          <article className="card stack compact">
            <div className="home-card-header">
              <div>
                <h2>Recent activity</h2>
                <p className="muted-text">Your latest saved bank imports.</p>
              </div>
              <Link className="link-button" href="/imports">Open imports</Link>
            </div>
            {snapshot.recentActivity.latestImports.length === 0 ? (
              <p className="empty-state">No imports yet.</p>
            ) : (
              snapshot.recentActivity.latestImports.slice(0, 3).map((item) => (
                <div className="activity-row" key={item.id}>
                  <div>
                    <strong>{item.originalFilename}</strong>
                    <p>
                      {item.reviewPendingCount > 0
                        ? `${item.reviewPendingCount} need review`
                        : `${item.transactionCount} transaction${item.transactionCount === 1 ? "" : "s"} ready`}
                    </p>
                  </div>
                  <span className="table-note">{formatActivityTimestamp(item.createdAt)}</span>
                </div>
              ))
            )}
          </article>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import {
  getWorkspaceHomeActivitySnapshot,
  getWorkspaceHomePrimarySnapshot,
  getWorkspaceHomeReportingSnapshot,
} from "@/features/home/service";
import type { WorkspaceHomePrimarySnapshot } from "@/features/home/types";
import {
  formatReportMoney,
  formatReportMonthLabel,
} from "@/features/reporting/presentation";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";


function buildReportTarget(month: string) {
  const normalizedMonth = month.slice(0, 7);
  return `/reports?month=${normalizedMonth}&mode=payment_date`;
}

function getNextAction(snapshot: WorkspaceHomePrimarySnapshot) {
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

async function HomeReporting() {
  const reporting = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomeReportingSnapshot(context, db),
  );
  const reportTarget = reporting.available
    ? buildReportTarget(reporting.selectedMonth)
    : "/reports";
  const completion = reporting.completeness;
  const monthLabel = formatReportMonthLabel(reporting.selectedMonth);
  const statusLabel =
    completion.status === "empty"
      ? "Empty"
      : completion.status === "in_progress"
        ? "In progress"
        : "Complete";

  return (
    <article className="card stack compact">
      <div className="home-card-header">
        <div>
          <h2>{monthLabel}</h2>
          <p className="muted-text">Month status and reviewed financial totals.</p>
        </div>
        <Link className="link-button" href={reportTarget}>Open reports</Link>
      </div>
      <div
        className={`status ${completion.status === "in_progress" ? "warning" : completion.status === "complete" ? "success" : "neutral"}`}
      >
        <strong>{statusLabel}</strong>
        <div>
          {completion.status === "empty"
            ? "No imported or manual activity exists for this month."
            : completion.status === "in_progress"
              ? `${completion.reviewedTransactionCount} of ${completion.importedTransactionCount} imported transactions reviewed. Totals are based on reviewed transactions.`
              : completion.importedTransactionCount === 0
                ? "Manual activity exists and no imported transactions need review."
                : `All ${completion.importedTransactionCount} imported transactions have been reviewed.`}
        </div>
      </div>
      {reporting.available && reporting.monthSummary ? (
        <div className="stack compact">
          {completion.status === "in_progress" ? (
            <p className="muted-text">Based on reviewed transactions</p>
          ) : null}
          <div className="summary-strip">
            <div>
              <strong>
                {formatReportMoney(
                  reporting.monthSummary.incomeTotal,
                  reporting.monthSummary.workspaceCurrency,
                )}
              </strong>
              <span>Income</span>
            </div>
            <div>
              <strong>
                {formatReportMoney(
                  reporting.monthSummary.expenseTotal,
                  reporting.monthSummary.workspaceCurrency,
                )}
              </strong>
              <span>Total spent</span>
            </div>
            <div>
              <strong>
                {formatReportMoney(
                  reporting.monthSummary.savingsTotal,
                  reporting.monthSummary.workspaceCurrency,
                )}
              </strong>
              <span>Saved</span>
            </div>
          </div>
        </div>
      ) : (
        <p className="empty-state">Reports will appear after transactions are added.</p>
      )}
    </article>
  );
}

async function HomeRecentActivity() {
  const activity = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomeActivitySnapshot(context, db),
  );

  return (
    <article className="card stack compact">
      <div className="home-card-header">
        <div>
          <h2>Recent activity</h2>
          <p className="muted-text">Your latest saved bank imports.</p>
        </div>
        <Link className="link-button" href="/imports">Open imports</Link>
      </div>
      {activity.latestImports.length === 0 ? (
        <p className="empty-state">No imports yet.</p>
      ) : (
        activity.latestImports.map((item) => (
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
  );
}

function HomeCardFallback({ label }: { label: string }) {
  return (
    <article className="card stack compact" aria-busy="true">
      <h2>{label}</h2>
      <p className="muted-text">Loading…</p>
      <div className="summary-strip" aria-hidden="true">
        <div>
          <strong>—</strong>
          <span>Pending</span>
        </div>
        <div>
          <strong>—</strong>
          <span>Pending</span>
        </div>
      </div>
    </article>
  );
}

function formatActivityTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function HomePrimary() {
  const snapshot = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomePrimarySnapshot(context, db),
  );
  const nextAction = getNextAction(snapshot);

  return (
    <section className="home-next card" data-testid="home-content">
          <div>
            <span className="badge badge-warning">Next up</span>
            <h2>{nextAction.label}</h2>
            <p>{snapshot.workspaceName}: {nextAction.description}</p>
          </div>
          <Link className="button" href={nextAction.href}>
            Open
          </Link>
    </section>
  );
}

export default function HomePage() {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="home-shell">
          <div>
            <span className="eyebrow">Home</span>
            <h1>Good to see you.</h1>
            <p>Your household workspace at a glance.</p>
          </div>
          <Link className="button button-secondary" href="/settings">
            Settings
          </Link>
        </section>

        <Suspense fallback={<RouteDataFallback label="Next action" />}>
          <HomePrimary />
        </Suspense>

        <section className="two-up">
          <Suspense fallback={<HomeCardFallback label="This month" />}>
            <HomeReporting />
          </Suspense>
          <Suspense fallback={<HomeCardFallback label="Recent activity" />}>
            <HomeRecentActivity />
          </Suspense>
        </section>
      </div>
    </main>
  );
}

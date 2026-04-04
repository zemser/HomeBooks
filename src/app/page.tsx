import Link from "next/link";

import { getWorkspaceHomeSnapshot } from "@/features/home/service";
import type { WorkspaceHomeSnapshot } from "@/features/home/types";
import {
  formatReportMoney,
  formatReportMonthLabel,
} from "@/features/reporting/presentation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

type HomeStep = {
  title: string;
  href: string;
  status: "complete" | "current" | "up-next";
  description: string;
};

function getNextAction(snapshot: WorkspaceHomeSnapshot) {
  if (!snapshot.setup.pairwiseSettlementReady) {
    return {
      href: "/settings",
      label: "Finish workspace setup",
      description:
        "Add or reactivate exactly two active household members so ownership and shared-settlement flows make sense.",
    };
  }

  if (snapshot.workflow.importCount === 0) {
    return {
      href: "/imports",
      label: "Import your first bank file",
      description:
        "Bring a real statement into the workspace so the ledger and review queue can start from actual household activity.",
    };
  }

  if (snapshot.workflow.reviewQueueCount > 0) {
    return {
      href: "/imports/review",
      label: `Review ${snapshot.workflow.reviewQueueCount} pending transaction${snapshot.workflow.reviewQueueCount === 1 ? "" : "s"}`,
      description:
        "Confirm the transactions the importer could not safely classify before you trust the reports.",
    };
  }

  if (snapshot.workflow.transactionCount > 0 && !snapshot.workflow.hasManualEntries) {
    return {
      href: "/expenses",
      label: "Open the household ledger",
      description:
        "Browse imported transactions, add one-off adjustments, and verify that the normalized ledger feels right.",
    };
  }

  if (!snapshot.workflow.hasRecurringRules) {
    return {
      href: "/recurring",
      label: "Add recurring income and expenses",
      description:
        "Capture rent, salary, and other flows that do not always show up cleanly in statement files.",
    };
  }

  if (snapshot.reporting.available) {
    return {
      href: "/reports",
      label: "Open reports",
      description:
        "Check the adjusted-period month view and rolling trend now that the workflow has enough data to be useful.",
    };
  }

  return {
    href: "/expenses",
    label: "Keep shaping the ledger",
    description:
      "Use the ledger to refine manual entries and allocations before you move deeper into shared-expense or reporting work.",
  };
}

function getWorkflowSteps(snapshot: WorkspaceHomeSnapshot): HomeStep[] {
  return [
    {
      title: "Setup",
      href: "/settings",
      status: snapshot.setup.pairwiseSettlementReady ? "complete" : "current",
      description: snapshot.setup.pairwiseSettlementReady
        ? "Exactly two active members are configured."
        : "Finish household setup in settings.",
    },
    {
      title: "Import",
      href: "/imports",
      status:
        snapshot.workflow.importCount > 0
          ? "complete"
          : snapshot.setup.pairwiseSettlementReady
            ? "current"
            : "up-next",
      description:
        snapshot.workflow.importCount > 0
          ? `${snapshot.workflow.importCount} bank import${snapshot.workflow.importCount === 1 ? "" : "s"} saved.`
          : "Upload the first bank file.",
    },
    {
      title: "Review",
      href: "/imports/review",
      status:
        snapshot.workflow.importCount === 0
          ? "up-next"
          : snapshot.workflow.reviewQueueCount > 0
            ? "current"
            : "complete",
      description:
        snapshot.workflow.importCount === 0
          ? "Classify uncertain rows after imports land."
          : snapshot.workflow.reviewQueueCount > 0
            ? `${snapshot.workflow.reviewQueueCount} transaction${snapshot.workflow.reviewQueueCount === 1 ? "" : "s"} still need review.`
            : "Imported rows are no longer waiting in the queue.",
    },
    {
      title: "Ledger",
      href: "/expenses",
      status:
        snapshot.workflow.transactionCount > 0 || snapshot.workflow.hasManualEntries
          ? "complete"
          : snapshot.workflow.importCount > 0
            ? "current"
            : "up-next",
      description:
        snapshot.workflow.transactionCount > 0 || snapshot.workflow.hasManualEntries
          ? "Imported and manual cashflow entries are available."
          : "Use the ledger after imports or manual entries exist.",
    },
    {
      title: "Recurring",
      href: "/recurring",
      status: snapshot.workflow.hasRecurringRules ? "complete" : "up-next",
      description: snapshot.workflow.hasRecurringRules
        ? `${snapshot.workflow.recurringRuleCount} recurring rule${snapshot.workflow.recurringRuleCount === 1 ? "" : "s"} configured.`
        : "Add the monthly items imports miss.",
    },
    {
      title: "Reports",
      href: "/reports",
      status: snapshot.reporting.available ? "complete" : "up-next",
      description: snapshot.reporting.available
        ? "Adjusted-period reporting is ready to inspect."
        : "Reports become useful once reviewed or manual items feed the summaries.",
    },
  ];
}

function formatActivityTimestamp(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function HomePage() {
  const context = await resolveCurrentWorkspaceContext();
  const snapshot = await getWorkspaceHomeSnapshot(context);
  const nextAction = getNextAction(snapshot);
  const steps = getWorkflowSteps(snapshot);
  const summaryValue =
    snapshot.reporting.available && snapshot.reporting.monthSummary
      ? formatReportMoney(
          snapshot.reporting.monthSummary.savingsTotal,
          snapshot.setup.baseCurrency,
        )
      : `${snapshot.workflow.manualEntryCount} manual`;

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Home</span>
          <h1>Make the household workflow feel obvious.</h1>
          <p>
            {snapshot.workspaceName} now has a single starting point: see what is configured,
            what needs attention next, and which surface should carry the workflow forward.
          </p>
          <div className="hero-actions">
            <Link className="button" href={nextAction.href}>
              {nextAction.label}
            </Link>
            <Link
              className="button button-secondary"
              href={snapshot.reporting.available ? "/reports" : "/settings"}
            >
              {snapshot.reporting.available ? "Open reports" : "Open settings"}
            </Link>
          </div>
        </section>

        <section className="card">
          <div className="summary-strip">
            <div>
              <strong>{snapshot.setup.activeMemberCount}</strong>
              <span>Active household members</span>
            </div>
            <div>
              <strong>{snapshot.workflow.importCount}</strong>
              <span>Bank imports saved</span>
            </div>
            <div>
              <strong>{snapshot.workflow.reviewQueueCount}</strong>
              <span>Transactions waiting for review</span>
            </div>
            <div>
              <strong>{summaryValue}</strong>
              <span>
                {snapshot.reporting.available ? "Selected-month savings" : "Manual entries so far"}
              </span>
            </div>
          </div>
        </section>

        <section className="two-up">
          <article className="card">
            <div className="page-actions">
              <div>
                <h2>Next action</h2>
                <p className="muted-text">
                  The app should keep nudging the next meaningful step instead of leaving you
                  to stitch the flow together from disconnected screens.
                </p>
              </div>
            </div>
            <div className="home-focus-card">
              <span className="badge badge-warning">Do now</span>
              <h3>{nextAction.label}</h3>
              <p>{nextAction.description}</p>
              <Link className="link-button" href={nextAction.href}>
                Go to {nextAction.label.toLowerCase()}
              </Link>
            </div>
          </article>

          <article className="card">
            <div className="page-actions">
              <div>
                <h2>Setup state</h2>
                <p className="muted-text">
                  Settings is now the clear setup surface instead of a hidden side route.
                </p>
              </div>
              <Link className="link-button" href="/settings">
                Open settings
              </Link>
            </div>
            <div className="stack compact">
              <div className="info-row">
                <strong>Base currency</strong>
                <span>{snapshot.setup.baseCurrency}</span>
              </div>
              <div className="info-row">
                <strong>Currency state</strong>
                <span>{snapshot.setup.canUpdateBaseCurrency ? "Still editable" : "Locked"}</span>
              </div>
              <div className="info-row">
                <strong>Active members</strong>
                <span>{snapshot.setup.activeMemberCount}</span>
              </div>
              <div className="info-row">
                <strong>Settlement readiness</strong>
                <span>
                  {snapshot.setup.pairwiseSettlementReady
                    ? "Ready for pairwise tracking"
                    : "Needs exactly 2 active members"}
                </span>
              </div>
            </div>
          </article>
        </section>

        <section className="card stack compact">
          <div className="page-actions">
            <div>
              <h2>Workflow map</h2>
              <p className="muted-text">
                The expense-first story now reads left to right: setup, import, review, ledger,
                recurring, then reports.
              </p>
            </div>
          </div>
          <div className="home-workflow-list">
            {steps.map((step) => (
              <Link className="home-workflow-step" href={step.href} key={step.title}>
                <span className={`home-step-state home-step-state-${step.status}`}>
                  {step.status === "complete"
                    ? "Complete"
                    : step.status === "current"
                      ? "Current"
                      : "Up next"}
                </span>
                <div>
                  <strong>{step.title}</strong>
                  <p>{step.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="two-up">
          <article className="card stack compact">
            <div className="page-actions">
              <div>
                <h2>Reporting teaser</h2>
                <p className="muted-text">
                  Reports stay secondary until the workflow has enough data, then they become the
                  natural next place to validate behavior and architecture.
                </p>
              </div>
              <Link className="link-button" href="/reports">
                Open reports
              </Link>
            </div>

            {snapshot.reporting.available &&
            snapshot.reporting.monthSummary &&
            snapshot.reporting.rollingTwelveSummary ? (
              <>
                <div className="summary-strip">
                  <div>
                    <strong>
                      {formatReportMoney(
                        snapshot.reporting.monthSummary.incomeTotal,
                        snapshot.setup.baseCurrency,
                      )}
                    </strong>
                    <span>{formatReportMonthLabel(snapshot.reporting.selectedMonth)} income</span>
                  </div>
                  <div>
                    <strong>
                      {formatReportMoney(
                        snapshot.reporting.monthSummary.expenseTotal,
                        snapshot.setup.baseCurrency,
                      )}
                    </strong>
                    <span>{formatReportMonthLabel(snapshot.reporting.selectedMonth)} expenses</span>
                  </div>
                  <div>
                    <strong>
                      {formatReportMoney(
                        snapshot.reporting.rollingTwelveSummary.averageMonthlySavings,
                        snapshot.setup.baseCurrency,
                      )}
                    </strong>
                    <span>Rolling 12-month average savings</span>
                  </div>
                </div>
                <p className="helper-text">
                  Adjusted-period reporting is ready for{" "}
                  {formatReportMonthLabel(snapshot.reporting.selectedMonth)}.
                </p>
              </>
            ) : (
              <p className="empty-state">
                Reports will become meaningful after reviewed imports or manual entries feed the
                reporting pipeline.
              </p>
            )}
          </article>

          <article className="card stack compact">
            <div className="page-actions">
              <div>
                <h2>Recent bank imports</h2>
                <p className="muted-text">
                  Imports now read like a workflow entry point instead of a lonely utility page.
                </p>
              </div>
              <Link className="link-button" href="/imports">
                Open imports
              </Link>
            </div>

            {snapshot.recentActivity.latestImports.length === 0 ? (
              <p className="empty-state">
                No bank imports have been saved yet. The first file you upload will appear here
                with its status and normalized transaction count.
              </p>
            ) : (
              <div className="stack compact">
                {snapshot.recentActivity.latestImports.map((item) => (
                  <div className="activity-row" key={item.id}>
                    <div>
                      <strong>{item.originalFilename}</strong>
                      <p>
                        {item.sourceName ?? "Unknown source"} · {item.transactionCount} normalized
                        transaction{item.transactionCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="activity-meta">
                      <span className="badge badge-neutral">{item.importStatus}</span>
                      <span>{formatActivityTimestamp(item.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </section>

        <section className="card stack compact">
          <div className="page-actions">
            <div>
              <h2>Notable state</h2>
              <p className="muted-text">
                These system cues are the main things worth checking before you decide to keep the
                current behavior or change the architecture.
              </p>
            </div>
          </div>

          <div className="grid cards">
            {snapshot.recentActivity.notableStates.map((item) => (
              <article className="card" key={item.title}>
                <div className="home-card-header">
                  <h3>{item.title}</h3>
                  <span
                    className={`badge ${item.tone === "warning" ? "badge-warning" : "badge-neutral"}`}
                  >
                    {item.tone === "warning" ? "Attention" : "Healthy"}
                  </span>
                </div>
                <p>{item.description}</p>
                <Link className="link-button" href={item.href}>
                  Open related page
                </Link>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import { cache, Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import {
  getWorkspaceHomeActivitySnapshot,
  getWorkspaceHomeReportingSnapshot,
} from "@/features/home/service";
import {
  getLatestFinancialActivityMonth,
  normalizeMonthInput,
} from "@/features/reporting/monthly-report";
import {
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
  getMonthCompletenessPresentation,
} from "@/features/reporting/presentation";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";

type HomePageProps = {
  searchParams: Promise<{
    month?: string | string[];
  }>;
};

function buildReportTarget(month: string) {
  const normalizedMonth = month.slice(0, 7);
  return `/reports?month=${normalizedMonth}&mode=payment_date`;
}

const getSelectedHomeMonth = cache(async (searchParams: HomePageProps["searchParams"]) => {
  const params = await searchParams;
  if (typeof params.month === "string") {
    return normalizeMonthInput(params.month);
  }

  return withCurrentWorkspaceDb((context, db) =>
    getLatestFinancialActivityMonth(context, db),
  );
});

async function HomeReporting({ searchParams }: HomePageProps) {
  const month = await getSelectedHomeMonth(searchParams);
  const reporting = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomeReportingSnapshot(context, { month }, db),
  );
  const completion = reporting.completeness;
  const monthLabel = formatReportMonthLabel(reporting.selectedMonth);
  const statusPresentation = getMonthCompletenessPresentation(completion.status);
  const nextAction =
    completion.status === "empty"
      ? {
          href: "/imports",
          label: "Import transactions",
        }
      : completion.status === "in_progress"
        ? {
            href: `/imports/review?month=${reporting.selectedMonth.slice(0, 7)}`,
            label: `Review ${completion.pendingTransactionCount} transaction${completion.pendingTransactionCount === 1 ? "" : "s"}`,
          }
        : {
            href: buildReportTarget(reporting.selectedMonth),
            label: "View monthly report",
          };

  return (
    <div className="stack" data-testid="home-content">
      <section className="card">
        <div className="report-controls-header">
          <div>
            <span className="eyebrow">{reporting.workspaceName}</span>
            <h2>{monthLabel}</h2>
            <p className="muted-text">Choose the month you want to finish or understand.</p>
          </div>
          <form className="inline-form report-controls-form" method="GET">
            <label className="field">
              <span>Selected month</span>
              <input
                className="input"
                type="month"
                name="month"
                defaultValue={formatMonthInputValue(reporting.selectedMonth)}
              />
            </label>
            <div className="field">
              <span>&nbsp;</span>
              <button className="button button-secondary" type="submit">Load month</button>
            </div>
          </form>
        </div>
      </section>

      <section className="home-next card">
        <div>
          <span className={`badge badge-${statusPresentation.tone}`}>
            {statusPresentation.label}
          </span>
          <h2>{monthLabel}</h2>
          <p>
            {completion.status === "empty"
              ? "No imported or manual activity exists for this month."
              : completion.status === "in_progress"
                ? `${completion.reviewedTransactionCount} of ${completion.importedTransactionCount} imported transactions reviewed. Totals are based on reviewed transactions.`
                : completion.importedTransactionCount === 0
                  ? "Manual activity exists and no imported transactions need review."
                  : `All ${completion.importedTransactionCount} imported transactions have been reviewed.`}
          </p>
        </div>
        <Link className="button" href={nextAction.href}>{nextAction.label}</Link>
      </section>

      {reporting.available && reporting.monthSummary ? (
        <section className="card stack compact">
          <div>
            <h2>Monthly snapshot</h2>
            <p className="muted-text">Income, spending, savings, and who or what benefited.</p>
          </div>
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
            {reporting.spendingScopes.map((scope) => (
              <div key={scope.key}>
                <strong>
                  {formatReportMoney(scope.expenseTotal, reporting.workspaceCurrency)}
                </strong>
                <span>{scope.label}</span>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="card">
          <p className="empty-state">The monthly snapshot will appear after activity is added.</p>
        </section>
      )}

      <section className="card stack compact">
        <div className="home-card-header">
          <div>
            <h2>Top spending categories</h2>
            <p className="muted-text">The three largest reviewed categories in {monthLabel}.</p>
          </div>
          <Link className="link-button" href={buildReportTarget(reporting.selectedMonth)}>
            See category detail
          </Link>
        </div>
        {reporting.topSpendingCategories.length === 0 ? (
          <p className="empty-state">No reportable spending exists for this month yet.</p>
        ) : (
          reporting.topSpendingCategories.map((category) => (
            <div className="activity-row" key={category.categoryId ?? category.category}>
              <div>
                <strong>{category.category}</strong>
                <p>{category.itemCount} item{category.itemCount === 1 ? "" : "s"}</p>
              </div>
              <strong>
                {formatReportMoney(category.expenseTotal, reporting.workspaceCurrency)}
              </strong>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

async function HomeRecentActivity({ searchParams }: HomePageProps) {
  const month = await getSelectedHomeMonth(searchParams);
  const activity = await withCurrentWorkspaceDb((context, db) =>
    getWorkspaceHomeActivitySnapshot(context, { month }, db),
  );

  return (
    <article className="card stack compact">
      <div className="home-card-header">
        <div>
          <h2>Recent activity</h2>
          <p className="muted-text">Saved bank imports affecting the selected month.</p>
        </div>
        <Link className="link-button" href="/imports">Open imports</Link>
      </div>
      {activity.latestImports.length === 0 ? (
        <p className="empty-state">No saved imports affect this month.</p>
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

export default function HomePage({ searchParams }: HomePageProps) {
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

        <Suspense fallback={<RouteDataFallback label="Selected month" />}>
          <HomeReporting searchParams={searchParams} />
        </Suspense>

        <Suspense fallback={<HomeCardFallback label="Recent activity" />}>
          <HomeRecentActivity searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

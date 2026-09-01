import Link from "next/link";
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { getCurrencyNormalizationDisplayState } from "@/features/currency/display";
import {
  getMonthlyReport,
  getLatestFinancialActivityMonth,
  getRollingTwelveReport,
  getYearReport,
  getYearToDateReport,
  normalizeMonthInput,
  normalizeReportingModeInput,
  type ReportingMonthBucket,
  type MonthlyReportData,
  type ReportingPeriodSummary,
  type ReportingViewMode,
  type RollingTwelveReportData,
  type YearToDateReportData,
  type YearReportData,
} from "@/features/reporting/monthly-report";
import {
  formatClassificationTypeLabel,
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
  formatReportingModeLabel,
  formatSourceKind,
} from "@/features/reporting/presentation";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";


type ReportsPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    mode?: string | string[];
    view?: string | string[];
  }>;
};

type ReportsView = "month" | "year";

function buildReportsHref(
  view: ReportsView,
  month: string,
  mode: ReportingViewMode,
) {
  const params = new URLSearchParams({
    view,
    month: month.slice(0, 7),
    mode,
  });
  return `/reports?${params.toString()}`;
}

function ReportViewSwitch({
  view,
  month,
  mode,
}: {
  view: ReportsView;
  month: string;
  mode: ReportingViewMode;
}) {
  return (
    <nav className="report-view-switch" aria-label="Report view">
      <Link
        className={`button ${view === "month" ? "" : "button-secondary"}`}
        href={buildReportsHref("month", month, mode)}
        aria-current={view === "month" ? "page" : undefined}
      >
        Month
      </Link>
      <Link
        className={`button ${view === "year" ? "" : "button-secondary"}`}
        href={buildReportsHref("year", month, mode)}
        aria-current={view === "year" ? "page" : undefined}
      >
        Year
      </Link>
    </nav>
  );
}

function formatCompletenessStatus(status: YearReportData["months"][number]["status"]) {
  switch (status) {
    case "empty":
      return "Empty";
    case "in_progress":
      return "In progress";
    case "complete":
      return "Complete";
  }
}

function formatFxAmount(amount: number | null, currency: string | null) {
  return amount === null || currency === null ? null : formatReportMoney(amount, currency);
}

function PeriodSummarySection({
  title,
  description,
  summary,
  months,
}: {
  title: string;
  description: string;
  summary: ReportingPeriodSummary;
  months: ReportingMonthBucket[];
}) {
  return (
    <section className="card stack compact">
      <div>
        <h2>{title}</h2>
        <p className="muted-text">{description}</p>
      </div>

      <div className="summary-strip">
        <div>
          <strong>{formatReportMoney(summary.incomeTotal, summary.workspaceCurrency)}</strong>
          <span>Total income</span>
        </div>
        <div>
          <strong>{formatReportMoney(summary.expenseTotal, summary.workspaceCurrency)}</strong>
          <span>Total expenses</span>
        </div>
        <div>
          <strong>{formatReportMoney(summary.savingsTotal, summary.workspaceCurrency)}</strong>
          <span>Total savings</span>
        </div>
        <div>
          <strong>{formatReportMoney(summary.averageMonthlyIncome, summary.workspaceCurrency)}</strong>
          <span>Average monthly income</span>
        </div>
        <div>
          <strong>{formatReportMoney(summary.averageMonthlyExpense, summary.workspaceCurrency)}</strong>
          <span>Average monthly expenses</span>
        </div>
        <div>
          <strong>{formatReportMoney(summary.averageMonthlySavings, summary.workspaceCurrency)}</strong>
          <span>Average monthly savings</span>
        </div>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Month</th>
              <th>Income</th>
              <th>Expenses</th>
              <th>Savings</th>
              <th>Imported</th>
              <th>Manual</th>
              <th>Items</th>
            </tr>
          </thead>
          <tbody>
            {months.map((month) => (
              <tr key={month.month}>
                <td>{formatReportMonthLabel(month.month)}</td>
                <td>{formatReportMoney(month.incomeTotal, summary.workspaceCurrency)}</td>
                <td>{formatReportMoney(month.expenseTotal, summary.workspaceCurrency)}</td>
                <td>{formatReportMoney(month.savingsTotal, summary.workspaceCurrency)}</td>
                <td>{month.importedTransactionCount}</td>
                <td>{month.manualEntryCount}</td>
                <td>{month.itemCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AdvancedMonthlyReporting({
  report,
  yearToDate,
  rollingTwelve,
  fxLineItemCount,
  placeholderFxLineItemCount,
}: {
  report: MonthlyReportData;
  yearToDate: YearToDateReportData;
  rollingTwelve: RollingTwelveReportData;
  fxLineItemCount: number;
  placeholderFxLineItemCount: number;
}) {
  return (
    <details className="card disclosure">
      <summary>Advanced reporting and FX</summary>
      <div className="stack">
        <form className="inline-form report-controls-form" method="GET">
          <input type="hidden" name="view" value="month" />
          <input
            type="hidden"
            name="month"
            value={formatMonthInputValue(report.summary.selectedMonth)}
          />
          <label className="field">
            <span>Reporting mode</span>
            <select className="input" name="mode" defaultValue={report.summary.reportingMode}>
              <option value="payment_date">Payment date</option>
              <option value="allocated_period">Adjusted period</option>
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="button button-secondary" type="submit">Apply mode</button>
          </div>
        </form>

        {fxLineItemCount > 0 ? (
          <section className="card">
            <div>
              <h2>FX transparency</h2>
              <p className="muted-text">
                {placeholderFxLineItemCount > 0
                  ? `${placeholderFxLineItemCount} imported line item${placeholderFxLineItemCount === 1 ? "" : "s"} in ${formatReportMonthLabel(report.summary.selectedMonth)} still use Placeholder FX. Full multicurrency reporting is not finished yet, so those amounts remain normalized into ${report.summary.workspaceCurrency}.`
                  : `${fxLineItemCount} imported line item${fxLineItemCount === 1 ? "" : "s"} in ${formatReportMonthLabel(report.summary.selectedMonth)} came from foreign-currency activity. They are still shown in ${report.summary.workspaceCurrency} while full multicurrency reporting is unfinished.`}
              </p>
            </div>
          </section>
        ) : (
          <p className="muted-text">No foreign-currency details apply to this month.</p>
        )}

        <PeriodSummarySection
          title="Year to date"
          description={`January through ${formatReportMonthLabel(yearToDate.summary.selectedMonth)} in ${formatReportingModeLabel(yearToDate.summary.reportingMode).toLowerCase()} mode.`}
          summary={yearToDate.summary}
          months={yearToDate.months}
        />

        <PeriodSummarySection
          title="Rolling 12 months"
          description={`Twelve months ending in ${formatReportMonthLabel(rollingTwelve.summary.selectedMonth)} in ${formatReportingModeLabel(rollingTwelve.summary.reportingMode).toLowerCase()} mode.`}
          summary={rollingTwelve.summary}
          months={rollingTwelve.months}
        />
      </div>
    </details>
  );
}

function YearReportView({
  report,
  selectedMonth,
  reportingMode,
}: {
  report: YearReportData;
  selectedMonth: string;
  reportingMode: ReportingViewMode;
}) {
  return (
    <div className="stack" data-testid="reports-content">
      <section className="card stack compact">
        <ReportViewSwitch view="year" month={selectedMonth} mode={reportingMode} />
        <div className="report-controls-header">
          <div>
            <h2>{report.year} overview</h2>
            <p className="muted-text">
              Compare income, spending scopes, and savings month by month.
              {reportingMode === "allocated_period"
                ? " Completion status still follows each source transaction month."
                : " Totals use payment dates."}
            </p>
          </div>
          <form className="inline-form report-controls-form" method="GET">
            <input type="hidden" name="view" value="year" />
            <input type="hidden" name="mode" value={reportingMode} />
            <label className="field">
              <span>Year through month</span>
              <input
                className="input"
                type="month"
                name="month"
                defaultValue={formatMonthInputValue(selectedMonth)}
              />
            </label>
            <div className="field">
              <span>&nbsp;</span>
              <button className="button" type="submit">Load year</button>
            </div>
          </form>
        </div>
      </section>

      <section className="card stack compact">
        <div>
          <h2>Year totals</h2>
          <p className="muted-text">Displayed months reconcile exactly to these totals.</p>
        </div>
        <div className="summary-strip">
          <div>
            <strong>{formatReportMoney(report.totals.incomeTotal, report.workspaceCurrency)}</strong>
            <span>Total income</span>
          </div>
          <div>
            <strong>{formatReportMoney(report.totals.expenseTotal, report.workspaceCurrency)}</strong>
            <span>Total spent</span>
          </div>
          <div>
            <strong>{formatReportMoney(report.totals.savingsTotal, report.workspaceCurrency)}</strong>
            <span>Total saved</span>
          </div>
          {report.totals.scopes.map((scope) => (
            <div key={scope.key}>
              <strong>{formatReportMoney(scope.expenseTotal, report.workspaceCurrency)}</strong>
              <span>{scope.label}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack compact">
        <div>
          <h2>Monthly averages</h2>
          <p className="muted-text">Empty months inside the displayed range count as zero.</p>
        </div>
        <div className="summary-strip">
          <div>
            <strong>{formatReportMoney(report.averages.monthlyIncome, report.workspaceCurrency)}</strong>
            <span>Average income</span>
          </div>
          <div>
            <strong>{formatReportMoney(report.averages.monthlyExpense, report.workspaceCurrency)}</strong>
            <span>Average spent</span>
          </div>
          <div>
            <strong>{formatReportMoney(report.averages.monthlySavings, report.workspaceCurrency)}</strong>
            <span>Average saved</span>
          </div>
          {report.averages.scopes.map((scope) => (
            <div key={scope.key}>
              <strong>{formatReportMoney(scope.expenseTotal, report.workspaceCurrency)}</strong>
              <span>Average {scope.label.toLocaleLowerCase()}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="card stack compact">
        <div>
          <h2>Months</h2>
          <p className="muted-text">Select a month to inspect its categories and transactions.</p>
        </div>
        <div className="table-wrap">
          <table className="data-table year-report-table">
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th>Income</th>
                {report.totals.scopes.map((scope) => (
                  <th key={scope.key}>{scope.label}</th>
                ))}
                <th>Total spent</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              {report.months.map((month) => (
                <tr key={month.month}>
                  <td>
                    <Link href={buildReportsHref("month", month.month, reportingMode)}>
                      {formatReportMonthLabel(month.month)}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${month.status === "in_progress" ? "badge-warning" : "badge-neutral"}`}>
                      {formatCompletenessStatus(month.status)}
                    </span>
                    {month.totalTransactionCount > 0 ? (
                      <div className="table-note">
                        {month.reviewedTransactionCount}/{month.totalTransactionCount} reviewed
                      </div>
                    ) : null}
                  </td>
                  <td>{formatReportMoney(month.incomeTotal, report.workspaceCurrency)}</td>
                  {month.scopes.map((scope) => (
                    <td key={scope.key}>
                      {formatReportMoney(scope.expenseTotal, report.workspaceCurrency)}
                    </td>
                  ))}
                  <td>{formatReportMoney(month.expenseTotal, report.workspaceCurrency)}</td>
                  <td>{formatReportMoney(month.savingsTotal, report.workspaceCurrency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <details className="card disclosure">
        <summary>Advanced reporting</summary>
        <form className="inline-form report-controls-form" method="GET">
          <input type="hidden" name="view" value="year" />
          <input type="hidden" name="month" value={formatMonthInputValue(selectedMonth)} />
          <label className="field">
            <span>Reporting mode</span>
            <select className="input" name="mode" defaultValue={reportingMode}>
              <option value="payment_date">Payment date</option>
              <option value="allocated_period">Adjusted period</option>
            </select>
          </label>
          <div className="field">
            <span>&nbsp;</span>
            <button className="button button-secondary" type="submit">Apply mode</button>
          </div>
        </form>
      </details>
    </div>
  );
}

async function ReportsData({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const mode = typeof params.mode === "string" ? params.mode : undefined;
  const view: ReportsView = params.view === "year" ? "year" : "month";
  const selectedMonth = month
    ? normalizeMonthInput(month)
    : await withCurrentWorkspaceDb((context, db) =>
        getLatestFinancialActivityMonth(context, db),
      );
  const reportingMode = normalizeReportingModeInput(mode);

  if (view === "year") {
    const yearReport = await withCurrentWorkspaceDb((context, db) =>
      getYearReport(context, {
        throughMonth: selectedMonth,
        mode: reportingMode,
      }, db),
    );

    return (
      <YearReportView
        report={yearReport}
        selectedMonth={selectedMonth}
        reportingMode={reportingMode}
      />
    );
  }

  const [report, yearToDate, rollingTwelve] = await withCurrentWorkspaceDb(
    (context, db) =>
      Promise.all([
        getMonthlyReport(context, { month: selectedMonth, mode: reportingMode }, db),
        getYearToDateReport(context, {
          throughMonth: selectedMonth,
          mode: reportingMode,
        }, db),
        getRollingTwelveReport(context, {
          throughMonth: selectedMonth,
          mode: reportingMode,
        }, db),
      ]),
  );
  const fxLineItemCount = report.lineItems.filter((item) => {
    if (!item.fxDetails) {
      return false;
    }

    return getCurrencyNormalizationDisplayState({
      ...item.fxDetails,
      workspaceCurrency: item.workspaceCurrency,
    }).label;
  }).length;
  const placeholderFxLineItemCount = report.lineItems.filter((item) => {
    if (!item.fxDetails) {
      return false;
    }

    return getCurrencyNormalizationDisplayState({
      ...item.fxDetails,
      workspaceCurrency: item.workspaceCurrency,
    }).usesPlaceholderRate;
  }).length;
  const showFxColumn = fxLineItemCount > 0;
  const completeness = report.completeness;
  const reportMonthLabel = formatReportMonthLabel(report.summary.selectedMonth);

  return (
    <div className="stack" data-testid="reports-content">
        <section className="card stack compact">
          <ReportViewSwitch
            view="month"
            month={report.summary.selectedMonth}
            mode={report.summary.reportingMode}
          />
          <div className="report-controls-header">
            <div>
              <h2>{formatReportMonthLabel(report.summary.selectedMonth)}</h2>
              <p className="muted-text">
                {formatReportingModeLabel(report.summary.reportingMode)} view.
                {" "}
                {report.summary.reportingMode === "allocated_period"
                  ? "Spread expenses across the months they cover."
                  : "Use the date each transaction was recorded."}
              </p>
            </div>
            <form className="inline-form report-controls-form" method="GET">
              <input type="hidden" name="view" value="month" />
              <input type="hidden" name="mode" value={report.summary.reportingMode} />
              <label className="field">
                <span>Selected month</span>
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={formatMonthInputValue(report.summary.selectedMonth)}
                />
              </label>
              <div className="field">
                <span>&nbsp;</span>
                <button className="button" type="submit">
                  Load report
                </button>
              </div>
            </form>
          </div>
        </section>

        <section
          className={`status ${completeness.status === "in_progress" ? "warning" : completeness.status === "complete" ? "success" : "neutral"}`}
          aria-live="polite"
        >
          <strong>
            {completeness.status === "empty"
              ? `${reportMonthLabel} is empty.`
              : completeness.status === "in_progress"
                ? `${reportMonthLabel} is in progress.`
                : `${reportMonthLabel} is complete.`}
          </strong>{" "}
          {completeness.status === "empty"
            ? "No imported or manual activity exists for this month."
            : completeness.status === "in_progress"
              ? `${completeness.reviewedTransactionCount} of ${completeness.importedTransactionCount} imported transactions are reviewed. Totals below are based on reviewed transactions and will change.`
              : completeness.importedTransactionCount === 0
                ? "Manual activity exists and no imported transactions need review."
                : `All ${completeness.importedTransactionCount} imported transactions have been reviewed.`}
          {report.summary.reportingMode === "allocated_period" ? (
            <> Completion is still measured from transactions dated in the source month.</>
          ) : null}
        </section>

        <section className="card">
          {completeness.status === "in_progress" ? (
            <p className="muted-text">Based on reviewed transactions</p>
          ) : null}
          <div className="summary-strip">
            <div>
              <strong>{formatReportMoney(report.summary.incomeTotal, report.summary.workspaceCurrency)}</strong>
              <span>Income</span>
            </div>
            <div>
              <strong>{formatReportMoney(report.summary.expenseTotal, report.summary.workspaceCurrency)}</strong>
              <span>Total spent</span>
            </div>
            <div>
              <strong>{formatReportMoney(report.summary.savingsTotal, report.summary.workspaceCurrency)}</strong>
              <span>Saved</span>
            </div>
            <div>
              <strong>{report.summary.importedTransactionCount}</strong>
              <span>Imported items included</span>
            </div>
            <div>
              <strong>{report.summary.manualEntryCount}</strong>
              <span>Manual or recurring entries included</span>
            </div>
          </div>
        </section>

        <section className="card stack compact">
          <div>
            <h2>Spending by scope</h2>
            <p className="muted-text">
              Personal, shared, and household spending reconcile to Total spent.
            </p>
          </div>
          <div className="summary-strip">
            {report.spendingScopes.map((scope) => (
              <div key={scope.key}>
                <strong>
                  {formatReportMoney(scope.expenseTotal, report.summary.workspaceCurrency)}
                </strong>
                <span>{scope.label} · {scope.itemCount} item{scope.itemCount === 1 ? "" : "s"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card stack compact">
          <div>
            <h2>Categories by spending scope</h2>
            <p className="muted-text">See which categories explain each spending bucket.</p>
          </div>
          {report.categoryScopeBreakdown.length === 0 ? (
            <p className="empty-state">No reportable spending exists for this month yet.</p>
          ) : (
            <>
              <div className="table-wrap scope-matrix-table">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      {report.spendingScopes.map((scope) => (
                        <th key={scope.key}>{scope.label}</th>
                      ))}
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categoryScopeBreakdown.map((item) => (
                      <tr key={item.categoryId ?? item.category}>
                        <td>{item.category}</td>
                        {item.amounts.map((amount, index) => (
                          <td key={report.spendingScopes[index].key}>
                            {formatReportMoney(amount.amount, report.summary.workspaceCurrency)}
                          </td>
                        ))}
                        <td>
                          <strong>
                            {formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}
                          </strong>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="scope-category-cards">
                {report.categoryScopeBreakdown.map((item) => (
                  <article className="scope-category-card" key={item.categoryId ?? item.category}>
                    <h3>{item.category}</h3>
                    <dl className="scope-category-list">
                      {item.amounts.map((amount, index) => (
                        <div key={report.spendingScopes[index].key}>
                          <dt>{report.spendingScopes[index].label}</dt>
                          <dd>{formatReportMoney(amount.amount, report.summary.workspaceCurrency)}</dd>
                        </div>
                      ))}
                      <div className="scope-category-total">
                        <dt>Total</dt>
                        <dd>{formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}</dd>
                      </div>
                    </dl>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>

        {report.memberIncome.length > 0 ? (
          <section className="card stack compact">
            <div>
              <h2>Income attribution</h2>
              <p className="muted-text">Income stays separate from spending-scope totals.</p>
            </div>
            <div className="summary-strip">
              {report.memberIncome.map((income) => (
                <div key={income.memberId ?? "unassigned"}>
                  <strong>
                    {formatReportMoney(income.incomeTotal, report.summary.workspaceCurrency)}
                  </strong>
                  <span>{income.memberName} · {income.itemCount} item{income.itemCount === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="card">
          <h2>Included line items</h2>
          <p className="muted-text">
            {report.summary.reportingMode === "allocated_period"
              ? "Adjusted-period rows come from materialized allocations, so one source event can appear in multiple months once split coverage is introduced."
              : "Recurring-generated and manual entries are shown alongside imported classified transactions so you can verify what fed the payment month."}
          </p>

          {report.lineItems.length === 0 ? (
            <p className="empty-state">Nothing qualified for reporting in this month yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{report.summary.reportingMode === "allocated_period" ? "Report month" : "Date"}</th>
                    <th>Title</th>
                    <th>Source</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Member</th>
                    <th>Amount</th>
                    {showFxColumn ? <th>FX</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {report.lineItems.map((item) => {
                    const fxState = item.fxDetails
                      ? getCurrencyNormalizationDisplayState({
                          ...item.fxDetails,
                          workspaceCurrency: item.workspaceCurrency,
                        })
                      : null;
                    const originalFxAmount = item.fxDetails
                      ? formatFxAmount(
                          item.fxDetails.originalAmount,
                          item.fxDetails.originalCurrency,
                        )
                      : null;
                    const settlementFxAmount = item.fxDetails
                      ? formatFxAmount(
                          item.fxDetails.settlementAmount,
                          item.fxDetails.settlementCurrency,
                        )
                      : null;
                    const showSettlementAmount =
                      settlementFxAmount !== null && settlementFxAmount !== originalFxAmount;

                    return (
                      <tr key={item.id}>
                        <td>{item.eventDate}</td>
                        <td>{item.title}</td>
                        <td>
                          <span
                            className={`badge ${item.sourceKind === "recurring_generated" ? "badge-warning" : "badge-neutral"}`}
                          >
                            {formatSourceKind(item.sourceKind)}
                          </span>
                        </td>
                        <td>{formatClassificationTypeLabel(item.classificationType)}</td>
                        <td>{item.category ?? "Uncategorized"}</td>
                        <td>{item.memberName ?? "-"}</td>
                        <td>{formatReportMoney(item.normalizedAmount, item.workspaceCurrency)}</td>
                        {showFxColumn ? (
                          <td>
                            {fxState?.label ? (
                              <div className="stack compact">
                                <span
                                  className={`badge ${
                                    fxState.tone === "warning"
                                      ? "badge-warning"
                                      : "badge-neutral"
                                  }`}
                                >
                                  {fxState.label}
                                </span>
                                {originalFxAmount ? (
                                  <div className="table-note">Original {originalFxAmount}</div>
                                ) : null}
                                {showSettlementAmount ? (
                                  <div className="table-note">
                                    Settlement {settlementFxAmount}
                                  </div>
                                ) : null}
                                {!originalFxAmount && !showSettlementAmount && fxState.shortDescription ? (
                                  <div className="table-note">{fxState.shortDescription}</div>
                                ) : null}
                              </div>
                            ) : (
                              "-"
                            )}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <AdvancedMonthlyReporting
          report={report}
          yearToDate={yearToDate}
          rollingTwelve={rollingTwelve}
          fxLineItemCount={fxLineItemCount}
          placeholderFxLineItemCount={placeholderFxLineItemCount}
        />
    </div>
  );
}

export default function ReportsPage({ searchParams }: ReportsPageProps) {
  return (
    <main>
      <div className="page-shell stack">
        <section className="page-header" data-testid="reports-shell">
          <div>
            <span className="eyebrow">Reports</span>
            <h1>Understand your household money</h1>
            <p>See this month clearly, then compare it with the longer-term trend.</p>
          </div>
        </section>
        <Suspense fallback={<RouteDataFallback label="Household report" />}>
          <ReportsData searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

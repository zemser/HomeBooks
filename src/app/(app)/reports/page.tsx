import Link from "next/link";
import { Suspense } from "react";

import { RouteDataFallback } from "@/components/app-shell/route-data-fallback";
import { buildReportsHref } from "@/features/reporting/line-item-slice";
import {
  ReportDrilldown,
  ReportIncludedLineItems,
  ReportSliceControl,
} from "@/features/reporting/report-drilldown";
import {
  ReportDownloadMenu,
  ReportToolbar,
  type ReportsView,
} from "@/features/reporting/report-toolbar";
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
  formatReportMoney,
  formatReportMonthLabel,
  formatReportingModeLabel,
  getMonthCompletenessPresentation,
  getMonthCompletenessProgressCopy,
} from "@/features/reporting/presentation";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";


type ReportsPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    mode?: string | string[];
    view?: string | string[];
    kind?: string | string[];
    member?: string | string[];
    category?: string | string[];
  }>;
};

function buildYearExportHref(
  kind: "year_summary" | "category_detail" | "workbook",
  month: string,
  mode: ReportingViewMode,
) {
  const params = new URLSearchParams({
    kind,
    month: month.slice(0, 7),
    mode,
  });
  return `/api/reports/export?${params.toString()}`;
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
        {placeholderFxLineItemCount > 0 ? (
          <section className="card">
            <div>
              <h2>FX transparency</h2>
              <p className="muted-text">
                {`${placeholderFxLineItemCount} imported line item${placeholderFxLineItemCount === 1 ? "" : "s"} in ${formatReportMonthLabel(report.summary.selectedMonth)} are flagged Placeholder FX. They are excluded from ${report.summary.workspaceCurrency} totals until a monthly rate exists.`}
              </p>
            </div>
          </section>
        ) : fxLineItemCount > 0 ? (
          <section className="card">
            <div>
              <h2>FX transparency</h2>
              <p className="muted-text">
                {`${fxLineItemCount} imported line item${fxLineItemCount === 1 ? "" : "s"} in ${formatReportMonthLabel(report.summary.selectedMonth)} came from foreign-currency activity. ILS charges and monthly-average conversions are included in totals.`}
              </p>
            </div>
          </section>
        ) : null}

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
    <div className="stack report-view" data-testid="reports-content">
      <ReportToolbar
        view="year"
        month={selectedMonth}
        mode={reportingMode}
        actions={
          <ReportDownloadMenu
            items={[
              { label: "Year summary (CSV)", href: buildYearExportHref("year_summary", selectedMonth, reportingMode) },
              { label: "Category detail (CSV)", href: buildYearExportHref("category_detail", selectedMonth, reportingMode) },
              { label: "Excel workbook", href: buildYearExportHref("workbook", selectedMonth, reportingMode) },
            ]}
          />
        }
      >
        <h2>{report.year} overview</h2>
        <p className="muted-text">
          {report.months.length < 12
            ? `January through ${formatReportMonthLabel(report.months[report.months.length - 1]?.month ?? selectedMonth)}. `
            : ""}
          Compare income, spending scopes, and savings month by month.
          {reportingMode === "allocated_period"
            ? " Completion status still follows each source transaction month."
            : ""}
        </p>
      </ReportToolbar>

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
              {report.months.map((month) => {
                const statusPresentation = getMonthCompletenessPresentation(month.status);

                return <tr key={month.month}>
                  <td>
                    <Link
                      className="link-button"
                      href={buildReportsHref("month", month.month, reportingMode)}
                    >
                      {formatReportMonthLabel(month.month)}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge badge-${statusPresentation.tone}`}>
                      {statusPresentation.label}
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
              })}
            </tbody>
          </table>
        </div>
      </section>
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
  const completeness = report.completeness;
  const fxLineItemCount = report.lineItems.filter((item) => {
    if (!item.fxDetails) {
      return false;
    }

    return getCurrencyNormalizationDisplayState({
      ...item.fxDetails,
      workspaceCurrency: item.workspaceCurrency,
    }).label;
  }).length;
  const placeholderFxLineItemCount = Math.max(
    report.lineItems.filter((item) => {
      if (!item.fxDetails) {
        return false;
      }

      return getCurrencyNormalizationDisplayState({
        ...item.fxDetails,
        workspaceCurrency: item.workspaceCurrency,
      }).usesPlaceholderRate;
    }).length,
    completeness.placeholderFxTransactionCount ?? 0,
  );
  const completenessPresentation = getMonthCompletenessPresentation(completeness.status);
  const reportMonthLabel = formatReportMonthLabel(report.summary.selectedMonth);

  return (
    <ReportDrilldown report={report}>
        <ReportToolbar
          view="month"
          month={report.summary.selectedMonth}
          mode={report.summary.reportingMode}
        >
          <h2 id="report-summary" tabIndex={-1}>{reportMonthLabel}</h2>
          <p className="muted-text">
            {report.summary.reportingMode === "allocated_period"
              ? "Expenses are spread across the months they cover."
              : "Each transaction counts in the month it was paid."}
          </p>
        </ReportToolbar>

        <section
          className={`status ${completenessPresentation.tone}`}
          aria-live="polite"
        >
          <strong>
            {completeness.status === "empty"
              ? `${reportMonthLabel} is empty.`
              : completeness.status === "in_progress"
                ? `${reportMonthLabel} is in progress.`
                : `${reportMonthLabel} is complete.`}
          </strong>{" "}
          {getMonthCompletenessProgressCopy(completeness)}
          {(completeness.pendingOutflowTotal ?? 0) > 0 ? <p>Unreviewed account outflows: {formatReportMoney(completeness.pendingOutflowTotal ?? 0, report.summary.workspaceCurrency)}. These still need classification before they can count as spending or be assigned to a person.</p> : null}
          {(completeness.unresolvedAttributionCount ?? 0) > 0 ? <p>{completeness.unresolvedAttributionCount} classified transactions still need payer or income-recipient confirmation. Spending totals include classified expenses; member attribution is incomplete. <Link href={`/transactions/all?month=${report.summary.selectedMonth.slice(0, 7)}`}>Confirm people in History</Link></p> : null}
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
              <ReportSliceControl slice={{ kind: "income" }} selectable={report.summary.incomeTotal !== 0}>
                <strong>{formatReportMoney(report.summary.incomeTotal, report.summary.workspaceCurrency)}</strong>
                <span>Income</span>
              </ReportSliceControl>
            </div>
            <div>
              <ReportSliceControl slice={{ kind: "expense" }} selectable={report.summary.expenseTotal !== 0}>
                <strong>{formatReportMoney(report.summary.expenseTotal, report.summary.workspaceCurrency)}</strong>
                <span>Total spent</span>
              </ReportSliceControl>
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
              Personal and shared spending reconcile to Total spent.
            </p>
          </div>
          <div className="summary-strip">
            {report.spendingScopes.map((scope) => (
              <div key={scope.key}>
                <ReportSliceControl
                  slice={{
                    kind: scope.scope,
                    memberId: scope.scope === "personal" ? scope.memberId ?? "unassigned" : undefined,
                  }}
                  selectable={scope.itemCount > 0}
                >
                  <strong>
                    {formatReportMoney(scope.expenseTotal, report.summary.workspaceCurrency)}
                  </strong>
                  <span>{scope.label} · {scope.itemCount} item{scope.itemCount === 1 ? "" : "s"}</span>
                </ReportSliceControl>
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
                        <td>
                          <ReportSliceControl
                            slice={{ kind: "expense", categoryId: item.categoryId ?? "uncategorized" }}
                            selectable={item.itemCount > 0}
                          >
                            {item.category}
                          </ReportSliceControl>
                        </td>
                        {item.amounts.map((amount, index) => (
                          <td key={report.spendingScopes[index].key}>
                            <ReportSliceControl
                              slice={{
                                kind: amount.scope,
                                memberId: amount.scope === "personal" ? amount.memberId ?? "unassigned" : undefined,
                                categoryId: item.categoryId ?? "uncategorized",
                              }}
                              selectable={amount.itemCount > 0}
                              label={`${item.category} · ${report.spendingScopes[index].label}`}
                            >
                              {formatReportMoney(amount.amount, report.summary.workspaceCurrency)}
                            </ReportSliceControl>
                          </td>
                        ))}
                        <td>
                          <ReportSliceControl
                            slice={{ kind: "expense", categoryId: item.categoryId ?? "uncategorized" }}
                            selectable={item.itemCount > 0}
                            label={`${item.category} total`}
                          >
                            <strong>{formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}</strong>
                          </ReportSliceControl>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="scope-category-cards">
                {report.categoryScopeBreakdown.map((item) => (
                  <article className="scope-category-card" key={item.categoryId ?? item.category}>
                    <h3>
                      <ReportSliceControl
                        slice={{ kind: "expense", categoryId: item.categoryId ?? "uncategorized" }}
                        selectable={item.itemCount > 0}
                      >
                        {item.category}
                      </ReportSliceControl>
                    </h3>
                    <dl className="scope-category-list">
                      {item.amounts.map((amount, index) => (
                        <div key={report.spendingScopes[index].key}>
                          <dt>{report.spendingScopes[index].label}</dt>
                          <dd>
                            <ReportSliceControl
                              slice={{
                                kind: amount.scope,
                                memberId: amount.scope === "personal" ? amount.memberId ?? "unassigned" : undefined,
                                categoryId: item.categoryId ?? "uncategorized",
                              }}
                              selectable={amount.itemCount > 0}
                              label={`${item.category} · ${report.spendingScopes[index].label}`}
                            >
                              {formatReportMoney(amount.amount, report.summary.workspaceCurrency)}
                            </ReportSliceControl>
                          </dd>
                        </div>
                      ))}
                      <div className="scope-category-total">
                        <dt>Total</dt>
                        <dd>
                          <ReportSliceControl
                            slice={{ kind: "expense", categoryId: item.categoryId ?? "uncategorized" }}
                            selectable={item.itemCount > 0}
                            label={`${item.category} total`}
                          >
                            {formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}
                          </ReportSliceControl>
                        </dd>
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
                  <ReportSliceControl
                    slice={{ kind: "income", memberId: income.memberId ?? "unassigned" }}
                    selectable={income.itemCount > 0}
                  >
                    <strong>
                      {formatReportMoney(income.incomeTotal, report.summary.workspaceCurrency)}
                    </strong>
                    <span>{income.memberName} · {income.itemCount} item{income.itemCount === 1 ? "" : "s"}</span>
                  </ReportSliceControl>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <ReportIncludedLineItems />

        <AdvancedMonthlyReporting
          report={report}
          yearToDate={yearToDate}
          rollingTwelve={rollingTwelve}
          fxLineItemCount={fxLineItemCount}
          placeholderFxLineItemCount={placeholderFxLineItemCount}
        />
    </ReportDrilldown>
  );
}

export default function ReportsPage({ searchParams }: ReportsPageProps) {
  return (
    <main>
      <div className="page-shell stack tool-shell">
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

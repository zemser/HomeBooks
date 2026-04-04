import Link from "next/link";

import { syncExpenseEventsForRange } from "@/features/reporting/expense-events";
import {
  getMonthlyReport,
  getRollingTwelveReport,
  getYearToDateReport,
  normalizeMonthInput,
  normalizeReportingModeInput,
  type ReportingMonthBucket,
  type ReportingPeriodSummary,
  type ReportingViewMode,
} from "@/features/reporting/monthly-report";
import {
  formatClassificationTypeLabel,
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
  formatReportingModeLabel,
  formatSourceKind,
} from "@/features/reporting/presentation";
import {
  buildRollingTwelveWindow,
  buildYearToDateWindow,
} from "@/features/reporting/periods";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    mode?: string | string[];
  }>;
};

function getModeDescription(reportingMode: ReportingViewMode) {
  if (reportingMode === "allocated_period") {
    return "Adjusted-period reporting reads expense events and month allocations. Items without explicit coverage rules currently allocate into a single month.";
  }

  return "Payment-date reporting reads imported transaction dates and manual-entry event dates directly.";
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

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const mode = typeof params.mode === "string" ? params.mode : undefined;
  const selectedMonth = normalizeMonthInput(month);
  const reportingMode = normalizeReportingModeInput(mode);
  const selectedMonthDate = new Date(`${selectedMonth}T00:00:00.000Z`);
  const yearToDateWindow = buildYearToDateWindow(selectedMonthDate);
  const rollingWindow = buildRollingTwelveWindow(selectedMonthDate);
  const syncStartMonth =
    yearToDateWindow.periodStart < rollingWindow.periodStart
      ? yearToDateWindow.periodStart
      : rollingWindow.periodStart;
  const context = await resolveCurrentWorkspaceContext();

  if (reportingMode === "allocated_period") {
    await syncExpenseEventsForRange(context, {
      startMonth: syncStartMonth,
      endMonth: selectedMonth,
    });
  }

  const [report, yearToDate, rollingTwelve] = await Promise.all([
    getMonthlyReport(context, { month: selectedMonth, mode: reportingMode }),
    getYearToDateReport(context, {
      throughMonth: selectedMonth,
      mode: reportingMode,
    }),
    getRollingTwelveReport(context, {
      throughMonth: selectedMonth,
      mode: reportingMode,
    }),
  ]);

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Reports</span>
          <h1>One month matters, but the story is in the trend.</h1>
          <p>
            Compare payment-date cash flow with adjusted-period allocations without
            leaving the same report surface.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>Analysis surface</h2>
              <p className="muted-text">
                Reports are now the end of the main workflow, not a second home competing with the
                rest of the app.
              </p>
            </div>
            <div className="action-row">
              <Link className="button button-secondary" href="/expenses">
                Open ledger
              </Link>
              <Link className="button" href="/recurring">
                Open recurring
              </Link>
            </div>
          </div>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>{formatReportMonthLabel(report.summary.selectedMonth)}</h2>
              <p className="muted-text">
                {formatReportingModeLabel(report.summary.reportingMode)} view.
                {" "}
                {getModeDescription(report.summary.reportingMode)}
              </p>
            </div>
            <form className="inline-form" method="GET">
              <label className="field">
                <span>Selected month</span>
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={formatMonthInputValue(report.summary.selectedMonth)}
                />
              </label>
              <label className="field">
                <span>Reporting mode</span>
                <select className="input" name="mode" defaultValue={report.summary.reportingMode}>
                  <option value="payment_date">Payment date</option>
                  <option value="allocated_period">Adjusted period</option>
                </select>
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

        <section className="card">
          <div className="summary-strip">
            <div>
              <strong>{formatReportMoney(report.summary.incomeTotal, report.summary.workspaceCurrency)}</strong>
              <span>Income</span>
            </div>
            <div>
              <strong>{formatReportMoney(report.summary.expenseTotal, report.summary.workspaceCurrency)}</strong>
              <span>Expenses</span>
            </div>
            <div>
              <strong>{formatReportMoney(report.summary.savingsTotal, report.summary.workspaceCurrency)}</strong>
              <span>Savings</span>
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

        <section className="two-up">
          <article className="card">
            <h2>Category breakdown</h2>
            {report.categoryBreakdown.length === 0 ? (
              <p className="empty-state">No categorized report rows exist for this month yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Category</th>
                      <th>Income</th>
                      <th>Expenses</th>
                      <th>Net</th>
                      <th>Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.categoryBreakdown.map((item) => (
                      <tr key={item.category}>
                        <td>{item.category}</td>
                        <td>{formatReportMoney(item.incomeTotal, report.summary.workspaceCurrency)}</td>
                        <td>{formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}</td>
                        <td>{formatReportMoney(item.netTotal, report.summary.workspaceCurrency)}</td>
                        <td>{item.itemCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>

          <article className="card">
            <h2>Member or payer breakdown</h2>
            {report.memberBreakdown.length === 0 ? (
              <p className="empty-state">No member-attributed report rows exist for this month yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Income</th>
                      <th>Expenses</th>
                      <th>Net</th>
                      <th>Items</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.memberBreakdown.map((item) => (
                      <tr key={item.memberId ?? item.memberName}>
                        <td>{item.memberName}</td>
                        <td>{formatReportMoney(item.incomeTotal, report.summary.workspaceCurrency)}</td>
                        <td>{formatReportMoney(item.expenseTotal, report.summary.workspaceCurrency)}</td>
                        <td>{formatReportMoney(item.netTotal, report.summary.workspaceCurrency)}</td>
                        <td>{item.itemCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </article>
        </section>

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
                  </tr>
                </thead>
                <tbody>
                  {report.lineItems.map((item) => (
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

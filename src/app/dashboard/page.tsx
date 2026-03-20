import { syncExpenseEventsForRange } from "@/features/reporting/expense-events";
import {
  getDashboardSnapshot,
  normalizeMonthInput,
  normalizeReportingModeInput,
} from "@/features/reporting/monthly-report";
import {
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
  formatReportingModeLabel,
} from "@/features/reporting/presentation";
import { buildRollingTwelveWindow } from "@/features/reporting/periods";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    month?: string | string[];
    mode?: string | string[];
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const mode = typeof params.mode === "string" ? params.mode : undefined;
  const selectedMonth = normalizeMonthInput(month);
  const reportingMode = normalizeReportingModeInput(mode, "allocated_period");
  const rollingWindow = buildRollingTwelveWindow(new Date(`${selectedMonth}T00:00:00.000Z`));
  const context = await resolveCurrentWorkspaceContext();

  if (reportingMode === "allocated_period") {
    await syncExpenseEventsForRange(context, {
      startMonth: rollingWindow.periodStart,
      endMonth: selectedMonth,
    });
  }

  const dashboard = await getDashboardSnapshot(context, {
    month: selectedMonth,
    mode: reportingMode,
  });
  const trailingMonths = [...dashboard.trailingMonths].reverse();

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Dashboard</span>
          <h1>Reporting should feel annual, not only monthly.</h1>
          <p>
            The dashboard now supports both payment-date cash flow and adjusted-period
            allocations, with adjusted mode as the default view.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>{formatReportMonthLabel(dashboard.selectedMonth)}</h2>
              <p className="muted-text">
                {formatReportingModeLabel(dashboard.reportingMode)} mode for the selected
                month and trailing 12-month trend.
              </p>
            </div>
            <form className="inline-form" method="GET">
              <label className="field">
                <span>Selected month</span>
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={formatMonthInputValue(dashboard.selectedMonth)}
                />
              </label>
              <label className="field">
                <span>Reporting mode</span>
                <select className="input" name="mode" defaultValue={dashboard.reportingMode}>
                  <option value="allocated_period">Adjusted period</option>
                  <option value="payment_date">Payment date</option>
                </select>
              </label>
              <div className="field">
                <span>&nbsp;</span>
                <button className="button" type="submit">
                  Load dashboard
                </button>
              </div>
            </form>
          </div>
        </section>

        <section className="card">
          <div className="summary-strip">
            <div>
              <strong>{formatReportMoney(dashboard.monthSummary.incomeTotal, dashboard.workspaceCurrency)}</strong>
              <span>Selected-month income</span>
            </div>
            <div>
              <strong>{formatReportMoney(dashboard.monthSummary.expenseTotal, dashboard.workspaceCurrency)}</strong>
              <span>Selected-month expenses</span>
            </div>
            <div>
              <strong>{formatReportMoney(dashboard.monthSummary.savingsTotal, dashboard.workspaceCurrency)}</strong>
              <span>Selected-month savings</span>
            </div>
            <div>
              <strong>
                {formatReportMoney(
                  dashboard.rollingTwelveSummary.averageMonthlySavings,
                  dashboard.workspaceCurrency,
                )}
              </strong>
              <span>Rolling 12-month average savings</span>
            </div>
          </div>
        </section>

        <section className="card stack compact">
          <div>
            <h2>Trailing 12 months</h2>
            <p className="muted-text">
              Latest 12 {dashboard.reportingMode === "allocated_period" ? "adjusted" : "payment"} months ending in{" "}
              {formatReportMonthLabel(dashboard.selectedMonth)}.
            </p>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Income</th>
                  <th>Expenses</th>
                  <th>Savings</th>
                </tr>
              </thead>
              <tbody>
                {trailingMonths.map((monthBucket) => (
                  <tr key={monthBucket.month}>
                    <td>{formatReportMonthLabel(monthBucket.month)}</td>
                    <td>{formatReportMoney(monthBucket.incomeTotal, dashboard.workspaceCurrency)}</td>
                    <td>{formatReportMoney(monthBucket.expenseTotal, dashboard.workspaceCurrency)}</td>
                    <td>{formatReportMoney(monthBucket.savingsTotal, dashboard.workspaceCurrency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

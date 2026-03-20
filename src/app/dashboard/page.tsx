import { getDashboardSnapshot } from "@/features/reporting/monthly-report";
import {
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
} from "@/features/reporting/presentation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

type DashboardPageProps = {
  searchParams: Promise<{
    month?: string | string[];
  }>;
};

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const context = await resolveCurrentWorkspaceContext();
  const dashboard = await getDashboardSnapshot(context, { month });
  const trailingMonths = [...dashboard.trailingMonths].reverse();

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Dashboard</span>
          <h1>Reporting should feel annual, not only monthly.</h1>
          <p>
            These cards stay on the same payment-date reporting contract as the reports
            page, so month and trailing views stay aligned.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>{formatReportMonthLabel(dashboard.selectedMonth)}</h2>
              <p className="muted-text">
                Current cards use selected-month totals plus a trailing 12-month savings
                average.
              </p>
            </div>
            <form className="field" method="GET">
              <span>Selected month</span>
              <div className="action-row">
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={formatMonthInputValue(dashboard.selectedMonth)}
                />
                <button className="button" type="submit">
                  Load month
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
              Latest 12 payment months ending in {formatReportMonthLabel(dashboard.selectedMonth)}.
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

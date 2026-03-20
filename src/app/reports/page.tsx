import { getMonthlyReport } from "@/features/reporting/monthly-report";
import {
  formatClassificationTypeLabel,
  formatMonthInputValue,
  formatReportMoney,
  formatReportMonthLabel,
  formatSourceKind,
} from "@/features/reporting/presentation";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{
    month?: string | string[];
  }>;
};

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const month = typeof params.month === "string" ? params.month : undefined;
  const context = await resolveCurrentWorkspaceContext();
  const report = await getMonthlyReport(context, { month });

  return (
    <main>
      <div className="page-shell stack">
        <section className="hero">
          <span className="eyebrow">Reports</span>
          <h1>One month matters, but the story is in the trend.</h1>
          <p>
            This reporting slice is backed by real classified imports plus manual and
            recurring-generated entries, all normalized into the workspace currency.
          </p>
        </section>

        <section className="card">
          <div className="page-actions">
            <div>
              <h2>{formatReportMonthLabel(report.summary.selectedMonth)}</h2>
              <p className="muted-text">
                Payment-date reporting only for now. Imported transactions use
                `transactionDate`; manual entries use `eventDate`.
              </p>
            </div>
            <form className="field" method="GET">
              <span>Selected month</span>
              <div className="action-row">
                <input
                  className="input"
                  type="month"
                  name="month"
                  defaultValue={formatMonthInputValue(report.summary.selectedMonth)}
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
            Recurring-generated and manual entries are shown alongside imported classified
            transactions so you can verify what fed the month.
          </p>

          {report.lineItems.length === 0 ? (
            <p className="empty-state">Nothing qualified for reporting in this month yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
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

"use client";

import Link from "next/link";
import type { MonthlyReportLineItem, ReportingViewMode } from "./monthly-report";
import { buildReportHistoryHref } from "./line-item-slice";
import { getCurrencyNormalizationDisplayState } from "@/features/currency/display";
import { formatClassificationTypeLabel, formatReportMoney, formatSourceKind } from "./presentation";

function formatFxAmount(amount: number | null, currency: string | null) {
  return amount === null || currency === null ? null : formatReportMoney(amount, currency);
}

export function ReportLineItemsTable({ items, mode }: { items: MonthlyReportLineItem[]; mode: ReportingViewMode }) {
  const showFxColumn = items.some((item) => item.fxDetails && getCurrencyNormalizationDisplayState({ ...item.fxDetails, workspaceCurrency: item.workspaceCurrency }).label);
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">{mode === "allocated_period" ? "Report month" : "Date"}</th>
            <th scope="col">Title</th>
            <th scope="col">Source</th>
            <th scope="col">Type</th>
            <th scope="col">Category</th>
            <th scope="col">Member</th>
            <th scope="col">{mode === "allocated_period" ? "Included this month" : "Amount"}</th>
            {showFxColumn ? <th scope="col">FX</th> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
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

            const historyHref = buildReportHistoryHref(item);
            return (
              <tr key={item.id}>
                <td>{item.eventDate}</td>
                <td>
                  {item.title}
                  {mode === "allocated_period" ? (
                    item.sourceEventDate !== null && item.sourceNormalizedAmount !== null ? <div className="table-note">
                      <div>Source payment/event date: {item.sourceEventDate}</div>
                      <div>Full source amount: {formatReportMoney(item.sourceNormalizedAmount, item.workspaceCurrency)}</div>
                    </div> : <div className="table-note">Source details unavailable</div>
                  ) : null}
                  {historyHref ? <div><Link className="link-button" href={historyHref}>Open in History</Link></div> : null}
                </td>
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
  );
}

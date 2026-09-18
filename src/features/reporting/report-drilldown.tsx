"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import type { MonthlyReportData, ReportingViewMode } from "./monthly-report";
import {
  buildReportsHref, getReportSliceAmount, getReportSliceLabel, lineItemMatchesSlice,
  parseReportLineItemSlice, serializeReportLineItemSlice, SLICE_PARAMS,
  type ReportLineItemSlice, type SliceState,
} from "./line-item-slice";
import { formatReportMoney, formatReportMonthLabel, formatReportingModeLabel, getMonthCompletenessProgressCopy } from "./presentation";
import { ReportLineItemsTable } from "./report-line-items-table";

const DrilldownContext = createContext<{
  report: MonthlyReportData;
  state: SliceState;
  select: (slice: ReportLineItemSlice, origin: HTMLButtonElement) => void;
  clear: () => void;
  back: () => void;
} | null>(null);

function useDrilldown() {
  const context = useContext(DrilldownContext);
  if (!context) throw new Error("Report drilldown must be inside its provider.");
  return context;
}

function focusAndScroll(element: HTMLElement | null) {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: "start", behavior: "instant" });
}

export function ReportDrilldown({ report, children }: { report: MonthlyReportData; children: ReactNode }) {
  const searchParams = useSearchParams();
  const state = parseReportLineItemSlice(new URLSearchParams(searchParams.toString()), report.sliceMetadata);
  const origin = useRef<HTMLButtonElement | null>(null);
  const pendingFocus = useRef(false);
  const canonicalKind = state.status === "valid" ? state.slice.kind : undefined;

  useEffect(() => {
    if (canonicalKind && !searchParams.has("kind")) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("kind", canonicalKind);
      window.history.replaceState(null, "", `?${params}${window.location.hash}`);
    }
    if (pendingFocus.current) {
      pendingFocus.current = false;
      focusAndScroll(document.getElementById("line-items"));
    }
  }, [searchParams, canonicalKind]);

  function writeSlice(slice?: ReportLineItemSlice, focusHeading = true) {
    const params = new URLSearchParams(searchParams.toString());
    SLICE_PARAMS.forEach((key) => params.delete(key));
    serializeReportLineItemSlice(slice).forEach((value, key) => params.set(key, value));
    params.set("view", "month");
    params.set("month", report.summary.selectedMonth.slice(0, 7));
    params.set("mode", report.summary.reportingMode);
    pendingFocus.current = focusHeading;
    window.history.pushState(null, "", `?${params}${focusHeading ? "#line-items" : ""}`);
  }

  function clear() { writeSlice(); }

  return (
    <DrilldownContext.Provider value={{
      report, state, clear,
      select(slice, button) {
        origin.current = button;
        const active = state.status === "valid" && serializeReportLineItemSlice(state.slice).toString() === serializeReportLineItemSlice(slice).toString();
        writeSlice(active ? undefined : slice, !active);
      },
      back() {
        const button = origin.current;
        focusAndScroll(button?.isConnected && button.getClientRects().length ? button : document.getElementById("report-summary"));
      },
    }}>
      <div className="stack" data-testid="reports-content" onKeyDown={(event) => {
        if (event.key === "Escape" && state.status !== "none") {
          event.preventDefault();
          clear();
        }
      }}>{children}</div>
    </DrilldownContext.Provider>
  );
}

export function ReportSliceControl({ slice, selectable, children, label }: {
  slice: ReportLineItemSlice; selectable: boolean; children: ReactNode; label?: string;
}) {
  const { state, select } = useDrilldown();
  if (!selectable) return <>{children}</>;
  const active = state.status === "valid" && serializeReportLineItemSlice(state.slice).toString() === serializeReportLineItemSlice(slice).toString();
  return <button type="button" className="report-slice-control" aria-label={label} aria-pressed={active}
    onClick={(event) => select(slice, event.currentTarget)}>{children}</button>;
}

// These controls read the live URL, including unavailable params, so a month/mode
// change never silently broadens a requested filter.
export function ReportSliceInputs() {
  const searchParams = useSearchParams();
  return <>{SLICE_PARAMS.flatMap((key) => searchParams.getAll(key).map((value, index) =>
    <input key={`${key}-${index}`} type="hidden" name={key} value={value} />))}</>;
}

export function ReportsMonthLink({ month, mode, className, children, current }: {
  month: string; mode: ReportingViewMode; className: string; children: ReactNode; current: boolean;
}) {
  const searchParams = useSearchParams();
  const params = new URLSearchParams(buildReportsHref("month", month, mode).split("?")[1]);
  if (searchParams.get("view") !== "year") SLICE_PARAMS.forEach((key) => searchParams.getAll(key).forEach((value) => params.append(key, value)));
  return <Link href={`/reports?${params}`} className={className} aria-current={current ? "page" : undefined}>{children}</Link>;
}

export function ReportIncludedLineItems() {
  const { report, state, clear, back } = useDrilldown();
  const items = state.status === "unavailable" ? [] : state.status === "valid"
    ? report.lineItems.filter((item) => lineItemMatchesSlice(item, state.slice)) : report.lineItems;
  const label = state.status === "valid" ? getReportSliceLabel(state.slice, report.sliceMetadata) : "All items";
  return <section className="card stack compact" aria-labelledby="line-items">
    <div className="report-line-items-header">
      <div className="stack compact">
        <h2 id="line-items" tabIndex={-1}>Included line items · {state.status === "unavailable" ? "Unavailable filter" : label}</h2>
        <div className="report-slice-description" aria-live="polite">
          {state.status !== "unavailable" ? <span>{items.length} item{items.length === 1 ? "" : "s"}{state.status === "valid" ? ` · ${formatReportMoney(getReportSliceAmount(report, state.slice), report.summary.workspaceCurrency)}` : ""}</span> : null}
          {state.status === "valid" ? <button className="button button-secondary" type="button" aria-label={`Clear ${label} filter`} onClick={clear}>Clear</button> : null}
        </div>
        <p className="muted-text">{formatReportMonthLabel(report.summary.selectedMonth)} · {formatReportingModeLabel(report.summary.reportingMode)}</p>
        {report.completeness.status === "in_progress" ? <p className="status warning">{getMonthCompletenessProgressCopy(report.completeness)}</p> : null}
      </div>
      <button className="button button-secondary" type="button" onClick={back}>Back to summary</button>
    </div>
    {state.status === "unavailable" ? <div className="empty-state">
      <p>This filter is no longer available</p>
      <button className="button button-secondary" type="button" onClick={clear}>Show all items</button>
    </div> : items.length === 0 ? <p className="empty-state">{state.status === "valid" ? "No items in this slice" : "Nothing qualified for reporting in this month yet."}</p>
      : <ReportLineItemsTable items={items} mode={report.summary.reportingMode} />}
  </section>;
}

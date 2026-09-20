"use client";

import { useRef } from "react";

import {
  HISTORY_MONTH_ALL,
  historyMonthIsUnscoped,
} from "@/features/expenses/history-query";
import {
  earliestYearMonth,
  formatYearMonthLabel,
  latestNavigableYearMonth,
  shiftYearMonth,
} from "@/lib/dates/months";

function ChevronIcon({ direction }: { direction: "prev" | "next" }) {
  const isPrev = direction === "prev";
  return (
    <svg
      aria-hidden="true"
      className={isPrev ? "history-month-chevron is-prev" : "history-month-chevron"}
      fill="none"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d={isPrev ? "M10 3.5 5.5 8 10 12.5" : "M6 3.5 10.5 8 6 12.5"}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function HistoryMonthNav({
  month,
  defaultMonth,
  months,
  onChange,
}: {
  month: string;
  defaultMonth: string;
  months: string[];
  onChange: (month: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allMonths = historyMonthIsUnscoped(month);
  const earliest = earliestYearMonth(months);
  const latest = latestNavigableYearMonth(defaultMonth);
  const canPrev = earliest != null && !allMonths && month.localeCompare(earliest) > 0;
  const canNext = !allMonths && month.localeCompare(latest) < 0;
  const label = allMonths ? "All months" : formatYearMonthLabel(month);
  const pickerValue = allMonths ? latest : month;

  function openMonthPicker() {
    const input = inputRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall through to focus when the picker cannot open.
      }
    }
    input.focus();
    input.click();
  }

  return (
    <div className="history-month-nav" role="group" aria-label="Month">
      <button
        aria-hidden={allMonths || undefined}
        aria-label="Previous month"
        className={allMonths ? "history-month-step is-inert" : "history-month-step"}
        disabled={!canPrev}
        onClick={() => onChange(shiftYearMonth(month, -1))}
        tabIndex={allMonths ? -1 : undefined}
        type="button"
      >
        <ChevronIcon direction="prev" />
      </button>
      <div className="history-month-jump">
        <button
          aria-label={`Jump to month, ${label}`}
          className="history-month-jump-label"
          onClick={openMonthPicker}
          type="button"
        >
          {label}
        </button>
        <input
          aria-hidden="true"
          className="sr-only"
          data-testid="history-month-input"
          max={latest}
          min={earliest ?? undefined}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          ref={inputRef}
          tabIndex={-1}
          type="month"
          value={pickerValue}
        />
      </div>
      <button
        aria-hidden={allMonths || undefined}
        aria-label="Next month"
        className={allMonths ? "history-month-step is-inert" : "history-month-step"}
        disabled={!canNext}
        onClick={() => onChange(shiftYearMonth(month, 1))}
        tabIndex={allMonths ? -1 : undefined}
        type="button"
      >
        <ChevronIcon direction="next" />
      </button>
      <button
        className="link-button"
        onClick={() => onChange(allMonths ? defaultMonth : HISTORY_MONTH_ALL)}
        type="button"
      >
        {allMonths ? "Latest month" : "All months"}
      </button>
    </div>
  );
}

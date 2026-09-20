"use client";

import { useRef } from "react";

import {
  HISTORY_MONTH_ALL,
  historyMonthIsUnscoped,
} from "@/features/expenses/history-query";
import { shiftYearMonth, yearMonth } from "@/lib/dates/months";

function formatHistoryMonthLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}-01T00:00:00.000Z`));
}

function latestNavigableMonth(defaultMonth: string) {
  const current = yearMonth(new Date());
  return defaultMonth.localeCompare(current) >= 0 ? defaultMonth : current;
}

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
  onChange,
}: {
  month: string;
  defaultMonth: string;
  onChange: (month: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allMonths = historyMonthIsUnscoped(month);
  const latest = latestNavigableMonth(defaultMonth);
  const canPrev = !allMonths;
  const canNext = !allMonths && month.localeCompare(latest) < 0;
  const label = allMonths ? "All months" : formatHistoryMonthLabel(month);

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
        aria-label="Previous month"
        className="history-month-step"
        disabled={!canPrev}
        onClick={() => onChange(shiftYearMonth(month, -1))}
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
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value);
          }}
          ref={inputRef}
          tabIndex={-1}
          type="month"
          value={allMonths ? "" : month}
        />
      </div>
      <button
        aria-label="Next month"
        className="history-month-step"
        disabled={!canNext}
        onClick={() => onChange(shiftYearMonth(month, 1))}
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

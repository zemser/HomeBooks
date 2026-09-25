"use client";

import { MonthPicker } from "@/components/dates/month-picker";

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
  const allMonths = historyMonthIsUnscoped(month);
  const earliest = earliestYearMonth(months);
  const latest = latestNavigableYearMonth(defaultMonth);
  const canPrev = earliest != null && !allMonths && month.localeCompare(earliest) > 0;
  const canNext = !allMonths && month.localeCompare(latest) < 0;
  const label = allMonths ? "All months" : formatYearMonthLabel(month);
  const pickerValue = allMonths ? latest : month;

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
      <MonthPicker
        label="Jump to month"
        hideLabel
        triggerLabel={label}
        triggerClassName="history-month-jump-label"
        value={allMonths ? "" : month}
        defaultValue={pickerValue}
        min={earliest ?? undefined}
        max={latest}
        onChange={onChange}
      />
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

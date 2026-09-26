"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useOptimistic, useTransition, type ReactNode } from "react";
import { Button } from "react-aria-components/Button";
import { Menu, MenuItem, MenuTrigger } from "react-aria-components/Menu";
import { Popover } from "react-aria-components/Popover";

import { MonthPicker } from "@/components/dates/month-picker";
import { PickerChevron } from "@/components/dates/picker-icons";
import {
  formatYearMonthLabel,
  latestNavigableYearMonth,
  localYearMonth,
  shiftYearMonth,
} from "@/lib/dates/months";
import { SLICE_PARAMS } from "./line-item-slice";
import type { ReportingViewMode } from "./monthly-report";

export type ReportsView = "month" | "year";

type ReportTarget = { view: ReportsView; month: string; mode: ReportingViewMode };

const VIEW_OPTIONS: { value: ReportsView; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

const MODE_OPTIONS: { value: ReportingViewMode; label: string }[] = [
  { value: "payment_date", label: "Payment date" },
  { value: "allocated_period", label: "Adjusted period" },
];

/** Past years always load in full; the current year loads through this month. */
function throughMonthForYear(year: number) {
  const current = localYearMonth();
  return year < Number(current.slice(0, 4)) ? `${year}-12` : current;
}

export function ReportToolbar({ view, month, mode, children, actions }: {
  view: ReportsView;
  month: string;
  mode: ReportingViewMode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [target, setTarget] = useOptimistic<ReportTarget>({ view, month: month.slice(0, 7), mode });

  // Slices come from the live URL, including unavailable ones, so a month or
  // mode change never silently broadens a requested filter.
  function hrefFor(next: ReportTarget) {
    const params = new URLSearchParams({ view: next.view, month: next.month, mode: next.mode });
    if (next.view === "month" && view === "month") {
      SLICE_PARAMS.forEach((key) => searchParams.getAll(key).forEach((value) => params.append(key, value)));
    }
    return `/reports?${params}`;
  }

  function go(change: Partial<ReportTarget>) {
    const next = { ...target, ...change };
    startTransition(() => {
      setTarget(next);
      router.push(hrefFor(next), { scroll: false });
    });
  }

  function segment<T extends string>(
    key: "view" | "mode",
    options: { value: T; label: string }[],
    label: string,
  ) {
    return (
      <nav className="segmented" aria-label={label}>
        {options.map((option) => {
          const current = target[key] === option.value;
          return (
            <Link
              key={option.value}
              className="segmented-option"
              href={hrefFor({ ...target, [key]: option.value })}
              aria-current={current ? "page" : undefined}
              onNavigate={(event) => {
                event.preventDefault();
                if (!current) go({ [key]: option.value });
              }}
            >
              {option.label}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <section className="card stack compact report-toolbar" aria-busy={isPending}>
      <div className="report-toolbar-row">
        {segment("view", VIEW_OPTIONS, "Report view")}
        {target.view === "month"
          ? <MonthStepper month={target.month} onChange={(next) => go({ month: next })} />
          : <YearStepper
              year={Number(target.month.slice(0, 4))}
              onChange={(year) => go({ month: throughMonthForYear(year) })}
            />}
      </div>
      <div className="report-toolbar-row">
        <div className="report-toolbar-heading">{children}</div>
        <div className="report-toolbar-actions">
          {segment("mode", MODE_OPTIONS, "Reporting mode")}
          {actions}
        </div>
      </div>
    </section>
  );
}

function MonthStepper({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const latest = latestNavigableYearMonth(month);
  return (
    <div className="report-period-nav" role="group" aria-label="Month">
      <button
        aria-label="Previous month"
        className="history-month-step"
        onClick={() => onChange(shiftYearMonth(month, -1))}
        type="button"
      >
        <PickerChevron direction="prev" />
      </button>
      <MonthPicker
        label="Report month"
        hideLabel
        triggerLabel={formatYearMonthLabel(month)}
        triggerClassName="history-month-jump-label"
        value={month}
        max={latest}
        onChange={onChange}
      />
      <button
        aria-label="Next month"
        className="history-month-step"
        disabled={month.localeCompare(localYearMonth()) >= 0}
        onClick={() => onChange(shiftYearMonth(month, 1))}
        type="button"
      >
        <PickerChevron direction="next" />
      </button>
    </div>
  );
}

function YearStepper({ year, onChange }: { year: number; onChange: (year: number) => void }) {
  return (
    <div className="report-period-nav" role="group" aria-label="Year">
      <button
        aria-label="Previous year"
        className="history-month-step"
        onClick={() => onChange(year - 1)}
        type="button"
      >
        <PickerChevron direction="prev" />
      </button>
      <span className="report-period-label" aria-live="polite" aria-atomic="true">{year}</span>
      <button
        aria-label="Next year"
        className="history-month-step"
        disabled={year >= Number(localYearMonth().slice(0, 4))}
        onClick={() => onChange(year + 1)}
        type="button"
      >
        <PickerChevron direction="next" />
      </button>
    </div>
  );
}

export function ReportDownloadMenu({ items }: { items: { label: string; href: string }[] }) {
  return (
    <MenuTrigger>
      <Button className="button button-secondary report-download-trigger">
        Download
        <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 6 8 10.5 12.5 6" />
        </svg>
      </Button>
      <Popover className="report-menu-popover" placement="bottom end" offset={8}>
        <Menu className="report-menu" aria-label="Download year report">
          {items.map((item) => (
            <MenuItem key={item.href} className="report-menu-item" href={item.href}>
              {item.label}
            </MenuItem>
          ))}
        </Menu>
      </Popover>
    </MenuTrigger>
  );
}
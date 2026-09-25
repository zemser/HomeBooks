"use client";

import { useState } from "react";
import { CalendarDate } from "@internationalized/date";
import { Button } from "react-aria-components/Button";
import { Dialog, DialogTrigger } from "react-aria-components/Dialog";
import { ListBox, ListBoxItem } from "react-aria-components/ListBox";
import { Popover } from "react-aria-components/Popover";

import { formatYearMonthLabel, localYearMonth } from "@/lib/dates/months";
import { CalendarIcon, PickerChevron } from "./picker-icons";

type MonthPickerProps = {
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  name?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  hideLabel?: boolean;
  triggerLabel?: string;
  triggerClassName?: string;
};

/** Month-only UI. The form/API boundary remains a YYYY-MM string. */
export function MonthPicker({
  label,
  value,
  defaultValue = "",
  onChange,
  name,
  min,
  max,
  disabled,
  hideLabel = false,
  triggerLabel,
  triggerClassName,
}: MonthPickerProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selected = value ?? internalValue;
  const [isOpen, setIsOpen] = useState(false);
  const [year, setYear] = useState(
    Number((selected || min || max || "2000").slice(0, 4)),
  );
  const minYear = min ? Number(min.slice(0, 4)) : 1;
  const maxYear = max ? Number(max.slice(0, 4)) : 9999;
  const caption =
    triggerLabel ??
    (selected ? formatYearMonthLabel(selected) : "Choose month");
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new CalendarDate(year, index + 1, 1);
    const id = date.toString().slice(0, 7);
    return {
      id,
      label: formatYearMonthLabel(id),
      short: new Intl.DateTimeFormat("en", {
        month: "short",
        timeZone: "UTC",
      }).format(date.toDate("UTC")),
    };
  });

  function selectMonth(next: string) {
    if ((min && next < min) || (max && next > max) || disabled) return;
    setInternalValue(next);
    onChange?.(next);
    setIsOpen(false);
  }

  return (
    <div className={hideLabel ? "month-picker" : "field month-picker"}>
      {!hideLabel && <span>{label}</span>}
      {name && (
        <input type="hidden" name={name} value={selected} disabled={disabled} />
      )}
      <DialogTrigger
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (open) {
            const initial = selected || defaultValue || localYearMonth();
            setYear(
              Math.min(maxYear, Math.max(minYear, Number(initial.slice(0, 4)))),
            );
          }
          setIsOpen(open);
        }}
      >
        <Button
          type="button"
          className={triggerClassName ?? "input date-picker-trigger"}
          aria-label={`${label}, ${caption}`}
          isDisabled={disabled}
        >
          <span>{caption}</span>
          {!hideLabel && <CalendarIcon />}
        </Button>
        <Popover
          className="date-picker-popover"
          placement="bottom start"
          offset={8}
        >
          <Dialog aria-label={label} className="date-picker-dialog">
            <div className="date-picker-heading">
              <Button
                className="date-picker-step"
                aria-label="Previous year"
                isDisabled={year <= minYear}
                onPress={() => setYear((current) => current - 1)}
              >
                <PickerChevron direction="prev" />
              </Button>
              <span
                className="date-picker-year"
                aria-live="polite"
                aria-atomic="true"
              >
                {year}
              </span>
              <Button
                className="date-picker-step"
                aria-label="Next year"
                isDisabled={year >= maxYear}
                onPress={() => setYear((current) => current + 1)}
              >
                <PickerChevron direction="next" />
              </Button>
            </div>
            <ListBox
              aria-label={`Months in ${year}`}
              className="month-picker-grid"
              layout="grid"
              selectionMode="single"
              selectionBehavior="toggle"
              selectedKeys={selected ? [selected] : []}
              disabledKeys={months
                .filter(({ id }) => (min && id < min) || (max && id > max))
                .map(({ id }) => id)}
              autoFocus
              items={months}
              onSelectionChange={(keys) => {
                if (keys !== "all")
                  selectMonth(String([...keys][0] ?? selected));
              }}
            >
              {(month) => (
                <ListBoxItem
                  id={month.id}
                  textValue={month.label}
                  aria-label={month.label}
                  className="month-picker-option"
                >
                  {month.short}
                </ListBoxItem>
              )}
            </ListBox>
          </Dialog>
        </Popover>
      </DialogTrigger>
    </div>
  );
}

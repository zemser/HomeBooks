"use client";

import { parseDate } from "@internationalized/date";
import { Button } from "react-aria-components/Button";
import {
  Calendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
} from "react-aria-components/Calendar";
import { DateInput, DateSegment } from "react-aria-components/DateField";
import { DatePicker as AriaDatePicker } from "react-aria-components/DatePicker";
import { Dialog } from "react-aria-components/Dialog";
import { Group } from "react-aria-components/Group";
import { Heading } from "react-aria-components/Heading";
import { I18nProvider } from "react-aria-components/I18nProvider";
import { Label } from "react-aria-components/Label";
import { Popover } from "react-aria-components/Popover";

import { CalendarIcon, PickerChevron } from "./picker-icons";

/** Date-only values never pass through a local-time JavaScript Date. */
export function DatePicker({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <I18nProvider locale="en-GB">
      <AriaDatePicker
        className="field date-picker"
        value={value ? parseDate(value) : null}
        onChange={(date) => onChange(date?.toString() ?? "")}
        isDisabled={disabled}
      >
        <Label>{label}</Label>
        <Group className="input date-picker-field">
          <DateInput className="date-picker-segments">
            {(segment) => (
              <DateSegment segment={segment} className="date-picker-segment" />
            )}
          </DateInput>
          <Button
            className="date-picker-step"
            aria-label={`Choose ${label.toLowerCase()}`}
          >
            <CalendarIcon />
          </Button>
        </Group>
        <Popover
          className="date-picker-popover"
          placement="bottom start"
          offset={8}
        >
          <Dialog className="date-picker-dialog" aria-label={label}>
            <Calendar className="date-picker-calendar">
              <div className="date-picker-heading">
                <Button
                  slot="previous"
                  className="date-picker-step"
                  aria-label="Previous month"
                >
                  <PickerChevron direction="prev" />
                </Button>
                <Heading />
                <Button
                  slot="next"
                  className="date-picker-step"
                  aria-label="Next month"
                >
                  <PickerChevron direction="next" />
                </Button>
              </div>
              <CalendarGrid className="date-picker-days">
                <CalendarGridHeader>
                  {(day) => <CalendarHeaderCell>{day}</CalendarHeaderCell>}
                </CalendarGridHeader>
                <CalendarGridBody>
                  {(date) => (
                    <CalendarCell date={date} className="date-picker-day" />
                  )}
                </CalendarGridBody>
              </CalendarGrid>
            </Calendar>
          </Dialog>
        </Popover>
      </AriaDatePicker>
    </I18nProvider>
  );
}

"use client";

import type { Dispatch, SetStateAction } from "react";

import type { ExpenseAllocationState } from "@/features/expenses/allocation";
import { formatMoneyDisplay } from "@/features/expenses/presentation";

export type AllocationFormState = {
  reportingMode: "payment_date" | "allocated_period";
  allocationStrategy: "equal_split" | "manual_split";
  coverageStartDate: string;
  coverageEndDate: string;
  allocations: Array<{
    reportMonth: string;
    allocatedAmount: string;
  }>;
};

type AllocationEditorProps = {
  form: AllocationFormState;
  setForm: Dispatch<SetStateAction<AllocationFormState>>;
  totalAmount: string;
  currency: string;
  sourceDate: string;
  direction?: string;
  disabled?: boolean;
  isSaving: boolean;
  onSave: () => void;
  saveLabel?: string;
};

export const emptyAllocationForm: AllocationFormState = {
  reportingMode: "payment_date",
  allocationStrategy: "equal_split",
  coverageStartDate: "",
  coverageEndDate: "",
  allocations: [],
};

export function toMonthInputValue(value: string) {
  return value.slice(0, 7);
}

export function addMonthInputValue(value: string) {
  const normalized = value.trim().length === 7 ? `${value.trim()}-01` : value.trim();
  const parsed = new Date(`${normalized}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  const nextMonth = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth() + 1, 1));
  return `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function createAllocationFormState(input: {
  allocation: ExpenseAllocationState | null;
  sourceDate: string;
  totalAmount: string;
}) {
  const existingRows = input.allocation?.allocations ?? [];

  return {
    reportingMode: input.allocation?.reportingMode ?? "payment_date",
    allocationStrategy:
      input.allocation?.allocationMethod === "manual_split" ? "manual_split" : "equal_split",
    coverageStartDate: input.allocation?.coverageStartDate ?? input.sourceDate,
    coverageEndDate: input.allocation?.coverageEndDate ?? input.sourceDate,
    allocations:
      existingRows.length > 0
        ? existingRows.map((row) => ({
            reportMonth: toMonthInputValue(row.reportMonth),
            allocatedAmount: row.allocatedAmount,
          }))
        : [
            {
              reportMonth: toMonthInputValue(input.sourceDate),
              allocatedAmount: input.totalAmount,
            },
          ],
  } satisfies AllocationFormState;
}

export function AllocationEditor({
  form,
  setForm,
  totalAmount,
  currency,
  sourceDate,
  direction,
  disabled = false,
  isSaving,
  onSave,
  saveLabel = "Save allocation",
}: AllocationEditorProps) {
  const manualAllocationTotal = form.allocations.reduce(
    (sum, row) => sum + (Number(row.allocatedAmount) || 0),
    0,
  );
  const sourceTotal = Number(totalAmount);
  const manualAllocationMatchesTotal =
    Math.abs(manualAllocationTotal - sourceTotal) < 0.000001;

  return (
    <>
      <label className="field">
        <span>Reporting mode</span>
        <select
          className="input"
          disabled={disabled}
          value={form.reportingMode}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              reportingMode: event.target.value as "payment_date" | "allocated_period",
            }))
          }
        >
          <option value="payment_date">Payment date</option>
          <option value="allocated_period">Adjusted period</option>
        </select>
      </label>

      {form.reportingMode === "allocated_period" ? (
        <>
          <label className="field">
            <span>Allocation strategy</span>
            <select
              className="input"
              disabled={disabled}
              value={form.allocationStrategy}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  allocationStrategy: event.target.value as "equal_split" | "manual_split",
                }))
              }
            >
              <option value="equal_split">Equal split</option>
              <option value="manual_split">Manual split</option>
            </select>
          </label>

          {form.allocationStrategy === "equal_split" ? (
            <div className="inline-form">
              <label className="field">
                <span>Coverage start</span>
                <input
                  className="input"
                  disabled={disabled}
                  type="date"
                  value={form.coverageStartDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      coverageStartDate: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Coverage end</span>
                <input
                  className="input"
                  disabled={disabled}
                  type="date"
                  value={form.coverageEndDate}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      coverageEndDate: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          ) : (
            <div className="stack compact">
              <div className="page-actions">
                <div>
                  <p className="muted-text">
                    Enter the exact month amounts. They must add up to{" "}
                    {formatMoneyDisplay(totalAmount, currency, direction)}.
                  </p>
                </div>
                <button
                  className="link-button"
                  disabled={disabled}
                  type="button"
                  onClick={() =>
                    setForm((current) => {
                      const lastMonth =
                        current.allocations[current.allocations.length - 1]?.reportMonth ??
                        toMonthInputValue(sourceDate);

                      return {
                        ...current,
                        allocations: [
                          ...current.allocations,
                          {
                            reportMonth: addMonthInputValue(lastMonth),
                            allocatedAmount: "0.00",
                          },
                        ],
                      };
                    })
                  }
                >
                  Add month row
                </button>
              </div>

              {form.allocations.map((row, index) => (
                <div className="inline-form" key={`${row.reportMonth}-${index}`}>
                  <label className="field">
                    <span>Month</span>
                    <input
                      className="input"
                      disabled={disabled}
                      type="month"
                      value={row.reportMonth}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          allocations: current.allocations.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  reportMonth: event.target.value,
                                }
                              : candidate,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Amount</span>
                    <input
                      className="input"
                      disabled={disabled}
                      inputMode="decimal"
                      value={row.allocatedAmount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          allocations: current.allocations.map((candidate, candidateIndex) =>
                            candidateIndex === index
                              ? {
                                  ...candidate,
                                  allocatedAmount: event.target.value,
                                }
                              : candidate,
                          ),
                        }))
                      }
                    />
                  </label>
                  <div className="field">
                    <span>&nbsp;</span>
                    <button
                      className="link-button"
                      disabled={disabled || form.allocations.length === 1}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          allocations: current.allocations.filter(
                            (_, candidateIndex) => candidateIndex !== index,
                          ),
                        }))
                      }
                    >
                      Remove row
                    </button>
                  </div>
                </div>
              ))}

              <p className={manualAllocationMatchesTotal ? "helper-text" : "status warning"}>
                Entered total: {formatMoneyDisplay(manualAllocationTotal.toFixed(2), currency, direction)}
              </p>
            </div>
          )}
        </>
      ) : null}

      <div className="action-row">
        <button
          className="button"
          disabled={disabled || isSaving}
          type="button"
          onClick={onSave}
        >
          {isSaving ? "Saving..." : saveLabel}
        </button>
      </div>
    </>
  );
}

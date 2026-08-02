"use client";

import { useId } from "react";

import { CLASSIFICATION_TYPES, type ClassificationType } from "@/features/expenses/constants";
import { formatClassificationTypeLabel } from "@/features/expenses/presentation";

const descriptions: Record<ClassificationType, string> = {
  personal: "Belongs to one household member",
  shared: "Shared cost with a known payer",
  household: "General household spending",
  income: "Money received",
  transfer: "Movement between your accounts",
  ignore: "Exclude from spending reports",
};

type ClassificationTypePickerProps = {
  value: ClassificationType | "";
  onChange: (value: ClassificationType) => void;
  disabled?: boolean;
  legend?: string;
};

export function ClassificationTypePicker({
  value,
  onChange,
  disabled = false,
  legend = "How should this transaction be treated?",
}: ClassificationTypePickerProps) {
  const groupName = useId();
  return (
    <fieldset className="classification-type-fieldset" disabled={disabled}>
      <legend>{legend}</legend>
      <div className="classification-type-grid">
        {CLASSIFICATION_TYPES.map((type, index) => (
          <label
            className={`classification-type-option ${value === type ? "is-selected" : ""}`}
            title={descriptions[type]}
            key={type}
          >
            <input
              type="radio"
              name={groupName}
              value={type}
              checked={value === type}
              aria-describedby={`${groupName}-${type}-description`}
              onChange={() => onChange(type)}
            />
            <span className="classification-type-number" aria-hidden="true">
              {index + 1}
            </span>
            <span>
              <strong>{formatClassificationTypeLabel(type)}</strong>
              <small id={`${groupName}-${type}-description`} className="classification-type-description">
                {descriptions[type]}
              </small>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

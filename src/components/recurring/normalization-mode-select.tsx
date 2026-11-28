import {
  NORMALIZATION_MODE_OPTIONS,
  type NormalizationMode,
} from "@/features/recurring/constants";

type NormalizationModeSelectProps = {
  value: NormalizationMode;
  policy?: import("@/db/schema").ValuationPolicy;
  onChange: (mode: NormalizationMode) => void;
};

export function NormalizationModeSelect({
  value,
  policy,
  onChange,
}: NormalizationModeSelectProps) {
  if (policy === "previous-month-v1") {
    return <p className="helper-text">Each payment uses the previous month’s average exchange rate.</p>;
  }
  const selectedOption = NORMALIZATION_MODE_OPTIONS.find((option) => option.value === value);

  return (
    <label className="field">
      <span>Foreign-currency handling</span>
      <select
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value as NormalizationMode)}
      >
        {NORMALIZATION_MODE_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="helper-text">
        {selectedOption?.description} Foreign-currency conversion currently uses a placeholder
        1:1 rate.
      </span>
    </label>
  );
}

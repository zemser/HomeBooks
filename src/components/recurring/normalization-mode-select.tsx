import {
  NORMALIZATION_MODE_OPTIONS,
  type NormalizationMode,
} from "@/features/recurring/constants";

type NormalizationModeSelectProps = {
  value: NormalizationMode;
  onChange: (mode: NormalizationMode) => void;
};

export function NormalizationModeSelect({
  value,
  onChange,
}: NormalizationModeSelectProps) {
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

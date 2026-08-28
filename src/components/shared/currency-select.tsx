import { getCurrencyOptions } from "@/features/currency/constants";

type CurrencySelectProps = {
  value: string;
  workspaceCurrency: string;
  onChange: (currency: string) => void;
};

export function CurrencySelect({
  value,
  workspaceCurrency,
  onChange,
}: CurrencySelectProps) {
  return (
    <select
      aria-label="Currency"
      className="input"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {getCurrencyOptions(workspaceCurrency, value).map(({ code, name }) => (
        <option key={code} value={code}>
          {code} — {name}
        </option>
      ))}
    </select>
  );
}

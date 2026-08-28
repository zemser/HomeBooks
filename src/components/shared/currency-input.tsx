import { useId } from "react";

import { getSuggestedCurrencyOptions } from "@/features/currency/constants";

type CurrencyInputProps = {
  value: string;
  workspaceCurrency: string;
  onChange: (currency: string) => void;
};

export function CurrencyInput({ value, workspaceCurrency, onChange }: CurrencyInputProps) {
  const suggestionsId = useId();

  return (
    <>
      <input
        aria-label="Currency"
        autoCapitalize="characters"
        className="input"
        list={suggestionsId}
        maxLength={3}
        pattern="[A-Z]{3}"
        title="Enter a three-letter currency code"
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
      />
      <datalist id={suggestionsId}>
        {getSuggestedCurrencyOptions(workspaceCurrency, value).map(({ code, name }) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </datalist>
    </>
  );
}

export const COMMON_CURRENCIES = [
  { code: "ILS", name: "Israeli shekel" },
  { code: "USD", name: "US dollar" },
  { code: "EUR", name: "Euro" },
  { code: "GBP", name: "British pound" },
  { code: "JPY", name: "Japanese yen" },
] as const;

export function getCurrencyOptions(workspaceCurrency: string, selectedCurrency?: string) {
  const normalizedWorkspaceCurrency = workspaceCurrency.trim().toUpperCase();
  const normalizedSelectedCurrency = selectedCurrency?.trim().toUpperCase();
  const hasSelectedCurrency = COMMON_CURRENCIES.some(
    ({ code }) => code === normalizedSelectedCurrency,
  ) || normalizedSelectedCurrency === normalizedWorkspaceCurrency;
  const options = COMMON_CURRENCIES.some(({ code }) => code === normalizedWorkspaceCurrency)
    ? COMMON_CURRENCIES
    : [
        { code: normalizedWorkspaceCurrency, name: "Workspace currency" },
        ...COMMON_CURRENCIES,
      ];

  return hasSelectedCurrency || !normalizedSelectedCurrency
    ? options
    : [{ code: normalizedSelectedCurrency, name: "Existing currency" }, ...options];
}

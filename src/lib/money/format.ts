const MONEY_DISPLAY_LOCALE = "en";

const moneyNumberFormat = new Intl.NumberFormat(MONEY_DISPLAY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
});

const signedMoneyNumberFormat = new Intl.NumberFormat(MONEY_DISPLAY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: true,
  signDisplay: "exceptZero",
});

export function formatMoneyNumber(
  amount: number,
  options?: { signDisplay?: "auto" | "exceptZero" },
) {
  if (options?.signDisplay === "exceptZero") {
    return signedMoneyNumberFormat.format(amount);
  }

  return moneyNumberFormat.format(amount);
}

export function formatMoneyWithCurrency(
  amount: number,
  currency: string,
  options?: { signDisplay?: "auto" | "exceptZero" },
) {
  return `${formatMoneyNumber(amount, options)} ${currency}`;
}

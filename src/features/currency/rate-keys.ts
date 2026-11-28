export const BOI_MONTHLY_SOURCE_PREFIX = "boi-monthly-v1:";
export const BOI_QUOTED_UNIT_EXPONENT: Readonly<Record<string, number>> = {
  AUD: 0,
  CAD: 0,
  CHF: 0,
  DKK: 0,
  EGP: 0,
  EUR: 0,
  GBP: 0,
  JOD: 0,
  JPY: 2,
  LBP: 1,
  NOK: 0,
  SEK: 0,
  USD: 0,
  ZAR: 0,
};

export type FxRateKey = {
  baseCurrency: string;
  quoteCurrency: string;
  yearMonth: string;
};

export function canonicalFxKey(key: FxRateKey): FxRateKey | null {
  const base = key.baseCurrency.trim().toUpperCase();
  const quote = key.quoteCurrency.trim().toUpperCase();
  const currency = quote === "ILS" ? base : base === "ILS" ? quote : null;
  if (
    !currency ||
    !Object.hasOwn(BOI_QUOTED_UNIT_EXPONENT, currency) ||
    !/^\d{4}-(0[1-9]|1[0-2])-01$/.test(key.yearMonth)
  )
    return null;
  return {
    baseCurrency: currency,
    quoteCurrency: "ILS",
    yearMonth: key.yearMonth,
  };
}

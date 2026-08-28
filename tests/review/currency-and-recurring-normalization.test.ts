import assert from "node:assert/strict";
import test from "node:test";

import { getSuggestedCurrencyOptions } from "../../src/features/currency/constants";
import { getEffectiveNormalizationMode } from "../../src/features/recurring/normalization";

test("currency suggestions retain workspace and existing uncommon currencies", () => {
  assert.deepEqual(
    getSuggestedCurrencyOptions("cad", "chf").map(({ code }) => code),
    ["CHF", "CAD", "ILS", "USD", "EUR", "GBP", "JPY"],
  );
});

test("same-currency recurring amounts always use no normalization", () => {
  assert.equal(
    getEffectiveNormalizationMode({
      mode: "monthly_average",
      currency: " ils ",
      workspaceCurrency: "ILS",
    }),
    "none",
  );
});

test("foreign-currency recurring amounts preserve the selected normalization mode", () => {
  assert.equal(
    getEffectiveNormalizationMode({
      mode: "fixed_rate",
      currency: "USD",
      workspaceCurrency: "ILS",
    }),
    "fixed_rate",
  );
});

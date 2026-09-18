import assert from "node:assert/strict";
import test from "node:test";

import { formatMoneyDisplay } from "../../src/features/expenses/presentation";
import { formatReportMoney } from "../../src/features/reporting/presentation";
import { formatMoneyNumber, formatMoneyWithCurrency } from "../../src/lib/money/format";

test("money displays use grouping separators and keep two decimal places", () => {
  assert.equal(formatMoneyDisplay(5423.33, "ILS"), "5,423.33 ILS");
  assert.equal(formatMoneyDisplay("5423.33", "USD"), "5,423.33 USD");
  assert.equal(formatReportMoney(5423.33, "ILS"), "5,423.33 ILS");
});

test("whole currency amounts keep trailing zeros so ledgers stay aligned", () => {
  assert.equal(formatMoneyDisplay(55, "ILS"), "55.00 ILS");
  assert.equal(formatMoneyDisplay(55.5, "ILS"), "55.50 ILS");
  assert.equal(formatReportMoney(0, "ILS"), "0.00 ILS");
});

test("credit direction prefixes a minus without dropping grouping or cents", () => {
  assert.equal(formatMoneyDisplay(5423.33, "ILS", "credit"), "-5,423.33 ILS");
  assert.equal(formatMoneyDisplay(55, "ILS", "credit"), "-55.00 ILS");
});

test("signed money keeps an explicit plus for gains", () => {
  assert.equal(formatMoneyNumber(1234.5, { signDisplay: "exceptZero" }), "+1,234.50");
  assert.equal(formatMoneyWithCurrency(-55, "ILS", { signDisplay: "exceptZero" }), "-55.00 ILS");
});

test("missing money values stay as a dash", () => {
  assert.equal(formatMoneyDisplay(null, "ILS"), "-");
  assert.equal(formatMoneyDisplay(55, null), "-");
});

import assert from "node:assert/strict";
import test from "node:test";

import { getCurrencyNormalizationDisplayState } from "../../src/features/currency/display";
import { inferOriginalCurrency } from "../../src/features/currency/infer-original-currency";
import {
  createMonthlyAverageNormalizer,
  createRateLookupFromMap,
  createSeededRateLookup,
  type CurrencyRateLookup,
} from "../../src/features/currency/monthly-rates";
import {
  isReportableFxNormalizedSpend,
  recomputeImportedFx,
  recomputeImportedFxRows,
} from "../../src/features/currency/recompute-imported-fx";
import { formatMoneyDisplay } from "../../src/features/expenses/presentation";
import { parseBankWorkbookToPreview } from "../../src/features/imports/parse-bank-workbook";
import { inferMaxSectionCurrency } from "../../src/features/imports/templates/max-fx";
import type { WorkbookData } from "../../src/features/imports/types";

const MAX_HEADER = [
  "תאריך\nעסקה",
  "שם בית עסק",
  "סכום\nעסקה",
  "סכום\nחיוב",
  "סוג\nעסקה",
  "ענף",
  "הערות",
];

function maxWorkbook(rows: Array<Array<string | number>>): WorkbookData {
  return {
    fileKind: "xlsx",
    filename: "max.xlsx",
    sheets: [
      {
        name: "Sheet1",
        rows: [["Visa 9556"], [], ["פירוט חיובים"], MAX_HEADER, ...rows],
      },
    ],
  };
}

function previewWithRates(rows: Array<Array<string | number>>, rates: CurrencyRateLookup) {
  return parseBankWorkbookToPreview({
    workbook: maxWorkbook(rows),
    workspaceCurrency: "ILS",
    rates,
    currencyNormalizer: createMonthlyAverageNormalizer("ILS", rates),
  });
}

const seededRates = createSeededRateLookup();

test("ChatGPT ILS-section FX is labeled USD and keeps the ILS charge", () => {
  const { previewTransactions } = previewWithRates(
    [["25-07-2025", "OPENAI *CHATGPT SUBSCR", 20, 67.89, "", "", ""]],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "USD");
  assert.equal(row.settlementCurrency, "ILS");
  assert.equal(row.normalizedAmount, 67.89);
  assert.equal(row.normalizationRateSource, "same-currency");
  const display = getCurrencyNormalizationDisplayState(row);
  assert.equal(display.label, "Foreign settled");
  assert.equal(display.usesPlaceholderRate, false);
});

test("Hateruma USD-section dinner converts with the October monthly average", () => {
  const usdIls = seededRates("USD", "ILS", "2025-10-01");
  assert.ok(usdIls && usdIls !== 1);
  const { previewTransactions } = previewWithRates(
    [
      ["עסקאות שחויבו בדולר", "", "", "", "", "", ""],
      ["06-10-2025", "HATERUMA KOKUSAIDORI", 3736, 25.32, "", "", ""],
    ],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "JPY");
  assert.equal(row.settlementCurrency, "USD");
  assert.equal(row.normalizedAmount, Number((25.32 * usdIls).toFixed(2)));
  assert.notEqual(row.normalizedAmount, 25.32);
  assert.match(row.normalizationRateSource, /^exchange-rate-monthly:/);
  assert.equal(getCurrencyNormalizationDisplayState(row).label, "Converted");
});

test("Uber USD-section trip behaves like Hateruma", () => {
  const usdIls = seededRates("USD", "ILS", "2025-10-01")!;
  const { previewTransactions } = previewWithRates(
    [
      ["עסקאות שחויבו בדולר", "", "", "", "", "", ""],
      ["07-10-2025", "UBER TRIP* TRIP", 1100, 7.39, "", "", ""],
    ],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "JPY");
  assert.equal(row.settlementCurrency, "USD");
  assert.equal(row.normalizedAmount, Number((7.39 * usdIls).toFixed(2)));
});

test("TeamLab and Booking ILS-section JPY stay settled in ILS", () => {
  const { previewTransactions } = previewWithRates(
    [
      ["16-07-2025", "TEAMLAB", 10400, 240.24, "", "", ""],
      ["04-07-2025", "BKG*HOTEL AT BOOKING.C", 19800, 461.34, "", "", ""],
    ],
    seededRates,
  );

  assert.deepEqual(
    previewTransactions.map((row) => [
      row.originalCurrency,
      row.settlementCurrency,
      row.normalizedAmount,
      row.normalizationRateSource,
    ]),
    [
      ["JPY", "ILS", 240.24, "same-currency"],
      ["JPY", "ILS", 461.34, "same-currency"],
    ],
  );
});

test("Cyprus EUR in the ILS section is labeled EUR", () => {
  const { previewTransactions } = previewWithRates(
    [["16-05-2025", "BOLT.EUO2505171518", 11, 44.19, "", "", ""]],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "EUR");
  assert.equal(row.settlementCurrency, "ILS");
  assert.equal(row.normalizedAmount, 44.19);
});

test("2026 EUR ILS charges are not labeled USD", () => {
  const rates = createRateLookupFromMap(
    new Map([
      ["EUR|ILS|2026-08-01", 3.51],
      ["USD|ILS|2026-08-01", 3.02],
    ]),
  );

  assert.equal(
    inferOriginalCurrency({
      originalAmount: 11,
      settlementAmount: 40.15,
      settlementCurrency: "ILS",
      transactionDate: "2026-08-12",
      rates,
    }),
    "EUR",
  );
});

test("Amisragaz VAT spread is same-currency ILS", () => {
  const { previewTransactions } = previewWithRates(
    [["03-07-2025", "AMISRAGAZ", 190.1, 180.59, "", "", ""]],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "ILS");
  assert.equal(row.settlementCurrency, "ILS");
  assert.equal(getCurrencyNormalizationDisplayState(row).label, null);
});

test("equal ILS groceries have no FX badge", () => {
  const { previewTransactions } = previewWithRates(
    [["12-07-2025", "SUPERMARKET", 20.89, 20.89, "", "", ""]],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "ILS");
  assert.equal(row.settlementCurrency, "ILS");
  assert.equal(getCurrencyNormalizationDisplayState(row).label, null);
});

test("installments are not inferred as foreign settled", () => {
  const { previewTransactions } = previewWithRates(
    [["01-07-2025", "IKEA", 1200, 100, "תשלומים 1 מתוך 12", "", ""]],
    seededRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.originalCurrency, "ILS");
  assert.equal(row.settlementCurrency, "ILS");
  assert.equal(getCurrencyNormalizationDisplayState(row).label, null);
});

test("null original with ILS settlement is unlabeled", () => {
  const display = getCurrencyNormalizationDisplayState({
    originalCurrency: null,
    settlementCurrency: "ILS",
    settlementAmount: 67.89,
    workspaceCurrency: "ILS",
    normalizationRateSource: "same-currency",
  });

  assert.equal(display.label, null);
  assert.equal(display.usesPlaceholderRate, false);
});

test("אירו section is EUR settlement with CHF original", () => {
  const { previewTransactions } = previewWithRates(
    [
      ["עסקאות שחויבו באירו", "", "", "", "", "", ""],
      ["17-01-2026", "PRET A MANGER", 11.2, 12.14, "", "", ""],
    ],
    seededRates,
  );
  const row = previewTransactions[0];
  const eurIls = seededRates("EUR", "ILS", "2026-01-01")!;

  assert.equal(row.settlementCurrency, "EUR");
  assert.equal(row.originalCurrency, "CHF");
  assert.equal(row.normalizedAmount, Number((12.14 * eurIls).toFixed(2)));
});

test("יורו section detection still maps to EUR", () => {
  assert.equal(inferMaxSectionCurrency("עסקאות שחויבו ביורו"), "EUR");
  assert.equal(inferMaxSectionCurrency("עסקאות שחויבו באירו"), "EUR");
});

test("missing monthly rates store 0 and are excluded from spend", () => {
  const emptyRates = createRateLookupFromMap(new Map());
  const { previewTransactions } = previewWithRates(
    [
      ["עסקאות שחויבו בדולר", "", "", "", "", "", ""],
      ["06-10-2025", "HATERUMA KOKUSAIDORI", 3736, 25.32, "", "", ""],
    ],
    emptyRates,
  );
  const row = previewTransactions[0];

  assert.equal(row.normalizationRateSource, "missing-monthly-rate");
  assert.equal(row.normalizedAmount, 0);
  assert.equal(getCurrencyNormalizationDisplayState(row).label, "Placeholder FX");
  assert.equal(isReportableFxNormalizedSpend(row), false);
});

test("display copy covers ChatGPT, converted, missing-rate, and null original", () => {
  assert.equal(
    getCurrencyNormalizationDisplayState({
      originalCurrency: "USD",
      settlementCurrency: "ILS",
      settlementAmount: 67.89,
      workspaceCurrency: "ILS",
      normalizationRateSource: "same-currency",
    }).shortDescription,
    "Original USD charge, settled in ILS. Month totals use 67.89 ILS.",
  );
  assert.equal(
    getCurrencyNormalizationDisplayState({
      originalCurrency: "JPY",
      settlementCurrency: "USD",
      settlementAmount: 25.32,
      workspaceCurrency: "ILS",
      normalizationRateSource: "exchange-rate-monthly:seed-boi-monthly-average",
    }).shortDescription,
    "Charged 25.32 USD, shown in ILS at monthly average.",
  );
  assert.equal(
    getCurrencyNormalizationDisplayState({
      originalCurrency: "JPY",
      settlementCurrency: "USD",
      settlementAmount: 25.32,
      workspaceCurrency: "ILS",
      normalizationRateSource: "missing-monthly-rate",
    }).label,
    "Placeholder FX",
  );
  assert.equal(
    getCurrencyNormalizationDisplayState({
      originalCurrency: null,
      settlementCurrency: "ILS",
      workspaceCurrency: "ILS",
      normalizationRateSource: "same-currency",
    }).label,
    null,
  );
});

test("formatMoneyDisplay keeps the amount when currency is missing", () => {
  assert.equal(formatMoneyDisplay(20, null), "20.00");
  assert.equal(formatMoneyDisplay(3736, ""), "3,736.00");
});

test("backfill repairs placeholder USD-section rows", () => {
  const usdIls = seededRates("USD", "ILS", "2025-10-01")!;
  const result = recomputeImportedFxRows(
    [
      {
        originalAmount: 3736,
        originalCurrency: "USD",
        settlementAmount: 25.32,
        settlementCurrency: "USD",
        statementSection: "עסקאות שחויבו בדולר",
        transactionDate: "2025-10-06",
        workspaceCurrency: "ILS",
        normalizedAmount: 25.32,
        normalizationRate: 1,
        normalizationRateSource: "preview-placeholder-rate-1",
      },
    ],
    seededRates,
  );
  const row = result.rows[0];

  assert.equal(result.updatedCount, 1);
  assert.equal(row.originalCurrency, "JPY");
  assert.equal(row.settlementCurrency, "USD");
  assert.equal(row.normalizedAmount, Number((25.32 * usdIls).toFixed(2)));
  assert.match(row.normalizationRateSource ?? "", /^exchange-rate-monthly:/);
  assert.equal(recomputeImportedFxRows(result.rows, seededRates).updatedCount, 0);
});

test("recomputeImportedFx is idempotent once rows already match", () => {
  const next = recomputeImportedFx(
    {
      originalAmount: 20,
      originalCurrency: "USD",
      settlementAmount: 67.89,
      settlementCurrency: "ILS",
      transactionDate: "2025-07-25",
      workspaceCurrency: "ILS",
      normalizedAmount: 67.89,
      normalizationRate: 1,
      normalizationRateSource: "same-currency",
    },
    seededRates,
  );

  assert.equal(next.originalCurrency, "USD");
  assert.equal(next.normalizedAmount, 67.89);
  assert.equal(next.normalizationRateSource, "same-currency");
});

test("household valuation locks the previous calendar month for a foreign charge", () => {
  const rates = createRateLookupFromMap(new Map([
    ["USD|ILS|2026-10-01", 3.088],
    ["USD|ILS|2026-11-01", 9],
    ["USD|ILS|2025-12-01", 4],
  ]));
  const value = createMonthlyAverageNormalizer("ILS", rates, "previous-month-v1");
  const november = value({ amount: 100, fromCurrency: "USD", transactionDate: "2026-11-29" });
  assert.equal(november.normalizedAmount, 308.8);
  assert.equal(november.referenceMonth, "2026-10-01");
  assert.equal(november.valuationState, "converted");
  assert.equal(value({ amount: 100, fromCurrency: "USD", transactionDate: "2026-01-01" }).normalizedAmount, 400);
  assert.equal(value({ amount: 0, fromCurrency: "ILS", transactionDate: "2026-11-01" }).valuationState, "recorded");
  assert.equal(value({ amount: 0, fromCurrency: "EUR", transactionDate: "2026-11-01" }).valuationState, "recorded");
  assert.equal(value({ amount: 7, fromCurrency: "EUR", transactionDate: "2026-11-01" }).valuationState, "pending");
  assert.equal(value({ amount: 62.05, fromCurrency: "ILS", transactionDate: "2026-11-01" }).normalizedAmount, 62.05);
  const inverse = createMonthlyAverageNormalizer("USD", rates, "previous-month-v1");
  assert.equal(inverse({ amount: 308.8, fromCurrency: "ILS", transactionDate: "2026-11-01" }).normalizedAmount, 100);
});

test("FX identity survives Max original-currency inference while preserving explicit Cal currency", async () => {
  const { transactionIdentity } = await import("../../src/features/imports/identity");
  const [row] = previewWithRates([["25-07-2025", "CURSOR", 20, 62.05, "", "", ""]], () => null).parsed.transactions;
  const key = { workspaceId: "household", sourceId: "source", accountLabel: "card", transaction: row };
  const unknown = transactionIdentity(key, "max_credit_statement");
  const known = { ...key, transaction: { ...row, originalCurrency: "USD" } };
  assert.equal(transactionIdentity(known, "max_credit_statement").hash, unknown.hash);
  assert.deepEqual(transactionIdentity(known, "max_credit_statement").aliases, unknown.aliases);
  assert.notEqual(transactionIdentity(key, "cal_card_export").hash, transactionIdentity(known, "cal_card_export").hash);
});

test("unknown Max settlement sections stay pending while the initial ILS section is recorded", () => {
  const workbook = maxWorkbook([["25-11-2026","LOCAL",62.05,62.05],["עסקאות שחויבו במטבע אחר"],["25-11-2026","OTHER",100,100]]);
  const { previewTransactions: [local, other] } = parseBankWorkbookToPreview({ workbook, workspaceCurrency: "ILS", policy: "previous-month-v1" });
  assert.equal(local.valuationState, "recorded");
  assert.equal(other.valuationState, "pending");
  assert.equal(other.settlementCurrency, undefined);
});

test("Cal recent uses both posted columns and selects the workspace amount when available", () => {
  const workbook: WorkbookData = { fileKind: "xlsx", filename: "cal.xlsx", sheets: [{ name: "recent", rows: [
    ["card"], ["תאריך\nעסקה","שם בית עסק",'סכום\nבש"ח',"סכום\nביורו","מועד\nחיוב"],
    ["25-11-2026","BISTRO",82.30,20,"26-11-2026"],
  ]}] };
  const [row] = parseBankWorkbookToPreview({ workbook, workspaceCurrency: "ILS", policy: "previous-month-v1" }).previewTransactions;
  assert.equal(row.normalizedAmount, 82.30);
  assert.equal(row.valuationState, "recorded");
  assert.equal(row.settlementCurrency, "EUR");
  assert.equal(row.settlementAmount, 20);
});

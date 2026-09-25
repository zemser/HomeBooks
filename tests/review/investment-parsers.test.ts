import assert from "node:assert/strict";
import test from "node:test";

import { buildInvestmentHoldingRows } from "@/features/investments/holdings-table";
import { parseInvestmentWorkbookToPreview } from "@/features/investments/parse-investment-workbook";
import type { InvestmentAccountHoldingsSnapshot } from "@/features/investments/types";
import type { WorkbookData } from "@/features/imports/types";

function workbook(name: string, rows: string[][]): WorkbookData {
  return {
    fileKind: "xlsx",
    filename: "sample.xlsx",
    sheets: [{ name, rows }],
  };
}

test("current portfolio export skips summary rows and computes weights", () => {
  const parsed = parseInvestmentWorkbookToPreview({
    workbook: workbook("תיק עדכני", [
      ["תיק עדכני"],
      ["חשבון: 719-617715"],
      ["תאריך נכונות הנתונים: 18/08/2026, בשעה 09:33"],
      ["שווי תיק", "שינוי יומי"],
      ["₪ 100", "0"],
      [
        "שם נייר",
        "מספר נייר",
        "שער אחרון",
        "שינוי יומי %",
        "שינוי יומי במטבע הנייר",
        "כמות בתיק",
        "שווי אחזקה במטבע הנייר",
        "שווי אחזקה (₪)",
        "שער עלות",
        "שינוי מעלות במטבע הנייר",
        "שינוי מעלות %",
        "שינוי מעלות בש”ח",
        "הערה אישית",
      ],
      ["Fund A", "111", "10", "0", "0", "1", "25", "25", "9", "1", "1", "1", "-"],
      ["Fund B", "222", "10", "0", "0", "1", "75", "75", "9", "1", "1", "1", "-"],
    ]),
  });

  assert.equal(parsed.detectedTemplate.id, "current-portfolio");
  assert.equal(parsed.preview.accountLabel, "719-617715");
  assert.equal(parsed.preview.snapshotDate, "2026-08-18");
  assert.equal(parsed.preview.holdings.length, 2);
  assert.equal(parsed.preview.holdings[0]?.portfolioWeightPct, 25);
  assert.equal(parsed.preview.holdings[1]?.portfolioWeightPct, 75);
});

test("bank securities export skips group and subtotal rows", () => {
  const parsed = parseInvestmentWorkbookToPreview({
    workbook: workbook("Portfolio", [
      ["תיק ני\"ע"],
      ["", "סניף: 93", "חשבון: 219431", "תאריך ייצוא: 21/08/2026"],
      [
        "",
        "נייר",
        "מספר נייר",
        "סימבול",
        "ISIN",
        "כמות",
        "שער אחרון",
        "מטבע",
        "שינוי יומי בסכום",
        "שינוי יומי באחוז",
        "שער עלות מותאם",
        "שער עלות נומינלי",
        "שינוי משער עלות מותאם בשח",
        "שינוי משער עלות מותאם באחוז",
        "שינוי משער עלות נומינלי בשח",
        "שינוי משער עלות נומינלי באחוז",
        "שווי אחזקה בשח",
        "שווי אחזקה במטבע",
        "הכנסה לקבל בשח",
        "הכנסה לקבל במטבע",
        "אחוז מהתיק",
        "ריבית צבורה במטבע",
        "ריבית צבורה בש\"ח",
      ],
      ["", "קרנות נאמנות"],
      ["", "אש כספית", "5138763", "", "", "10", "100", "₪", "0", "0", "90", "90", "10", "1", "10", "1", "1000", "1000", "", "", "100", "0", ""],
      ["", ":סה\"כ קרנות נאמנות", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "1000"],
      ["", "ניע זרים"],
    ]),
  });

  assert.equal(parsed.detectedTemplate.id, "bank-securities");
  assert.equal(parsed.preview.accountLabel, "93-219431");
  assert.equal(parsed.preview.snapshotDate, "2026-08-21");
  assert.equal(parsed.preview.holdings.length, 1);
  assert.equal(parsed.preview.holdings[0]?.assetName, "אש כספית");
  assert.equal(parsed.preview.holdings[0]?.securityId, "5138763");
  assert.equal(parsed.preview.holdings[0]?.marketValueIls, 1000);
  assert.equal(parsed.preview.holdings[0]?.portfolioWeightPct, 100);
});

test("holding rows recompute portfolio share for one owner or everyone", () => {
  const accounts = [
    snapshot("a", "member-1", "Lee", "100", 100),
    snapshot("b", "member-2", "Izzy", "200", 300),
  ];

  const combined = buildInvestmentHoldingRows(accounts, null);
  const lee = buildInvestmentHoldingRows(accounts, "member-1");

  assert.equal(combined.length, 2);
  assert.equal(combined[0]?.ownerDisplayName, "Izzy");
  assert.equal(combined[0]?.portfolioSharePct, 75);
  assert.equal(combined[1]?.portfolioSharePct, 25);
  assert.equal(lee.length, 1);
  assert.equal(lee[0]?.portfolioSharePct, 100);
});

function snapshot(
  accountId: string,
  ownerMemberId: string,
  ownerDisplayName: string,
  assetName: string,
  marketValue: number,
): InvestmentAccountHoldingsSnapshot {
  return {
    accountId,
    accountDisplayName: accountId,
    ownerMemberId,
    ownerDisplayName,
    sourceName: "Bank",
    snapshotDate: "2026-08-21",
    importId: accountId,
    importCreatedAt: "2026-08-21T00:00:00.000Z",
    importOriginalFilename: "export.xlsx",
    holdingCount: 1,
    totalMarketValue: marketValue,
    totalCostBasis: null,
    totalGainLoss: null,
    holdings: [
      {
        assetName,
        assetSymbol: "1",
        assetType: "fund",
        assetTypeSource: "estimated",
        quantity: 1,
        marketValue,
        marketValueCurrency: "ILS",
        normalizedMarketValue: marketValue,
        costBasis: null,
        gainLoss: null,
      },
    ],
  };
}

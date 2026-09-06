import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReportExportFilename,
  exportScopeColumnKey,
  exportTableToRows,
  getYearExportData,
  getYearExportTable,
  parseReportExportQuery,
  serializeExportTableCsv,
  serializeReportWorkbook,
} from "../../src/features/reporting/export";
import {
  buildCategoryScopeBreakdown,
  buildMonthCompleteness,
  buildYearReportData,
  type ReportMember,
  type YearAggregationRecord,
  type YearReportSource,
} from "../../src/features/reporting/monthly-report";
import { readWorkbookFromBuffer } from "../../src/lib/excel/read-workbook";
import { readTabularFileFromBuffer } from "../../src/lib/tabular/read-tabular-file";
import { writeCsv } from "../../src/lib/tabular/write-csv";

const lee: ReportMember = { id: "lee", displayName: "Lee", isActive: true };
const izzy: ReportMember = { id: "izzy", displayName: "Izzy", isActive: true };
const sam: ReportMember = { id: "sam", displayName: "Sam", isActive: false };

function completeness(
  month: string,
  importedTransactionCount: number,
  reviewedTransactionCount: number,
  manualEntryCount = 0,
) {
  return buildMonthCompleteness(month, {
    importedTransactionCount,
    reviewedTransactionCount,
    reportableTransactionCount: reviewedTransactionCount,
    excludedTransactionCount: 0,
    manualEntryCount,
  });
}

function record(
  eventDate: string,
  classificationType: YearAggregationRecord["classificationType"],
  normalizedAmount: number,
  extra: Partial<YearAggregationRecord> = {},
): YearAggregationRecord {
  return {
    eventDate,
    classificationType,
    normalizedAmount,
    direction: classificationType === "income" ? "income" : "expense",
    category: extra.category === undefined ? "General" : extra.category,
    categoryId: extra.categoryId === undefined ? "general" : extra.categoryId,
    memberId: extra.memberId ?? null,
  };
}

function source(
  input: Partial<YearReportSource> &
    Pick<YearReportSource, "records" | "members" | "includedMonths" | "completeness">,
): YearReportSource {
  return {
    year: 2026,
    workspaceCurrency: "ILS",
    reportingMode: "payment_date",
    throughMonth: input.includedMonths.at(-1) ?? "2026-04-01",
    ...input,
  };
}

function toArrayBuffer(buffer: Buffer) {
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function twoMemberSource() {
  return source({
    members: [lee, izzy, sam],
    includedMonths: ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01"],
    records: [
      record("2026-01-10", "income", 100, { memberId: "lee" }),
      record("2026-01-11", "personal", 20, { memberId: "lee" }),
      record("2026-01-12", "shared", 10),
      record("2026-02-01", "household", 30),
      record("2026-02-02", "personal", 5, { memberId: "sam" }),
    ],
    completeness: [
      completeness("2026-01-01", 3, 3),
      completeness("2026-02-01", 2, 1),
      completeness("2026-03-01", 2, 2),
      completeness("2026-04-01", 0, 0),
    ],
  });
}

test("one-member year summary emits a single personal column", () => {
  const exportData = getYearExportData(
    source({
      members: [lee],
      includedMonths: ["2026-01-01", "2026-02-01"],
      records: [
        record("2026-01-10", "personal", 12, { memberId: "lee" }),
        record("2026-01-11", "shared", 8),
      ],
      completeness: [completeness("2026-01-01", 2, 2), completeness("2026-02-01", 0, 0)],
    }),
  );
  const personalKeys = exportData.yearSummary.columns
    .map((column) => column.key)
    .filter((key) => key.startsWith("personal_"));

  assert.deepEqual(personalKeys, ["personal_lee"]);
  assert.deepEqual(
    exportData.yearReport.totals.scopes.map(exportScopeColumnKey),
    ["personal_lee", "shared", "household"],
  );
});

test("two-member and three-member column order matches the year report scopes", () => {
  const twoMember = getYearExportData(twoMemberSource());
  assert.deepEqual(
    twoMember.yearSummary.columns.map((column) => column.key).slice(3, -2),
    twoMember.yearReport.totals.scopes.map(exportScopeColumnKey),
  );
  assert.deepEqual(
    twoMember.categoryDetail.columns.map((column) => column.key).slice(2, -2),
    twoMember.yearReport.totals.scopes.map(exportScopeColumnKey),
  );

  const threeMember = getYearExportData(
    source({
      members: [
        lee,
        izzy,
        { id: "sam", displayName: "Sam", isActive: true },
      ],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "personal", 4, { memberId: "lee" }),
        record("2026-01-02", "personal", 5, { memberId: "izzy" }),
        record("2026-01-03", "personal", 6, { memberId: "sam" }),
      ],
      completeness: [completeness("2026-01-01", 3, 3)],
    }),
  );

  assert.deepEqual(
    threeMember.yearSummary.columns.map((column) => column.key).slice(3, -2),
    ["personal_lee", "personal_izzy", "personal_sam", "shared", "household"],
  );
  assert.deepEqual(
    threeMember.yearSummary.columns.map((column) => column.key).slice(3, -2),
    threeMember.yearReport.totals.scopes.map(exportScopeColumnKey),
  );
});

test("inactive historical member columns appear only when the year report includes them", () => {
  const withInactive = getYearExportData(twoMemberSource());
  assert.ok(
    withInactive.yearReport.totals.scopes.some(
      (scope) => scope.memberId === "sam" && scope.scope === "personal",
    ),
  );
  assert.ok(withInactive.yearSummary.columns.some((column) => column.key === "personal_sam"));

  const withoutInactive = getYearExportData(
    source({
      members: [lee, izzy, sam],
      includedMonths: ["2026-01-01"],
      records: [record("2026-01-01", "personal", 9, { memberId: "lee" })],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );
  assert.equal(
    withoutInactive.yearReport.totals.scopes.some(
      (scope) => scope.memberId === "sam" && scope.scope === "personal",
    ),
    false,
  );
  assert.equal(
    withoutInactive.yearSummary.columns.some((column) => column.key === "personal_sam"),
    false,
  );
});

test("personal owner fills personal columns and household or shared payers do not leak", () => {
  const exportData = getYearExportData(
    source({
      members: [lee, izzy],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "household", 20, { memberId: "lee" }),
        record("2026-01-02", "shared", 10, { memberId: "lee" }),
        record("2026-01-03", "personal", 5, { memberId: "izzy" }),
      ],
      completeness: [completeness("2026-01-01", 3, 3)],
    }),
  );
  const [row] = exportData.yearSummary.rows;

  assert.equal(row?.personal_lee, 0);
  assert.equal(row?.personal_izzy, 5);
  assert.equal(row?.shared, 10);
  assert.equal(row?.household, 20);
  assert.equal(row?.total_spent, 35);
});

test("unassigned personal spending emits a personal_unassigned column", () => {
  const exportData = getYearExportData(
    source({
      members: [lee],
      includedMonths: ["2026-01-01"],
      records: [record("2026-01-01", "personal", 7)],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );

  assert.ok(exportData.yearSummary.columns.some((column) => column.key === "personal_unassigned"));
  assert.equal(exportData.yearSummary.columns.find((column) => column.key === "personal_unassigned")?.label, "Personal · Unassigned");
  assert.equal(exportData.yearSummary.rows[0]?.personal_unassigned, 7);
});

test("year summary rows reconcile to spent, savings, and year totals", () => {
  const exportData = getYearExportData(twoMemberSource());
  const { yearReport, yearSummary } = exportData;

  for (const row of yearSummary.rows) {
    const scopeTotal = yearReport.totals.scopes.reduce(
      (total, scope) => total + Number(row[exportScopeColumnKey(scope)]),
      0,
    );
    assert.equal(scopeTotal, row.total_spent);
    assert.equal(Number(row.income) - Number(row.total_spent), row.savings);
  }

  assert.equal(
    yearSummary.rows.reduce((total, row) => total + Number(row.total_spent), 0),
    yearReport.totals.expenseTotal,
  );
  assert.deepEqual(
    yearSummary.rows.map((row) => row.status),
    ["complete", "in_progress", "complete", "empty"],
  );
});

test("category detail cells match buildCategoryScopeBreakdown for each month", () => {
  const input = twoMemberSource();
  const exportData = getYearExportData(input);
  const yearReport = buildYearReportData(input);

  for (const month of yearReport.months) {
    const monthPrefix = month.month.slice(0, 7);
    const breakdown = buildCategoryScopeBreakdown(
      input.records.filter((item) => item.eventDate.slice(0, 7) === monthPrefix),
      yearReport.totals.scopes,
    );
    const exportRows = exportData.categoryDetail.rows.filter((row) => row.month === monthPrefix);
    const summaryRow = exportData.yearSummary.rows.find((row) => row.month === monthPrefix);

    assert.equal(exportRows.length, breakdown.length);
    assert.equal(
      exportRows.reduce((total, row) => total + Number(row.total_spent), 0),
      summaryRow?.total_spent,
    );

    for (const [index, category] of breakdown.entries()) {
      const row = exportRows[index];
      assert.equal(row?.category, category.category);
      assert.equal(row?.total_spent, category.expenseTotal);
      assert.equal(row?.item_count, category.itemCount);

      for (const [scopeIndex, scope] of yearReport.totals.scopes.entries()) {
        assert.equal(row?.[exportScopeColumnKey(scope)], category.amounts[scopeIndex]?.amount);
      }
    }
  }
});

test("empty months stay in the summary and omit category rows", () => {
  const exportData = getYearExportData(twoMemberSource());

  assert.ok(exportData.yearSummary.rows.some((row) => row.month === "2026-04" && row.status === "empty"));
  assert.equal(
    exportData.categoryDetail.rows.some((row) => row.month === "2026-04"),
    false,
  );
  assert.equal(
    exportData.categoryDetail.rows.some((row) => row.month === "2026-03"),
    false,
  );
});

test("Uncategorized is emitted when the category is null", () => {
  const exportData = getYearExportData(
    source({
      members: [lee],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "household", 12, { category: null, categoryId: null }),
      ],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );

  assert.equal(exportData.categoryDetail.rows[0]?.category, "Uncategorized");
  assert.equal(exportData.categoryDetail.rows[0]?.household, 12);
});

test("export filenames include the source reporting mode and currency", () => {
  const paymentDate = getYearExportData(twoMemberSource());
  const allocated = getYearExportData({
    ...twoMemberSource(),
    reportingMode: "allocated_period",
  });

  assert.equal(paymentDate.reportingMode, "payment_date");
  assert.equal(allocated.reportingMode, "allocated_period");
  assert.equal(
    buildReportExportFilename({
      kind: "year_summary",
      year: paymentDate.yearReport.year,
      throughMonth: paymentDate.throughMonth,
      mode: paymentDate.reportingMode,
      workspaceCurrency: paymentDate.yearReport.workspaceCurrency,
    }),
    "homebooks-2026-through-2026-04-payment-date-ILS-year-summary.csv",
  );
  assert.equal(
    buildReportExportFilename({
      kind: "workbook",
      year: allocated.yearReport.year,
      throughMonth: allocated.throughMonth,
      mode: allocated.reportingMode,
      workspaceCurrency: allocated.yearReport.workspaceCurrency,
    }),
    "homebooks-2026-through-2026-04-allocated-period-ILS.xlsx",
  );
});

test("CSV round-trips Hebrew member and category labels with a UTF-8 BOM", () => {
  const exportData = getYearExportData(
    source({
      members: [{ id: "lee", displayName: "לי", isActive: true }],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "personal", 15, {
          memberId: "lee",
          category: "קניות",
          categoryId: "groceries",
        }),
      ],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );
  const csv = serializeExportTableCsv(exportData.yearSummary);
  const categoryCsv = serializeExportTableCsv(exportData.categoryDetail);

  assert.equal(csv[0], 0xef);
  assert.equal(csv[1], 0xbb);
  assert.equal(csv[2], 0xbf);

  const summaryWorkbook = readTabularFileFromBuffer({
    buffer: toArrayBuffer(csv),
    filename: "year-summary.csv",
  });
  const categoryWorkbook = readTabularFileFromBuffer({
    buffer: toArrayBuffer(categoryCsv),
    filename: "category-detail.csv",
  });

  assert.equal(summaryWorkbook.sheets[0]?.rows[1]?.includes("Personal · לי"), true);
  assert.equal(categoryWorkbook.sheets[0]?.rows[2]?.includes("קניות"), true);
});

test("Excel round-trips Hebrew labels and numeric totals", () => {
  const exportData = getYearExportData(
    source({
      members: [{ id: "lee", displayName: "לי", isActive: true }],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "personal", 15.5, {
          memberId: "lee",
          category: "קניות",
          categoryId: "groceries",
        }),
      ],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );
  const buffer = serializeReportWorkbook(exportData.yearSummary, exportData.categoryDetail);
  const workbook = readWorkbookFromBuffer({
    buffer: toArrayBuffer(buffer),
    filename: "year.xlsx",
  });
  const summary = workbook.sheets.find((sheet) => sheet.name === "Year Summary");
  const detail = workbook.sheets.find((sheet) => sheet.name === "Category Detail");

  assert.equal(summary?.rows[1]?.includes("Personal · לי"), true);
  assert.equal(detail?.rows[2]?.includes("קניות"), true);
  assert.equal(summary?.rows[2]?.includes(15.5), true);
  assert.equal(detail?.rows[2]?.includes(15.5), true);
  assert.equal(
    workbook.sheets.some((sheet) => /transaction/i.test(sheet.name)),
    false,
  );
});

test("RFC 4180 quoting preserves commas and quotes in category names", () => {
  const exportData = getYearExportData(
    source({
      members: [lee],
      includedMonths: ["2026-01-01"],
      records: [
        record("2026-01-01", "household", 3, {
          category: 'Groceries, "sale"',
          categoryId: "groceries",
        }),
      ],
      completeness: [completeness("2026-01-01", 1, 1)],
    }),
  );
  const csv = serializeExportTableCsv(exportData.categoryDetail);
  const parsed = readTabularFileFromBuffer({
    buffer: toArrayBuffer(csv),
    filename: "category-detail.csv",
  });

  assert.equal(parsed.sheets[0]?.rows[2]?.includes('Groceries, "sale"'), true);
  assert.match(csv.toString("utf8"), /"Groceries, ""sale"""/);
});

test("CSV quoting covers leading spaces and newlines", () => {
  const csv = writeCsv([["plain", " padded", "say \"hi\"", "line\nbreak"]], { bom: false });
  assert.equal(csv, "plain,\" padded\",\"say \"\"hi\"\"\",\"line\nbreak\"");
});

test("unknown export kind and mode are rejected", () => {
  assert.deepEqual(parseReportExportQuery(new URLSearchParams("kind=transactions")), {
    ok: false,
    error: "Unknown export kind.",
  });
  assert.deepEqual(parseReportExportQuery(new URLSearchParams()), {
    ok: false,
    error: "Unknown export kind.",
  });
  assert.deepEqual(
    parseReportExportQuery(new URLSearchParams("kind=year_summary&mode=cash")),
    {
      ok: false,
      error: "Unknown reporting mode.",
    },
  );
  assert.deepEqual(
    parseReportExportQuery(new URLSearchParams("kind=year_summary&month=2026-04&mode=allocated_period")),
    {
      ok: true,
      kind: "year_summary",
      month: "2026-04",
      mode: "allocated_period",
    },
  );
});

test("export tables do not use in-memory colon scope keys", () => {
  const rows = exportTableToRows(getYearExportData(twoMemberSource()).yearSummary);
  assert.equal(rows[0]?.some((value) => String(value).includes(":")), false);
});


test("CSV neutralizes formula text without changing numeric amounts", () => {
  const formulaText = ["=1+1", "+1+1", "-1+1", "@SUM(A1)", " =1+1", "\t=1+1", "\r=1+1", "\n=1+1"];
  const csv = writeCsv([formulaText, [-12.5, 0, 12.5]]);
  const parsed = readTabularFileFromBuffer({
    buffer: toArrayBuffer(Buffer.from(csv)), filename: "safe.csv",
  }).sheets[0]!.rows;
  assert.deepEqual(parsed[0], formulaText.map((value) => `'${value}`));
  assert.deepEqual(parsed[1], ["-12.5", "0", "12.5"]);

  const input = twoMemberSource();
  input.records[0] = record("2026-01-01", "household", 3, { category: "=1+1" });
  const data = getYearExportData(input);
  const detail = readTabularFileFromBuffer({
    buffer: toArrayBuffer(serializeExportTableCsv(data.categoryDetail)), filename: "detail.csv",
  });
  assert.ok(detail.sheets[0]!.rows.some((row) => row.includes("'=1+1")));
  const workbook = readWorkbookFromBuffer({
    buffer: toArrayBuffer(serializeReportWorkbook(data.yearSummary, data.categoryDetail)),
    filename: "safe.xlsx",
  });
  assert.ok(workbook.sheets[1]!.rows.some((row) => row.includes("=1+1")));
});

test("export query rejects invalid calendar months before loading data", () => {
  for (const month of ["garbage", "2026-00", "2026-13", "2026-02-30", "2026-04-15", "0000-01"]) {
    assert.deepEqual(parseReportExportQuery(new URLSearchParams({kind: "year_summary", month})), {
      ok: false, error: "Month must use YYYY-MM or YYYY-MM-01.",
    });
  }
  for (const month of ["2026-01", "2026-12-01", " 2026-04 ", ""]) {
    assert.equal(parseReportExportQuery(new URLSearchParams({kind: "year_summary", month})).ok, true);
  }
});

test("single-table exports match the workbook tables", () => {
  const input = twoMemberSource();
  const workbook = getYearExportData(input);
  assert.deepEqual(getYearExportTable(input, "year_summary"), workbook.yearSummary);
  assert.deepEqual(getYearExportTable(input, "category_detail"), workbook.categoryDetail);
});

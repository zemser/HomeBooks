import { writeWorkbookToBuffer } from "@/lib/excel/write-workbook";
import { writeCsvBuffer } from "@/lib/tabular/write-csv";
import {
  buildCategoryScopeBreakdown,
  buildYearReportData,
  REPORTING_VIEW_MODES,
  type ReportingViewMode,
  type SpendingScopeSummary,
  type YearReportData,
  type YearReportSource,
} from "@/features/reporting/monthly-report";

export const REPORT_EXPORT_KINDS = ["year_summary", "category_detail", "workbook"] as const;
export type ReportExportKind = (typeof REPORT_EXPORT_KINDS)[number];

export type ExportColumn = {
  key: string;
  label: string;
};

export type ExportTable = {
  name: "Year Summary" | "Category Detail";
  columns: ExportColumn[];
  rows: Array<Record<string, string | number>>;
};

export type YearExportData = {
  yearReport: YearReportData;
  yearSummary: ExportTable;
  categoryDetail: ExportTable;
  reportingMode: ReportingViewMode;
  throughMonth: string;
};

export type ParsedReportExportQuery =
  | {
      ok: true;
      kind: ReportExportKind;
      month?: string;
      mode: ReportingViewMode;
    }
  | {
      ok: false;
      error: string;
    };

function isReportExportKind(value: string | null): value is ReportExportKind {
  return REPORT_EXPORT_KINDS.includes(value as ReportExportKind);
}

function isReportingViewMode(value: string): value is ReportingViewMode {
  return (REPORTING_VIEW_MODES as readonly string[]).includes(value);
}

export function parseReportExportQuery(searchParams: URLSearchParams): ParsedReportExportQuery {
  const kind = searchParams.get("kind");

  if (!isReportExportKind(kind)) {
    return { ok: false, error: "Unknown export kind." };
  }

  const modeParam = searchParams.get("mode");
  let mode: ReportingViewMode = "payment_date";

  if (modeParam !== null && modeParam !== "") {
    if (!isReportingViewMode(modeParam)) {
      return { ok: false, error: "Unknown reporting mode." };
    }

    mode = modeParam;
  }

  const monthParam = searchParams.get("month");
  const month = monthParam?.trim() ? monthParam.trim() : undefined;

  if (month && !/^(?!0000)\d{4}-(0[1-9]|1[0-2])(-01)?$/.test(month)) {
    return { ok: false, error: "Month must use YYYY-MM or YYYY-MM-01." };
  }

  return { ok: true, kind, month, mode };
}

export function exportScopeColumnKey(scope: Pick<SpendingScopeSummary, "scope" | "memberId">) {
  if (scope.scope === "personal") {
    return scope.memberId ? `personal_${scope.memberId}` : "personal_unassigned";
  }

  return scope.scope;
}

export function exportTableToRows(table: ExportTable): Array<Array<string | number>> {
  return [
    table.columns.map((column) => column.key),
    table.columns.map((column) => column.label),
    ...table.rows.map((row) =>
      table.columns.map((column) => {
        const value = row[column.key];
        return value === undefined ? "" : value;
      }),
    ),
  ];
}

export function buildReportExportFilename(input: {
  kind: ReportExportKind;
  year: number;
  throughMonth: string;
  mode: ReportingViewMode;
  workspaceCurrency: string;
}) {
  const through = input.throughMonth.slice(0, 7);
  const modeSlug = input.mode.replaceAll("_", "-");
  const currency = encodeURIComponent(input.workspaceCurrency.toUpperCase());
  const prefix = `homebooks-${input.year}-through-${through}-${modeSlug}-${currency}`;

  switch (input.kind) {
    case "year_summary":
      return `${prefix}-year-summary.csv`;
    case "category_detail":
      return `${prefix}-category-detail.csv`;
    case "workbook":
      return `${prefix}.xlsx`;
  }
}

function exportMonthValue(month: string) {
  return month.slice(0, 7);
}

function recordsForMonth(records: YearReportSource["records"], month: string) {
  const monthPrefix = month.slice(0, 7);
  return records.filter((record) => record.eventDate.slice(0, 7) === monthPrefix);
}

function scopeColumns(scopes: SpendingScopeSummary[]): ExportColumn[] {
  return scopes.map((scope) => ({
    key: exportScopeColumnKey(scope),
    label: scope.label,
  }));
}

function scopeRowValues(scopes: SpendingScopeSummary[]) {
  return Object.fromEntries(
    scopes.map((scope) => [exportScopeColumnKey(scope), scope.expenseTotal]),
  ) as Record<string, number>;
}

function buildYearSummaryTable(yearReport: YearReportData): ExportTable {
  const columns: ExportColumn[] = [
    { key: "month", label: "Month" },
    { key: "status", label: "Status" },
    { key: "income", label: "Income" },
    ...scopeColumns(yearReport.totals.scopes),
    { key: "total_spent", label: "Total spent" },
    { key: "savings", label: "Savings" },
  ];

  return {
    name: "Year Summary",
    columns,
    rows: yearReport.months.map((month) => ({
      month: exportMonthValue(month.month),
      status: month.status,
      income: month.incomeTotal,
      ...scopeRowValues(month.scopes),
      total_spent: month.expenseTotal,
      savings: month.savingsTotal,
    })),
  };
}

function buildCategoryDetailTable(
  source: YearReportSource,
  yearReport: YearReportData,
): ExportTable {
  const columns: ExportColumn[] = [
    { key: "month", label: "Month" },
    { key: "category", label: "Category" },
    ...scopeColumns(yearReport.totals.scopes),
    { key: "total_spent", label: "Total spent" },
    { key: "item_count", label: "Item count" },
  ];
  const rows: ExportTable["rows"] = [];

  for (const month of yearReport.months) {
    const categories = buildCategoryScopeBreakdown(
      recordsForMonth(source.records, month.month),
      yearReport.totals.scopes,
    );

    for (const category of categories) {
      rows.push({
        month: exportMonthValue(month.month),
        category: category.category,
        ...Object.fromEntries(
          category.amounts.map((amount) => [
            exportScopeColumnKey(amount),
            amount.amount,
          ]),
        ),
        total_spent: category.expenseTotal,
        item_count: category.itemCount,
      });
    }
  }

  return {
    name: "Category Detail",
    columns,
    rows,
  };
}

export function getYearExportTable(
  source: YearReportSource,
  kind: Exclude<ReportExportKind, "workbook">,
): ExportTable {
  const yearReport = buildYearReportData(source);
  return kind === "year_summary"
    ? buildYearSummaryTable(yearReport)
    : buildCategoryDetailTable(source, yearReport);
}

export function getYearExportData(source: YearReportSource): YearExportData {
  const yearReport = buildYearReportData(source);

  return {
    yearReport,
    yearSummary: buildYearSummaryTable(yearReport),
    categoryDetail: buildCategoryDetailTable(source, yearReport),
    reportingMode: source.reportingMode,
    throughMonth: source.throughMonth,
  };
}

export function serializeExportTableCsv(table: ExportTable) {
  return writeCsvBuffer(exportTableToRows(table));
}

export function serializeReportWorkbook(yearSummary: ExportTable, categoryDetail: ExportTable) {
  return writeWorkbookToBuffer([
    { name: yearSummary.name, rows: exportTableToRows(yearSummary) },
    { name: categoryDetail.name, rows: exportTableToRows(categoryDetail) },
  ]);
}

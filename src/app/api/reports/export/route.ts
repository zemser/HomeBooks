import { NextResponse } from "next/server";

import {
  buildReportExportFilename,
  getYearExportData,
  parseReportExportQuery,
  serializeExportTableCsv,
  serializeReportWorkbook,
} from "@/features/reporting/export";
import { loadYearReportSource } from "@/features/reporting/monthly-report";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function attachmentHeaders(filename: string, contentType: string) {
  return {
    "Content-Type": contentType,
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  };
}

export async function GET(request: Request) {
  try {
    const parsed = parseReportExportQuery(new URL(request.url).searchParams);

    if (!parsed.ok) {
      return errorResponse({
        error: new Error(parsed.error),
        request,
        route: "/api/reports/export",
        message: parsed.error,
        clientMessage: parsed.error,
        status: 400,
      });
    }

    const source = await withCurrentWorkspaceDb((context, db) =>
      loadYearReportSource(
        context,
        {
          throughMonth: parsed.month,
          mode: parsed.mode,
        },
        db,
      ),
    );
    const exportData = getYearExportData(source);
    const filename = buildReportExportFilename({
      kind: parsed.kind,
      year: exportData.yearReport.year,
      throughMonth: exportData.throughMonth,
      mode: exportData.reportingMode,
    });

    if (parsed.kind === "workbook") {
      return new NextResponse(
        new Uint8Array(
          serializeReportWorkbook(exportData.yearSummary, exportData.categoryDetail),
        ),
        {
          status: 200,
          headers: attachmentHeaders(filename, XLSX_CONTENT_TYPE),
        },
      );
    }

    const table =
      parsed.kind === "year_summary" ? exportData.yearSummary : exportData.categoryDetail;

    return new NextResponse(new Uint8Array(serializeExportTableCsv(table)), {
      status: 200,
      headers: attachmentHeaders(filename, CSV_CONTENT_TYPE),
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/reports/export",
      message: "Failed to export report",
      clientMessage: error instanceof Error ? error.message : "Failed to export report.",
    });
  }
}

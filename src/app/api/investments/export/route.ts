import { NextResponse } from "next/server";

import {
  buildInvestmentExportFilename,
  buildInvestmentHoldingRows,
  buildInvestmentHoldingsWorkbookRows,
} from "@/features/investments/holdings-table";
import { listInvestmentAccountHoldings } from "@/features/investments/persistence";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { writeWorkbookToBuffer } from "@/lib/excel/write-workbook";
import { errorResponse } from "@/lib/logging/server";

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function attachmentHeaders(filename: string) {
  return {
    "Content-Type": XLSX_CONTENT_TYPE,
    "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "no-store",
  };
}

export async function GET(request: Request) {
  try {
    const ownerMemberId = new URL(request.url).searchParams.get("ownerMemberId")?.trim() || null;
    const accounts = await withCurrentWorkspaceDb((context, db) =>
      listInvestmentAccountHoldings(context, db),
    );
    const rows = buildInvestmentHoldingRows(accounts, ownerMemberId);
    const scopeLabel = ownerMemberId
      ? rows[0]?.ownerDisplayName ?? "member"
      : "combined";
    const filename = buildInvestmentExportFilename(scopeLabel);
    const workbook = writeWorkbookToBuffer([
      {
        name: "Holdings",
        rows: buildInvestmentHoldingsWorkbookRows(rows),
      },
    ]);

    return new NextResponse(new Uint8Array(workbook), {
      status: 200,
      headers: attachmentHeaders(filename),
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/investments/export",
      message: "Failed to export investments",
      clientMessage: error instanceof Error ? error.message : "Failed to export investments.",
    });
  }
}

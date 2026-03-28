import { NextResponse } from "next/server";

import {
  InvestmentImportValidationError,
  listInvestmentImports,
  persistInvestmentImport,
} from "@/features/investments/persistence";
import type { WorkbookData } from "@/features/imports/types";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");
  const ownerMemberId = formData.get("ownerMemberId");
  const accountLabel = formData.get("accountLabel");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }

  if (typeof ownerMemberId !== "string" || !ownerMemberId.trim()) {
    return NextResponse.json({ error: "An owner is required." }, { status: 400 });
  }

  if (typeof accountLabel !== "string" || !accountLabel.trim()) {
    return NextResponse.json({ error: "An account label is required." }, { status: 400 });
  }

  try {
    const context = await resolveCurrentWorkspaceContext();
    const arrayBuffer = await file.arrayBuffer();
    let workbook: WorkbookData;

    try {
      workbook = readTabularFileFromBuffer({
        buffer: arrayBuffer,
        filename: file.name,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error instanceof Error ? error.message : "Could not read this workbook.",
        },
        { status: 400 },
      );
    }

    const result = await persistInvestmentImport({
      workbook,
      originalFilename: file.name,
      fileBuffer: Buffer.from(arrayBuffer),
      ownerMemberId: ownerMemberId.trim(),
      accountLabel: accountLabel.trim(),
      context,
    });
    const investmentImports = await listInvestmentImports(context);
    const savedImport = investmentImports.find((item) => item.id === result.importId) ?? null;

    return NextResponse.json(
      {
        ...result,
        import: savedImport,
        imports: investmentImports,
      },
      {
        status: result.status === "duplicate" ? 409 : 201,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Investment save failed.",
      },
      { status: error instanceof InvestmentImportValidationError ? 400 : 500 },
    );
  }
}

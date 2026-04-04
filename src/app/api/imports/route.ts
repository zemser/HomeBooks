import { NextResponse } from "next/server";

import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listSavedImports, persistBankImport } from "@/features/imports/persistence";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const savedImports = await listSavedImports(context, { type: "bank" });

    return NextResponse.json({
      workspaceCurrency: context.baseCurrency,
      savedImports,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load imports.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }

  try {
    const context = await resolveCurrentWorkspaceContext();
    const arrayBuffer = await file.arrayBuffer();
    const workbook = readTabularFileFromBuffer({
      buffer: arrayBuffer,
      filename: file.name,
    });
    const result = await persistBankImport({
      workbook,
      originalFilename: file.name,
      fileBuffer: Buffer.from(arrayBuffer),
      context,
    });
    const savedImports = await listSavedImports(context, { type: "bank" });
    const savedImport = savedImports.find((item) => item.id === result.importId) ?? null;

    return NextResponse.json(
      {
        ...result,
        import: savedImport,
      },
      {
      status: result.status === "duplicate" ? 409 : 201,
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Import save failed.",
      },
      { status: 500 },
    );
  }
}

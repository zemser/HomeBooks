import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { withCurrentWorkspaceDb, resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { listSavedImports, persistBankImport } from "@/features/imports/persistence";
import { errorResponse } from "@/lib/logging/server";
import { readTabularFileFromBuffer } from "@/lib/tabular/read-tabular-file";


export async function GET(request: Request) {
  try {
    const { workspaceCurrency, savedImports } = await withCurrentWorkspaceDb(
      async (context, db) => ({
        workspaceCurrency: context.baseCurrency,
        savedImports: await listSavedImports(context, { type: "bank" }, db),
      }),
    );

    return NextResponse.json({
      workspaceCurrency,
      savedImports,
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/imports",
      message: "Failed to load imports",
      clientMessage: error instanceof Error ? error.message : "Failed to load imports.",
    });
  }
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "A non-empty file is required." }, { status: 400 });
  }

  try {
    const arrayBuffer = await file.arrayBuffer();
    const workbook = readTabularFileFromBuffer({
      buffer: arrayBuffer,
      filename: file.name,
    });
    const context = await resolveCurrentWorkspaceContext();
    const result = await persistBankImport({
      workbook,
      originalFilename: file.name,
      fileBuffer: Buffer.from(arrayBuffer),
      context,
    });
    const savedImports = await withCurrentWorkspaceDb((currentContext, db) =>
      listSavedImports(currentContext, { type: "bank" }, db),
    );
    const savedImport = savedImports.find((item) => item.id === result.importId) ?? null;

    // The import changes data rendered by the app shell, dashboard, transaction
    // workflow, review queue, and ledger. Invalidate all of those server-rendered
    // snapshots before the client navigates to another tab.
    revalidatePath("/");
    revalidatePath("/transactions");
    revalidatePath("/transactions/review");
    revalidatePath("/transactions/all");

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
    return errorResponse({
      error,
      request,
      route: "/api/imports",
      message: "Import save failed",
      clientMessage: "Could not save this import right now. Please try again.",
    });
  }
}

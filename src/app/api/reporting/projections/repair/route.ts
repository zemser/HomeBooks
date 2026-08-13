import { NextResponse } from "next/server";

import { repairExpenseEventProjections } from "@/features/reporting/expense-events";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const result = await withCurrentWorkspaceDb((context, db) =>
      repairExpenseEventProjections(context, db),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/reporting/projections/repair",
      message: "Failed to repair reporting projections",
      clientMessage: "Failed to repair reporting projections.",
    });
  }
}

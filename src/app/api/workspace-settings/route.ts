import { NextResponse } from "next/server";
import { z } from "zod";

import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import {
  getWorkspaceSettingsSnapshot,
  updateWorkspaceBaseCurrency,
} from "@/features/workspaces/settings";
import { errorResponse } from "@/lib/logging/server";


const patchSchema = z.object({
  baseCurrency: z.string().trim().length(3),
});

export async function GET(request: Request) {
  try {
    const settings = await withCurrentWorkspaceDb((context, db) =>
      getWorkspaceSettingsSnapshot(context, db),
    );

    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-settings",
      message: "Failed to load workspace settings",
      clientMessage:
        error instanceof Error ? error.message : "Failed to load workspace settings.",
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid workspace settings payload.",
        },
        { status: 400 },
      );
    }

    const settings = await withCurrentWorkspaceDb((context, db) =>
      updateWorkspaceBaseCurrency(context, db, parsed.data),
    );

    return NextResponse.json(settings);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-settings",
      message: "Failed to update workspace settings",
      clientMessage:
        error instanceof Error ? error.message : "Failed to update workspace settings.",
    });
  }
}

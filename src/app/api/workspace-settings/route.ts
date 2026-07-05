import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import {
  getWorkspaceSettingsSnapshot,
  updateWorkspaceBaseCurrency,
} from "@/features/workspaces/settings";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchSchema = z.object({
  baseCurrency: z.string().trim().length(3),
});

export async function GET(request: Request) {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const settings = await getWorkspaceSettingsSnapshot(context);

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

    const context = await resolveCurrentWorkspaceContext();
    const settings = await updateWorkspaceBaseCurrency(context, parsed.data);

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

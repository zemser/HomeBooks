import { NextResponse } from "next/server";

import { listWorkspaceMembersForSettings } from "@/features/workspaces/members";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export async function GET(request: Request) {
  try {
    const members = await withCurrentWorkspaceDb((context, db) =>
      listWorkspaceMembersForSettings(context, db),
    );

    return NextResponse.json({
      members,
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-members",
      message: "Failed to load workspace members",
      clientMessage:
        error instanceof Error ? error.message : "Failed to load workspace members.",
    });
  }
}

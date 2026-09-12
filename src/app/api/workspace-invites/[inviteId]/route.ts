import { NextResponse } from "next/server";

import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { revokeWorkspaceInvite } from "@/features/workspaces/invites";
import { errorResponse } from "@/lib/logging/server";

type WorkspaceInviteRouteProps = {
  params: Promise<{
    inviteId: string;
  }>;
};

export async function DELETE(request: Request, { params }: WorkspaceInviteRouteProps) {
  try {
    const { inviteId } = await params;
    const invite = await withCurrentWorkspaceDb((context, db) =>
      revokeWorkspaceInvite(context, db, inviteId),
    );

    return NextResponse.json(invite);
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-invites/[inviteId]",
      message: "Failed to revoke workspace invite",
      clientMessage:
        error instanceof Error ? error.message : "Failed to revoke workspace invite.",
    });
  }
}

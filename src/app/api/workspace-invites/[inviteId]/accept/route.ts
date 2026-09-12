import { NextResponse } from "next/server";

import { withDbTransaction } from "@/db";
import {
  AuthContextError,
  requireAal2Context,
} from "@/features/auth/supabase-user";
import { displayNameFromAuth, ensureAppUser } from "@/features/workspaces/app-user";
import { acceptWorkspaceInvite } from "@/features/workspaces/invites";
import { errorResponse } from "@/lib/logging/server";

type WorkspaceInviteAcceptRouteProps = {
  params: Promise<{
    inviteId: string;
  }>;
};

export async function POST(request: Request, { params }: WorkspaceInviteAcceptRouteProps) {
  try {
    const { inviteId } = await params;
    const authUser = await requireAal2Context();
    const invite = await withDbTransaction(authUser.userId, async (tx) => {
      const user = await ensureAppUser(tx, authUser);
      return acceptWorkspaceInvite(
        tx,
        {
          userId: user.id,
          email: user.email,
          displayName: displayNameFromAuth(authUser, user.displayName),
        },
        inviteId,
      );
    });

    return NextResponse.json(invite);
  } catch (error) {
    if (error instanceof AuthContextError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return errorResponse({
      error,
      request,
      route: "/api/workspace-invites/[inviteId]/accept",
      message: "Failed to accept workspace invite",
      clientMessage:
        error instanceof Error ? error.message : "Failed to accept workspace invite.",
    });
  }
}

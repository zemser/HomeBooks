import { NextResponse } from "next/server";

import { withDbTransaction } from "@/db";
import {
  AuthContextError,
  requireAal2Context,
} from "@/features/auth/supabase-user";
import { ensureAppUser } from "@/features/workspaces/app-user";
import { declineWorkspaceInvite } from "@/features/workspaces/invites";
import { errorResponse } from "@/lib/logging/server";

type WorkspaceInviteDeclineRouteProps = {
  params: Promise<{
    inviteId: string;
  }>;
};

export async function POST(request: Request, { params }: WorkspaceInviteDeclineRouteProps) {
  try {
    const { inviteId } = await params;
    const authUser = await requireAal2Context();
    const invite = await withDbTransaction(authUser.userId, async (tx) => {
      const user = await ensureAppUser(tx, authUser);
      return declineWorkspaceInvite(tx, user.email, inviteId);
    });

    return NextResponse.json(invite);
  } catch (error) {
    if (error instanceof AuthContextError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    return errorResponse({
      error,
      request,
      route: "/api/workspace-invites/[inviteId]/decline",
      message: "Failed to decline workspace invite",
      clientMessage:
        error instanceof Error ? error.message : "Failed to decline workspace invite.",
    });
  }
}

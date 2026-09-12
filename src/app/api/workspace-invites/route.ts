import { NextResponse } from "next/server";
import { z } from "zod";

import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import {
  createWorkspaceInvite,
  listWorkspaceInvites,
} from "@/features/workspaces/invites";
import { errorResponse } from "@/lib/logging/server";

const createSchema = z.object({
  email: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const invites = await withCurrentWorkspaceDb((context, db) =>
      listWorkspaceInvites(context, db),
    );

    return NextResponse.json({
      invites,
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-invites",
      message: "Failed to load workspace invites",
      clientMessage:
        error instanceof Error ? error.message : "Failed to load workspace invites.",
    });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid workspace invite payload.",
        },
        { status: 400 },
      );
    }

    const invite = await withCurrentWorkspaceDb((context, db) =>
      createWorkspaceInvite(context, db, parsed.data),
    );

    return NextResponse.json(invite, { status: 201 });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-invites",
      message: "Failed to create workspace invite",
      clientMessage:
        error instanceof Error ? error.message : "Failed to create workspace invite.",
    });
  }
}

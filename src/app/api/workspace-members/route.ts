import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createWorkspaceMember,
  listWorkspaceMembersForSettings,
} from "@/features/workspaces/members";
import { withCurrentWorkspaceDb } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";


const createSchema = z.object({
  displayName: z.string().trim().min(1),
});

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

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid workspace member payload.",
        },
        { status: 400 },
      );
    }

    const member = await withCurrentWorkspaceDb((context, db) =>
      createWorkspaceMember(context, db, parsed.data),
    );

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-members",
      message: "Failed to create workspace member",
      clientMessage:
        error instanceof Error ? error.message : "Failed to create workspace member.",
    });
  }
}

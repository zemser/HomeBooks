import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createWorkspaceMember,
  listWorkspaceMembersForSettings,
} from "@/features/workspaces/members";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";

export const runtime = "nodejs";

const createSchema = z.object({
  displayName: z.string().trim().min(1),
});

export async function GET() {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const members = await listWorkspaceMembersForSettings(context);

    return NextResponse.json({
      members,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load workspace members.",
      },
      { status: 500 },
    );
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

    const context = await resolveCurrentWorkspaceContext();
    const member = await createWorkspaceMember(context, parsed.data);

    return NextResponse.json(member, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create workspace member.",
      },
      { status: 500 },
    );
  }
}

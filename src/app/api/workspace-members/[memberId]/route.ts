import { NextResponse } from "next/server";
import { z } from "zod";

import { updateWorkspaceMember } from "@/features/workspaces/members";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { WORKSPACE_MEMBER_ROLES } from "@/features/workspaces/types";

export const runtime = "nodejs";

const patchSchema = z
  .object({
    displayName: z.string().trim().min(1).optional(),
    isActive: z.boolean().optional(),
    role: z.enum(WORKSPACE_MEMBER_ROLES).optional(),
  })
  .refine(
    (value) => value.displayName !== undefined || value.isActive !== undefined || value.role !== undefined,
    {
      message: "At least one member field must be updated.",
    },
  );

type WorkspaceMemberRouteProps = {
  params: Promise<{
    memberId: string;
  }>;
};

export async function PATCH(request: Request, { params }: WorkspaceMemberRouteProps) {
  try {
    const { memberId } = await params;
    const body = await request.json();
    const parsed = patchSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.issues[0]?.message ?? "Invalid workspace member payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const member = await updateWorkspaceMember(context, memberId, parsed.data);

    return NextResponse.json(member);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update workspace member.",
      },
      { status: 500 },
    );
  }
}

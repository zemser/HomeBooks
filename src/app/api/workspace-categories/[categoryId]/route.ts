import { NextResponse } from "next/server";
import { z } from "zod";

import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { updateWorkspaceCategory } from "@/features/workspaces/categories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const updateSchema = z.object({
  name: z.string().trim().min(1),
});

type RouteProps = {
  params: Promise<{
    categoryId: string;
  }>;
};

export async function PATCH(request: Request, { params }: RouteProps) {
  try {
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: parsed.error.issues[0]?.message ?? "Invalid workspace category payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const { categoryId } = await params;
    const category = await updateWorkspaceCategory(context, categoryId, parsed.data);

    return NextResponse.json(category);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update workspace category.",
      },
      { status: 500 },
    );
  }
}

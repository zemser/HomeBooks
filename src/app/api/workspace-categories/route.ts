import { NextResponse } from "next/server";
import { z } from "zod";

import {
  createWorkspaceCategory,
  listWorkspaceCategories,
} from "@/features/workspaces/categories";
import { resolveCurrentWorkspaceContext } from "@/features/workspaces/current-context";
import { errorResponse } from "@/lib/logging/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1),
});

export async function GET(request: Request) {
  try {
    const context = await resolveCurrentWorkspaceContext();
    const categories = await listWorkspaceCategories(context);

    return NextResponse.json({
      categories,
    });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-categories",
      message: "Failed to load workspace categories",
      clientMessage:
        error instanceof Error ? error.message : "Failed to load workspace categories.",
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
          error: parsed.error.issues[0]?.message ?? "Invalid workspace category payload.",
        },
        { status: 400 },
      );
    }

    const context = await resolveCurrentWorkspaceContext();
    const category = await createWorkspaceCategory(context, parsed.data);

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse({
      error,
      request,
      route: "/api/workspace-categories",
      message: "Failed to create workspace category",
      clientMessage:
        error instanceof Error ? error.message : "Failed to create workspace category.",
    });
  }
}

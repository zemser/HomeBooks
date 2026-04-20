import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import { workspaceCategories } from "@/db/schema";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type { WorkspaceCategoryItem } from "@/features/workspaces/types";

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

function normalizeCategoryKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function normalizeOptionalWorkspaceCategoryName(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeWorkspaceCategoryName(value?: string | null) {
  const normalized = normalizeOptionalWorkspaceCategoryName(value);

  if (!normalized) {
    throw new Error("Category name is required.");
  }

  return normalized;
}

export async function listWorkspaceCategories(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
): Promise<WorkspaceCategoryItem[]> {
  const rows = await db
    .select({
      id: workspaceCategories.id,
      name: workspaceCategories.name,
    })
    .from(workspaceCategories)
    .where(eq(workspaceCategories.workspaceId, context.workspaceId))
    .orderBy(asc(workspaceCategories.name), asc(workspaceCategories.createdAt));

  return rows;
}

export async function listWorkspaceCategoryNames(
  context: CurrentWorkspaceContext,
  db: DbExecutor = getDb(),
) {
  const categories = await listWorkspaceCategories(context, db);
  return categories.map((category) => category.name);
}

export async function assertWorkspaceCategory(
  context: CurrentWorkspaceContext,
  categoryName: string | null,
  db: DbExecutor = getDb(),
) {
  if (!categoryName) {
    return null;
  }

  const canonicalName = normalizeCategoryKey(categoryName);
  const category = await db
    .select({
      id: workspaceCategories.id,
      name: workspaceCategories.name,
    })
    .from(workspaceCategories)
    .where(
      and(
        eq(workspaceCategories.workspaceId, context.workspaceId),
        eq(workspaceCategories.canonicalName, canonicalName),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (!category) {
    throw new Error("Choose an existing category or add it in settings first.");
  }

  return category.name;
}

export async function createWorkspaceCategory(
  context: CurrentWorkspaceContext,
  input: { name: string },
) {
  const db = getDb();
  const name = normalizeWorkspaceCategoryName(input.name);
  const canonicalName = normalizeCategoryKey(name);
  const now = new Date();

  const [createdCategory] = await db
    .insert(workspaceCategories)
    .values({
      workspaceId: context.workspaceId,
      name,
      canonicalName,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({
      target: [workspaceCategories.workspaceId, workspaceCategories.canonicalName],
    })
    .returning({
      id: workspaceCategories.id,
      name: workspaceCategories.name,
    });

  if (createdCategory) {
    return createdCategory;
  }

  const existingCategory = await db
    .select({
      id: workspaceCategories.id,
      name: workspaceCategories.name,
    })
    .from(workspaceCategories)
    .where(
      and(
        eq(workspaceCategories.workspaceId, context.workspaceId),
        eq(workspaceCategories.canonicalName, canonicalName),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (!existingCategory) {
    throw new Error("Could not save the workspace category.");
  }

  return existingCategory;
}

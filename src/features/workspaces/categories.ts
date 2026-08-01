import { and, asc, eq, inArray, ne, or, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classificationRules,
  manualEntries,
  manualRecurringExpenses,
  transactionClassifications,
  transactions,
  workspaceCategories,
} from "@/db/schema";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import { syncManualEntryExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type { WorkspaceCategoryItem } from "@/features/workspaces/types";

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

export class WorkspaceCategoryInputError extends Error {
  name = "WorkspaceCategoryInputError";
}

export const STARTER_WORKSPACE_CATEGORIES = [
  ["Groceries", "expense"],
  ["Dining", "expense"],
  ["Housing", "expense"],
  ["Utilities", "expense"],
  ["Transport", "expense"],
  ["Healthcare", "expense"],
  ["Insurance", "expense"],
  ["Shopping", "expense"],
  ["Entertainment", "expense"],
  ["Travel", "expense"],
  ["Education", "expense"],
  ["Gifts", "expense"],
  ["Fees", "expense"],
  ["Income", "income"],
  ["Uncategorized", "both"],
  ["Other", "both"],
] as const;

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

export async function seedStarterWorkspaceCategories(
  workspaceId: string,
  db: DbExecutor = getDb(),
) {
  const now = new Date();

  await db
    .insert(workspaceCategories)
    .values(
      STARTER_WORKSPACE_CATEGORIES.map(([name, applicability], index) => ({
        workspaceId,
        name,
        canonicalName: normalizeCategoryKey(name),
        applicability,
        sortOrder: (index + 1) * 10,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .onConflictDoNothing({
      target: [workspaceCategories.workspaceId, workspaceCategories.canonicalName],
    });
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
    .where(
      and(
        eq(workspaceCategories.workspaceId, context.workspaceId),
        eq(workspaceCategories.active, true),
      ),
    )
    .orderBy(
      asc(workspaceCategories.sortOrder),
      asc(workspaceCategories.name),
      asc(workspaceCategories.createdAt),
    );

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
    throw new WorkspaceCategoryInputError("Choose an existing category or add it in settings first.");
  }

  return category.name;
}

export async function resolveWorkspaceCategory(
  context: CurrentWorkspaceContext,
  input: { categoryId?: string | null; categoryName?: string | null },
  db: DbExecutor = getDb(),
): Promise<WorkspaceCategoryItem | null> {
  const categoryId = input.categoryId?.trim() || null;
  const categoryName = normalizeOptionalWorkspaceCategoryName(input.categoryName);
  if (!categoryId && !categoryName) return null;

  const canonicalName = categoryName ? normalizeCategoryKey(categoryName) : null;
  const category = await db
    .select({ id: workspaceCategories.id, name: workspaceCategories.name })
    .from(workspaceCategories)
    .where(
      and(
        eq(workspaceCategories.workspaceId, context.workspaceId),
        categoryId
          ? eq(workspaceCategories.id, categoryId)
          : eq(workspaceCategories.canonicalName, canonicalName!),
      ),
    )
    .then((rows) => rows[0] ?? null);

  if (!category) {
    throw new WorkspaceCategoryInputError("Choose an existing category or add it in settings first.");
  }
  if (canonicalName && normalizeCategoryKey(category.name) !== canonicalName) {
    throw new WorkspaceCategoryInputError(
      "The selected category no longer matches its catalog entry. Refresh and try again.",
    );
  }
  return category;
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

export async function updateWorkspaceCategory(
  context: CurrentWorkspaceContext,
  categoryId: string,
  input: { name: string },
) {
  const db = getDb();
  const name = normalizeWorkspaceCategoryName(input.name);
  const canonicalName = normalizeCategoryKey(name);
  const now = new Date();

  return db.transaction(async (tx) => {
    const existingCategory = await tx
      .select({
        id: workspaceCategories.id,
        name: workspaceCategories.name,
        canonicalName: workspaceCategories.canonicalName,
      })
      .from(workspaceCategories)
      .where(
        and(
          eq(workspaceCategories.id, categoryId),
          eq(workspaceCategories.workspaceId, context.workspaceId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!existingCategory) {
      throw new Error("Workspace category was not found.");
    }

    const duplicateCategory = await tx
      .select({
        id: workspaceCategories.id,
      })
      .from(workspaceCategories)
      .where(
        and(
          eq(workspaceCategories.workspaceId, context.workspaceId),
          eq(workspaceCategories.canonicalName, canonicalName),
          ne(workspaceCategories.id, categoryId),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (duplicateCategory) {
      throw new Error("A category with that name already exists.");
    }

    const oldCanonicalName = existingCategory.canonicalName;
    const categoryMatchesExisting = canonicalName === oldCanonicalName && name === existingCategory.name;

    if (!categoryMatchesExisting) {
      const transactionRows = await tx
        .select({
          id: transactions.id,
        })
        .from(transactions)
        .innerJoin(
          transactionClassifications,
          eq(transactionClassifications.transactionId, transactions.id),
        )
        .where(
          and(
            eq(transactions.workspaceId, context.workspaceId),
            or(
              eq(transactionClassifications.categoryId, categoryId),
              sql`lower(btrim(${transactionClassifications.category})) = ${oldCanonicalName}`,
            ),
          ),
        );
      const recurringRows = await tx
        .select({
          id: manualRecurringExpenses.id,
        })
        .from(manualRecurringExpenses)
        .where(
          and(
            eq(manualRecurringExpenses.workspaceId, context.workspaceId),
            or(
              eq(manualRecurringExpenses.categoryId, categoryId),
              sql`lower(btrim(${manualRecurringExpenses.category})) = ${oldCanonicalName}`,
            ),
          ),
        );
      const directManualEntryRows = await tx
        .select({
          id: manualEntries.id,
        })
        .from(manualEntries)
        .where(
          and(
            eq(manualEntries.workspaceId, context.workspaceId),
            or(
              eq(manualEntries.categoryId, categoryId),
              sql`lower(btrim(${manualEntries.category})) = ${oldCanonicalName}`,
            ),
          ),
        );

      const recurringEntryIds = recurringRows.map((row) => row.id);
      const generatedManualEntryRows =
        recurringEntryIds.length > 0
          ? await tx
              .select({
                id: manualEntries.id,
              })
              .from(manualEntries)
              .where(
                and(
                  eq(manualEntries.workspaceId, context.workspaceId),
                  eq(manualEntries.sourceType, "recurring_generated"),
                  inArray(manualEntries.sourceId, recurringEntryIds),
                ),
              )
          : [];

      const transactionIds = transactionRows.map((row) => row.id);
      const manualEntryIds = Array.from(
        new Set([
          ...directManualEntryRows.map((row) => row.id),
          ...generatedManualEntryRows.map((row) => row.id),
        ]),
      );

      if (transactionIds.length > 0) {
        await tx
          .update(transactionClassifications)
          .set({
            category: name,
            categoryId,
            updatedAt: now,
          })
          .where(inArray(transactionClassifications.transactionId, transactionIds));
      }

      if (manualEntryIds.length > 0) {
        await tx
          .update(manualEntries)
          .set({
            category: name,
            categoryId,
            updatedAt: now,
          })
          .where(inArray(manualEntries.id, manualEntryIds));
      }

      if (recurringEntryIds.length > 0) {
        await tx
          .update(manualRecurringExpenses)
          .set({
            category: name,
            categoryId,
            updatedAt: now,
          })
          .where(inArray(manualRecurringExpenses.id, recurringEntryIds));
      }

      await tx
        .update(classificationRules)
        .set({
          defaultCategory: name,
          defaultCategoryId: categoryId,
          updatedAt: now,
        })
        .where(
          and(
            eq(classificationRules.workspaceId, context.workspaceId),
            or(
              eq(classificationRules.defaultCategoryId, categoryId),
              sql`lower(btrim(${classificationRules.defaultCategory})) = ${oldCanonicalName}`,
            ),
          ),
        );

      if (transactionIds.length > 0) {
        await syncTransactionExpenseEvents(context, transactionIds, tx);
      }

      if (manualEntryIds.length > 0) {
        await syncManualEntryExpenseEvents(context, manualEntryIds, tx);
      }
    }

    const [updatedCategory] = await tx
      .update(workspaceCategories)
      .set({
        name,
        canonicalName,
        updatedAt: now,
      })
      .where(eq(workspaceCategories.id, categoryId))
      .returning({
        id: workspaceCategories.id,
        name: workspaceCategories.name,
      });

    return updatedCategory;
  });
}

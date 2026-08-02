import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classificationDecisionBatches,
  classificationRules,
  transactionClassifications,
  transactions,
  workspaceMembers,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import { normalizeMerchantRuleValue } from "@/features/expenses/suggestions";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import {
  normalizeOptionalWorkspaceCategoryName,
  resolveWorkspaceCategory,
  WorkspaceCategoryInputError,
} from "@/features/workspaces/categories";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

type SingleClassificationInput = {
  transactionId: string;
  classificationType: ClassificationType;
  category?: string | null;
  categoryId?: string | null;
  memberOwnerId?: string | null;
  createRule?: boolean;
  additionalTransactionIds?: string[];
};

type BulkClassificationInput = {
  transactionIds: string[];
  classificationType: ClassificationType;
  category?: string | null;
  categoryId?: string | null;
  memberOwnerId?: string | null;
};

export class ClassificationInputError extends Error {
  name = "ClassificationInputError";
}

export function isClassificationInputError(error: unknown) {
  return error instanceof ClassificationInputError || error instanceof WorkspaceCategoryInputError;
}

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

async function assertWorkspaceMember(
  workspaceId: string,
  memberOwnerId: string | null,
) {
  if (!memberOwnerId) {
    return;
  }

  const db = getDb();
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.id, memberOwnerId),
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.isActive, true),
    ),
  });

  if (!member) {
    throw new ClassificationInputError("Selected member does not belong to the current workspace.");
  }
}

export function validateClassificationInput(input: {
  classificationType: ClassificationType;
  memberOwnerId: string | null;
  category: string | null;
  categoryId?: string | null;
}) {
  if (input.classificationType === "personal" && !input.memberOwnerId) {
    throw new ClassificationInputError("Personal classifications require a member owner.");
  }
  if (!["personal", "shared"].includes(input.classificationType) && input.memberOwnerId) {
    throw new ClassificationInputError(
      "Only Personal and Shared classifications can have a member owner.",
    );
  }
  if (["transfer", "ignore"].includes(input.classificationType) && (input.category || input.categoryId)) {
    throw new ClassificationInputError(
      "Transfer and Ignore classifications cannot have a category.",
    );
  }
}

export async function upsertTransactionClassification(
  context: CurrentWorkspaceContext,
  input: SingleClassificationInput,
) {
  const db = getDb();
  const memberOwnerId = normalizeOptionalText(input.memberOwnerId);
  const category = normalizeOptionalWorkspaceCategoryName(input.category);

  validateClassificationInput({
    classificationType: input.classificationType,
    memberOwnerId,
    category,
    categoryId: input.categoryId,
  });
  await assertWorkspaceMember(context.workspaceId, memberOwnerId);
  const savedCategory = await resolveWorkspaceCategory(
    context,
    { categoryId: input.categoryId, categoryName: category },
    db,
  );

  const requestedTransactionIds = Array.from(new Set([
    input.transactionId,
    ...(input.additionalTransactionIds ?? []),
  ]));
  const matchingTransactions = await db
    .select({ id: transactions.id, merchantRaw: transactions.merchantRaw })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        inArray(transactions.id, requestedTransactionIds),
      ),
    );
  const transaction = matchingTransactions.find((item) => item.id === input.transactionId);

  if (!transaction) {
    throw new Error("Transaction was not found in the current workspace.");
  }
  if (matchingTransactions.length !== requestedTransactionIds.length) {
    throw new Error("One or more matching transactions were not found.");
  }

  const now = new Date();
  const merchantValue = normalizeOptionalText(transaction.merchantRaw);
  const normalizedMerchantValue = merchantValue
    ? normalizeMerchantRuleValue(merchantValue)
    : null;
  if (
    requestedTransactionIds.length > 1 &&
    (!normalizedMerchantValue || matchingTransactions.some(
      (item) => !item.merchantRaw || normalizeMerchantRuleValue(item.merchantRaw) !== normalizedMerchantValue,
    ))
  ) {
    throw new ClassificationInputError(
      "Additional transactions must have the same merchant as the selected transaction.",
    );
  }
  const ruleMatchValue = input.createRule && merchantValue
    ? normalizedMerchantValue
    : null;

  const undoBatchId = await db.transaction(async (tx) => {
    const previousRows = await tx
      .select()
      .from(transactionClassifications)
      .where(inArray(transactionClassifications.transactionId, requestedTransactionIds));
    const previousByTransactionId = new Map(
      previousRows.map((classification) => [classification.transactionId, classification]),
    );
    const previousRules = ruleMatchValue
      ? await tx
          .select()
          .from(classificationRules)
          .where(
            and(
              eq(classificationRules.workspaceId, context.workspaceId),
              eq(classificationRules.matchType, "exact"),
              eq(classificationRules.matchValue, ruleMatchValue),
            ),
          )
      : null;
    const [decisionBatch] = await tx
      .insert(classificationDecisionBatches)
      .values({
        workspaceId: context.workspaceId,
        userId: context.userId,
        actionType: "single_classification",
        transactionIds: requestedTransactionIds,
        previousClassifications: requestedTransactionIds.map((transactionId) => {
          const previousClassification = previousByTransactionId.get(transactionId);
          return {
            transactionId,
            classification: previousClassification
              ? {
                  ...previousClassification,
                  confidence: previousClassification.confidence ?? null,
                  reviewedAt: previousClassification.reviewedAt?.toISOString() ?? null,
                  createdAt: previousClassification.createdAt.toISOString(),
                  updatedAt: previousClassification.updatedAt.toISOString(),
                }
              : null,
          };
        }),
        previousRules: previousRules?.map((rule) => ({
          ...rule,
          createdAt: rule.createdAt.toISOString(),
          updatedAt: rule.updatedAt.toISOString(),
        })) ?? null,
        ruleMatchValue,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: classificationDecisionBatches.id });

    await tx
      .insert(transactionClassifications)
      .values(requestedTransactionIds.map((transactionId) => ({
        transactionId,
        classificationType: input.classificationType,
        memberOwnerId,
        category: savedCategory?.name ?? null,
        categoryId: savedCategory?.id ?? null,
        confidence: null,
        decidedBy: "user" as const,
        reviewedAt: now,
        decisionBatchId: decisionBatch.id,
      })))
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: input.classificationType,
          memberOwnerId,
          category: savedCategory?.name ?? null,
          categoryId: savedCategory?.id ?? null,
          confidence: null,
          decidedBy: "user",
          reviewedAt: now,
          decisionBatchId: decisionBatch.id,
          updatedAt: now,
        },
      });

    if (input.createRule && !merchantValue) {
      throw new ClassificationInputError(
        "This transaction does not have a merchant value to turn into a rule.",
      );
    }

    if (ruleMatchValue) {
      const existingRules = await tx
      .select({
        id: classificationRules.id,
      })
      .from(classificationRules)
      .where(
        and(
          eq(classificationRules.workspaceId, context.workspaceId),
          eq(classificationRules.matchType, "exact"),
          eq(classificationRules.matchValue, ruleMatchValue),
        ),
      )
      .orderBy(asc(classificationRules.createdAt));

      if (existingRules.length === 0) {
        await tx.insert(classificationRules).values({
          workspaceId: context.workspaceId,
          matchType: "exact",
          matchValue: ruleMatchValue,
          defaultClassificationType: input.classificationType,
          defaultMemberOwnerId: memberOwnerId,
          defaultCategory: savedCategory?.name ?? null,
          defaultCategoryId: savedCategory?.id ?? null,
          priority: 100,
          active: true,
        });
      } else {
        const [primaryRule, ...duplicateRules] = existingRules;

        await tx
          .update(classificationRules)
          .set({
            defaultClassificationType: input.classificationType,
            defaultMemberOwnerId: memberOwnerId,
            defaultCategory: savedCategory?.name ?? null,
            defaultCategoryId: savedCategory?.id ?? null,
            priority: 100,
            active: true,
            updatedAt: now,
          })
          .where(eq(classificationRules.id, primaryRule.id));

        if (duplicateRules.length > 0) {
          await tx
            .update(classificationRules)
            .set({
              active: false,
              updatedAt: now,
            })
            .where(
              inArray(
                classificationRules.id,
                duplicateRules.map((rule) => rule.id),
              ),
            );
        }
      }
    }

    await syncTransactionExpenseEvents(context, requestedTransactionIds, tx);
    return decisionBatch.id;
  });

  return {
    transactionId: transaction.id,
    updatedCount: requestedTransactionIds.length,
    createdRule: Boolean(input.createRule),
    undoBatchId,
  };
}

export async function bulkClassifyTransactions(
  context: CurrentWorkspaceContext,
  input: BulkClassificationInput,
) {
  const db = getDb();
  const transactionIds = Array.from(new Set(input.transactionIds));
  const memberOwnerId = normalizeOptionalText(input.memberOwnerId);
  const category = normalizeOptionalWorkspaceCategoryName(input.category);

  if (transactionIds.length === 0) {
    throw new ClassificationInputError("Select at least one transaction to classify.");
  }

  validateClassificationInput({
    classificationType: input.classificationType,
    memberOwnerId,
    category,
    categoryId: input.categoryId,
  });
  await assertWorkspaceMember(context.workspaceId, memberOwnerId);
  const savedCategory = await resolveWorkspaceCategory(
    context,
    { categoryId: input.categoryId, categoryName: category },
    db,
  );

  const matchingTransactions = await db
    .select({
      id: transactions.id,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        inArray(transactions.id, transactionIds),
      ),
    );

  if (matchingTransactions.length !== transactionIds.length) {
    throw new Error("One or more selected transactions were not found.");
  }

  const now = new Date();

  const undoBatchId = await db.transaction(async (tx) => {
    const previousRows = await tx
      .select()
      .from(transactionClassifications)
      .where(inArray(transactionClassifications.transactionId, transactionIds));
    const previousByTransactionId = new Map(
      previousRows.map((classification) => [classification.transactionId, classification]),
    );
    const [decisionBatch] = await tx
      .insert(classificationDecisionBatches)
      .values({
        workspaceId: context.workspaceId,
        userId: context.userId,
        actionType: "bulk_classification",
        transactionIds,
        previousClassifications: transactionIds.map((transactionId) => {
          const previous = previousByTransactionId.get(transactionId);
          return {
            transactionId,
            classification: previous
              ? {
                  ...previous,
                  confidence: previous.confidence ?? null,
                  reviewedAt: previous.reviewedAt?.toISOString() ?? null,
                  createdAt: previous.createdAt.toISOString(),
                  updatedAt: previous.updatedAt.toISOString(),
                }
              : null,
          };
        }),
        previousRules: null,
        ruleMatchValue: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: classificationDecisionBatches.id });

    await tx
      .insert(transactionClassifications)
      .values(
        transactionIds.map((transactionId) => ({
          transactionId,
          classificationType: input.classificationType,
          memberOwnerId,
          category: savedCategory?.name ?? null,
          categoryId: savedCategory?.id ?? null,
          confidence: null,
          decidedBy: "user" as const,
          reviewedAt: now,
          decisionBatchId: decisionBatch.id,
        })),
      )
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: input.classificationType,
          memberOwnerId,
          category: savedCategory?.name ?? null,
          categoryId: savedCategory?.id ?? null,
          confidence: null,
          decidedBy: "user",
          reviewedAt: now,
          decisionBatchId: decisionBatch.id,
          updatedAt: now,
        },
      });

    await syncTransactionExpenseEvents(context, transactionIds, tx);
    return decisionBatch.id;
  });

  return {
    updatedCount: transactionIds.length,
    undoBatchId,
  };
}

export async function undoClassificationDecision(
  context: CurrentWorkspaceContext,
  batchId: string,
) {
  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(classificationDecisionBatches)
      .where(
        and(
          eq(classificationDecisionBatches.id, batchId),
          eq(classificationDecisionBatches.workspaceId, context.workspaceId),
          eq(classificationDecisionBatches.userId, context.userId),
          isNull(classificationDecisionBatches.undoneAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!batch) {
      throw new Error("This classification change can no longer be undone.");
    }

    const currentClassifications = await tx
      .select({
        transactionId: transactionClassifications.transactionId,
        decisionBatchId: transactionClassifications.decisionBatchId,
      })
      .from(transactionClassifications)
      .where(inArray(transactionClassifications.transactionId, batch.transactionIds));
    const stillCurrent =
      currentClassifications.length === batch.transactionIds.length &&
      currentClassifications.every(
        (classification) => classification.decisionBatchId === batch.id,
      );
    if (!stillCurrent) {
      throw new Error("These transactions changed again after this action, so it is no longer safe to undo.");
    }

    await tx
      .delete(transactionClassifications)
      .where(inArray(transactionClassifications.transactionId, batch.transactionIds));

    const previousClassifications = batch.previousClassifications
      .map((snapshot) => snapshot.classification)
      .filter((classification): classification is NonNullable<typeof classification> => Boolean(classification));

    if (previousClassifications.length > 0) {
      await tx.insert(transactionClassifications).values(
        previousClassifications.map((classification) => ({
          id: classification.id,
          transactionId: classification.transactionId,
          classificationType: classification.classificationType,
          memberOwnerId: classification.memberOwnerId,
          category: classification.category,
          categoryId: classification.categoryId,
          confidence: classification.confidence,
          decidedBy: classification.decidedBy,
          reviewedAt: classification.reviewedAt ? new Date(classification.reviewedAt) : null,
          decisionBatchId: classification.decisionBatchId,
          createdAt: new Date(classification.createdAt),
          updatedAt: new Date(classification.updatedAt),
        })),
      );
    }

    if (batch.ruleMatchValue) {
      await tx
        .delete(classificationRules)
        .where(
          and(
            eq(classificationRules.workspaceId, context.workspaceId),
            eq(classificationRules.matchType, "exact"),
            eq(classificationRules.matchValue, batch.ruleMatchValue),
          ),
        );
      if (batch.previousRules && batch.previousRules.length > 0) {
        await tx.insert(classificationRules).values(
          batch.previousRules.map((rule) => ({
            id: rule.id,
            workspaceId: context.workspaceId,
            matchType: rule.matchType,
            matchValue: rule.matchValue,
            defaultClassificationType: rule.defaultClassificationType,
            defaultMemberOwnerId: rule.defaultMemberOwnerId,
            defaultCategory: rule.defaultCategory,
            defaultCategoryId: rule.defaultCategoryId,
            priority: rule.priority,
            active: rule.active,
            createdAt: new Date(rule.createdAt),
            updatedAt: new Date(rule.updatedAt),
          })),
        );
      }
    }

    await syncTransactionExpenseEvents(context, batch.transactionIds, tx);
    await tx
      .update(classificationDecisionBatches)
      .set({ undoneAt: now, updatedAt: now })
      .where(eq(classificationDecisionBatches.id, batch.id));

    return { restoredCount: batch.transactionIds.length };
  });
}

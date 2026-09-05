import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, type DbExecutor } from "@/db";
import {
  classificationDecisionBatches,
  classificationRules,
  financialAccounts,
  transactionClassifications,
  transactions,
  workspaceMembers,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import {
  compatibilityMemberOwnerId,
  getMemberAttributionValidationMessage,
  memberAttributionFromSnapshot,
  normalizeMemberAttribution,
  resolveImportedPaidByMemberId,
  type MemberAttribution,
} from "@/features/expenses/payer";
import { normalizeMerchantRuleValue } from "@/features/expenses/suggestions";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import {
  normalizeOptionalWorkspaceCategoryName,
  resolveWorkspaceCategory,
  WorkspaceCategoryInputError,
} from "@/features/workspaces/categories";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

type ClassificationMemberInput = {
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
};

type SingleClassificationInput = ClassificationMemberInput & {
  transactionId: string;
  classificationType: ClassificationType;
  category?: string | null;
  categoryId?: string | null;
  createRule?: boolean;
  additionalTransactionIds?: string[];
};

type BulkClassificationInput = ClassificationMemberInput & {
  transactionIds: string[];
  classificationType: ClassificationType;
  category?: string | null;
  categoryId?: string | null;
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

function optionalMemberInput(value?: string | null) {
  if (value === undefined) {
    return undefined;
  }

  return normalizeOptionalText(value);
}

async function assertWorkspaceMembers(
  workspaceId: string,
  memberIds: Array<string | null | undefined>,
  db: DbExecutor,
) {
  const uniqueIds = Array.from(
    new Set(memberIds.filter((memberId): memberId is string => Boolean(memberId))),
  );

  if (uniqueIds.length === 0) {
    return;
  }

  const members = await db
    .select({ id: workspaceMembers.id })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.isActive, true),
        inArray(workspaceMembers.id, uniqueIds),
      ),
    );

  if (members.length !== uniqueIds.length) {
    throw new ClassificationInputError("Selected member does not belong to the current workspace.");
  }
}

export function validateClassificationInput(input: {
  classificationType: ClassificationType;
  personalOwnerMemberId?: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId?: string | null;
  category: string | null;
  categoryId?: string | null;
}) {
  const memberValidationMessage = getMemberAttributionValidationMessage({
    classificationType: input.classificationType,
    personalOwnerMemberId: input.personalOwnerMemberId ?? null,
    paidByMemberId: input.paidByMemberId ?? null,
    receivedByMemberId: input.receivedByMemberId ?? null,
  });

  if (memberValidationMessage) {
    throw new ClassificationInputError(memberValidationMessage);
  }
  if (["transfer", "ignore"].includes(input.classificationType) && (input.category || input.categoryId)) {
    throw new ClassificationInputError(
      "Transfer and Ignore classifications cannot have a category.",
    );
  }
}

function importedAttributionForAccount(input: {
  classificationType: ClassificationType;
  personalOwnerMemberId: string | null;
  paidByMemberId?: string | null;
  receivedByMemberId: string | null;
  accountOwnerMemberId: string | null;
}): MemberAttribution {
  return normalizeMemberAttribution({
    classificationType: input.classificationType,
    personalOwnerMemberId: input.personalOwnerMemberId,
    paidByMemberId: resolveImportedPaidByMemberId({
      classificationType: input.classificationType,
      paidByMemberId: input.paidByMemberId,
      accountOwnerMemberId: input.accountOwnerMemberId,
    }),
    receivedByMemberId: input.receivedByMemberId,
  });
}

function classificationWriteValues(input: {
  classificationType: ClassificationType;
  attribution: MemberAttribution;
}) {
  return {
    classificationType: input.classificationType,
    memberOwnerId: compatibilityMemberOwnerId(input.classificationType, input.attribution),
    personalOwnerMemberId: input.attribution.personalOwnerMemberId,
    paidByMemberId: input.attribution.paidByMemberId,
    receivedByMemberId: input.attribution.receivedByMemberId,
  };
}

function ruleWriteValues(input: {
  classificationType: ClassificationType;
  attribution: MemberAttribution;
}) {
  return {
    defaultClassificationType: input.classificationType,
    defaultMemberOwnerId: compatibilityMemberOwnerId(input.classificationType, input.attribution),
    defaultPersonalOwnerMemberId: input.attribution.personalOwnerMemberId,
    defaultPaidByMemberId: input.attribution.paidByMemberId,
    defaultReceivedByMemberId: input.attribution.receivedByMemberId,
  };
}

export async function upsertTransactionClassification(
  context: CurrentWorkspaceContext,
  input: SingleClassificationInput,
  db: DbExecutor = getDb(),
) {
  const personalOwnerMemberId = normalizeOptionalText(input.personalOwnerMemberId);
  const paidByMemberId = optionalMemberInput(input.paidByMemberId);
  const receivedByMemberId = normalizeOptionalText(input.receivedByMemberId);
  const category = normalizeOptionalWorkspaceCategoryName(input.category);
  const previewAttribution = importedAttributionForAccount({
    classificationType: input.classificationType,
    personalOwnerMemberId,
    paidByMemberId,
    receivedByMemberId,
    accountOwnerMemberId: null,
  });

  validateClassificationInput({
    classificationType: input.classificationType,
    personalOwnerMemberId: previewAttribution.personalOwnerMemberId,
    paidByMemberId: paidByMemberId === undefined ? previewAttribution.paidByMemberId : paidByMemberId,
    receivedByMemberId: previewAttribution.receivedByMemberId,
    category,
    categoryId: input.categoryId,
  });
  await assertWorkspaceMembers(
    context.workspaceId,
    [personalOwnerMemberId, paidByMemberId, receivedByMemberId],
    db,
  );
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
    .select({
      id: transactions.id,
      merchantRaw: transactions.merchantRaw,
      accountOwnerMemberId: financialAccounts.ownerMemberId,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
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
  const accountOwnerByTransactionId = new Map(
    matchingTransactions.map((item) => [item.id, item.accountOwnerMemberId]),
  );
  const primaryAttribution = importedAttributionForAccount({
    classificationType: input.classificationType,
    personalOwnerMemberId,
    paidByMemberId,
    receivedByMemberId,
    accountOwnerMemberId: transaction.accountOwnerMemberId,
  });
  validateClassificationInput({
    classificationType: input.classificationType,
    ...primaryAttribution,
    category,
    categoryId: input.categoryId,
  });
  await assertWorkspaceMembers(
    context.workspaceId,
    matchingTransactions.flatMap((item) => {
      const attribution = importedAttributionForAccount({
        classificationType: input.classificationType,
        personalOwnerMemberId,
        paidByMemberId,
        receivedByMemberId,
        accountOwnerMemberId: item.accountOwnerMemberId,
      });
      return [
        attribution.personalOwnerMemberId,
        attribution.paidByMemberId,
        attribution.receivedByMemberId,
      ];
    }),
    db,
  );

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
      .values(requestedTransactionIds.map((transactionId) => {
        const attribution = importedAttributionForAccount({
          classificationType: input.classificationType,
          personalOwnerMemberId,
          paidByMemberId,
          receivedByMemberId,
          accountOwnerMemberId: accountOwnerByTransactionId.get(transactionId) ?? null,
        });

        return {
          transactionId,
          ...classificationWriteValues({
            classificationType: input.classificationType,
            attribution,
          }),
          category: savedCategory?.name ?? null,
          categoryId: savedCategory?.id ?? null,
          confidence: null,
          decidedBy: "user" as const,
          reviewedAt: now,
          decisionBatchId: decisionBatch.id,
        };
      }))
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: sql`excluded.classification_type`,
          memberOwnerId: sql`excluded.member_owner_id`,
          personalOwnerMemberId: sql`excluded.personal_owner_member_id`,
          paidByMemberId: sql`excluded.paid_by_member_id`,
          receivedByMemberId: sql`excluded.received_by_member_id`,
          category: sql`excluded.category`,
          categoryId: sql`excluded.category_id`,
          confidence: sql`excluded.confidence`,
          decidedBy: sql`excluded.decided_by`,
          reviewedAt: sql`excluded.reviewed_at`,
          decisionBatchId: sql`excluded.decision_batch_id`,
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
      const ruleValues = ruleWriteValues({
        classificationType: input.classificationType,
        attribution: primaryAttribution,
      });

      if (existingRules.length === 0) {
        await tx.insert(classificationRules).values({
          workspaceId: context.workspaceId,
          matchType: "exact",
          matchValue: ruleMatchValue,
          ...ruleValues,
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
            ...ruleValues,
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
  db: DbExecutor = getDb(),
) {
  const transactionIds = Array.from(new Set(input.transactionIds));
  const personalOwnerMemberId = normalizeOptionalText(input.personalOwnerMemberId);
  const paidByMemberId = optionalMemberInput(input.paidByMemberId);
  const receivedByMemberId = normalizeOptionalText(input.receivedByMemberId);
  const category = normalizeOptionalWorkspaceCategoryName(input.category);

  if (transactionIds.length === 0) {
    throw new ClassificationInputError("Select at least one transaction to classify.");
  }

  const previewAttribution = importedAttributionForAccount({
    classificationType: input.classificationType,
    personalOwnerMemberId,
    paidByMemberId,
    receivedByMemberId,
    accountOwnerMemberId: null,
  });
  validateClassificationInput({
    classificationType: input.classificationType,
    personalOwnerMemberId: previewAttribution.personalOwnerMemberId,
    paidByMemberId: paidByMemberId === undefined ? previewAttribution.paidByMemberId : paidByMemberId,
    receivedByMemberId: previewAttribution.receivedByMemberId,
    category,
    categoryId: input.categoryId,
  });
  await assertWorkspaceMembers(
    context.workspaceId,
    [personalOwnerMemberId, paidByMemberId, receivedByMemberId],
    db,
  );
  const savedCategory = await resolveWorkspaceCategory(
    context,
    { categoryId: input.categoryId, categoryName: category },
    db,
  );

  const matchingTransactions = await db
    .select({
      id: transactions.id,
      accountOwnerMemberId: financialAccounts.ownerMemberId,
    })
    .from(transactions)
    .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
    .where(
      and(
        eq(transactions.workspaceId, context.workspaceId),
        inArray(transactions.id, transactionIds),
      ),
    );

  if (matchingTransactions.length !== transactionIds.length) {
    throw new Error("One or more selected transactions were not found.");
  }

  const accountOwnerByTransactionId = new Map(
    matchingTransactions.map((item) => [item.id, item.accountOwnerMemberId]),
  );
  await assertWorkspaceMembers(
    context.workspaceId,
    matchingTransactions.flatMap((item) => {
      const attribution = importedAttributionForAccount({
        classificationType: input.classificationType,
        personalOwnerMemberId,
        paidByMemberId,
        receivedByMemberId,
        accountOwnerMemberId: item.accountOwnerMemberId,
      });
      return [
        attribution.personalOwnerMemberId,
        attribution.paidByMemberId,
        attribution.receivedByMemberId,
      ];
    }),
    db,
  );
  for (const item of matchingTransactions) {
    const attribution = importedAttributionForAccount({
      classificationType: input.classificationType,
      personalOwnerMemberId,
      paidByMemberId,
      receivedByMemberId,
      accountOwnerMemberId: item.accountOwnerMemberId,
    });
    validateClassificationInput({
      classificationType: input.classificationType,
      ...attribution,
      category,
      categoryId: input.categoryId,
    });
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
        transactionIds.map((transactionId) => {
          const attribution = importedAttributionForAccount({
            classificationType: input.classificationType,
            personalOwnerMemberId,
            paidByMemberId,
            receivedByMemberId,
            accountOwnerMemberId: accountOwnerByTransactionId.get(transactionId) ?? null,
          });

          return {
            transactionId,
            ...classificationWriteValues({
              classificationType: input.classificationType,
              attribution,
            }),
            category: savedCategory?.name ?? null,
            categoryId: savedCategory?.id ?? null,
            confidence: null,
            decidedBy: "user" as const,
            reviewedAt: now,
            decisionBatchId: decisionBatch.id,
          };
        }),
      )
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: sql`excluded.classification_type`,
          memberOwnerId: sql`excluded.member_owner_id`,
          personalOwnerMemberId: sql`excluded.personal_owner_member_id`,
          paidByMemberId: sql`excluded.paid_by_member_id`,
          receivedByMemberId: sql`excluded.received_by_member_id`,
          category: sql`excluded.category`,
          categoryId: sql`excluded.category_id`,
          confidence: sql`excluded.confidence`,
          decidedBy: sql`excluded.decided_by`,
          reviewedAt: sql`excluded.reviewed_at`,
          decisionBatchId: sql`excluded.decision_batch_id`,
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
  db: DbExecutor = getDb(),
) {
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
        previousClassifications.map((classification) => {
          const attribution = memberAttributionFromSnapshot(classification);
          return {
            id: classification.id,
            transactionId: classification.transactionId,
            ...classificationWriteValues({
              classificationType: classification.classificationType,
              attribution,
            }),
            category: classification.category,
            categoryId: classification.categoryId,
            confidence: classification.confidence,
            decidedBy: classification.decidedBy,
            reviewedAt: classification.reviewedAt ? new Date(classification.reviewedAt) : null,
            decisionBatchId: classification.decisionBatchId,
            createdAt: new Date(classification.createdAt),
            updatedAt: new Date(classification.updatedAt),
          };
        }),
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
          batch.previousRules.map((rule) => {
            const attribution = memberAttributionFromSnapshot({
              classificationType: rule.defaultClassificationType,
              defaultMemberOwnerId: rule.defaultMemberOwnerId,
              defaultPersonalOwnerMemberId: rule.defaultPersonalOwnerMemberId,
              defaultPaidByMemberId: rule.defaultPaidByMemberId,
              defaultReceivedByMemberId: rule.defaultReceivedByMemberId,
            });
            return {
              id: rule.id,
              workspaceId: context.workspaceId,
              matchType: rule.matchType,
              matchValue: rule.matchValue,
              ...ruleWriteValues({
                classificationType: rule.defaultClassificationType,
                attribution,
              }),
              defaultCategory: rule.defaultCategory,
              defaultCategoryId: rule.defaultCategoryId,
              priority: rule.priority,
              active: rule.active,
              createdAt: new Date(rule.createdAt),
              updatedAt: new Date(rule.updatedAt),
            };
          }),
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

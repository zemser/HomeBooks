import { and, asc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classificationRules,
  transactionClassifications,
  transactions,
  workspaceMembers,
} from "@/db/schema";
import type { ClassificationType } from "@/features/expenses/constants";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";

type SingleClassificationInput = {
  transactionId: string;
  classificationType: ClassificationType;
  category?: string | null;
  memberOwnerId?: string | null;
  createRule?: boolean;
};

type BulkClassificationInput = {
  transactionIds: string[];
  classificationType: ClassificationType;
  category?: string | null;
  memberOwnerId?: string | null;
};

function normalizeOptionalText(value?: string | null) {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function normalizeMerchantRuleValue(value: string) {
  return value.trim().toLocaleLowerCase();
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
    throw new Error("Selected member does not belong to the current workspace.");
  }
}

function validateClassificationInput(input: {
  classificationType: ClassificationType;
  memberOwnerId: string | null;
}) {
  if (input.classificationType === "personal" && !input.memberOwnerId) {
    throw new Error("Personal classifications require a member owner.");
  }
}

export async function upsertTransactionClassification(
  context: CurrentWorkspaceContext,
  input: SingleClassificationInput,
) {
  const db = getDb();
  const memberOwnerId = normalizeOptionalText(input.memberOwnerId);
  const category = normalizeOptionalText(input.category);

  validateClassificationInput({
    classificationType: input.classificationType,
    memberOwnerId,
  });
  await assertWorkspaceMember(context.workspaceId, memberOwnerId);

  const transaction = await db.query.transactions.findFirst({
    columns: {
      id: true,
      merchantRaw: true,
    },
    where: and(
      eq(transactions.id, input.transactionId),
      eq(transactions.workspaceId, context.workspaceId),
    ),
  });

  if (!transaction) {
    throw new Error("Transaction was not found in the current workspace.");
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .insert(transactionClassifications)
      .values({
        transactionId: transaction.id,
        classificationType: input.classificationType,
        memberOwnerId,
        category,
        confidence: null,
        decidedBy: "user",
        reviewedAt: now,
      })
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: input.classificationType,
          memberOwnerId,
          category,
          confidence: null,
          decidedBy: "user",
          reviewedAt: now,
          updatedAt: now,
        },
      });

    if (!input.createRule) {
      return;
    }

    const merchantValue = normalizeOptionalText(transaction.merchantRaw);

    if (!merchantValue) {
      throw new Error("This transaction does not have a merchant value to turn into a rule.");
    }

    const matchValue = normalizeMerchantRuleValue(merchantValue);
    const existingRules = await tx
      .select({
        id: classificationRules.id,
      })
      .from(classificationRules)
      .where(
        and(
          eq(classificationRules.workspaceId, context.workspaceId),
          eq(classificationRules.matchType, "exact"),
          eq(classificationRules.matchValue, matchValue),
        ),
      )
      .orderBy(asc(classificationRules.createdAt));

    if (existingRules.length === 0) {
      await tx.insert(classificationRules).values({
        workspaceId: context.workspaceId,
        matchType: "exact",
        matchValue,
        defaultClassificationType: input.classificationType,
        defaultMemberOwnerId: memberOwnerId,
        defaultCategory: category,
        priority: 100,
        active: true,
      });
      return;
    }

    const [primaryRule, ...duplicateRules] = existingRules;

    await tx
      .update(classificationRules)
      .set({
        defaultClassificationType: input.classificationType,
        defaultMemberOwnerId: memberOwnerId,
        defaultCategory: category,
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

    await syncTransactionExpenseEvents(context, [transaction.id], tx);
  });

  return {
    transactionId: transaction.id,
    createdRule: Boolean(input.createRule),
  };
}

export async function bulkClassifyTransactions(
  context: CurrentWorkspaceContext,
  input: BulkClassificationInput,
) {
  const db = getDb();
  const transactionIds = Array.from(new Set(input.transactionIds));
  const memberOwnerId = normalizeOptionalText(input.memberOwnerId);
  const category = normalizeOptionalText(input.category);

  if (transactionIds.length === 0) {
    throw new Error("Select at least one transaction to classify.");
  }

  validateClassificationInput({
    classificationType: input.classificationType,
    memberOwnerId,
  });
  await assertWorkspaceMember(context.workspaceId, memberOwnerId);

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

  await db.transaction(async (tx) => {
    await tx
      .insert(transactionClassifications)
      .values(
        transactionIds.map((transactionId) => ({
          transactionId,
          classificationType: input.classificationType,
          memberOwnerId,
          category,
          confidence: null,
          decidedBy: "user" as const,
          reviewedAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: transactionClassifications.transactionId,
        set: {
          classificationType: input.classificationType,
          memberOwnerId,
          category,
          confidence: null,
          decidedBy: "user",
          reviewedAt: now,
          updatedAt: now,
        },
      });

    await syncTransactionExpenseEvents(context, transactionIds, tx);
  });

  return {
    updatedCount: transactionIds.length,
  };
}

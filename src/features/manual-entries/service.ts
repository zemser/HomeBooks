import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import { manualEntries, manualEntryOverrides, workspaceMembers } from "@/db/schema";
import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import { syncManualEntryExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type {
  OneTimeManualEntryClassificationType,
  OneTimeManualEntryEventKind,
} from "@/features/manual-entries/constants";
import { ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES } from "@/features/manual-entries/constants";
import type { OneTimeManualEntryItem } from "@/features/manual-entries/types";

type CreateOneTimeManualEntryInput = {
  title: string;
  eventKind: OneTimeManualEntryEventKind;
  payerMemberId?: string | null;
  classificationType: OneTimeManualEntryClassificationType;
  category?: string | null;
  amount: number;
  eventDate: string;
};

type UpdateOneTimeManualEntryInput = CreateOneTimeManualEntryInput;

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function normalizeDateInput(value: string) {
  const trimmed = value.trim();
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Manual entry date must use YYYY-MM-DD.");
  }

  return trimmed;
}

async function assertWorkspaceMember(
  context: CurrentWorkspaceContext,
  memberId: string | null,
  db: DbExecutor = getDb(),
) {
  if (!memberId) {
    return;
  }

  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.id, memberId),
      eq(workspaceMembers.workspaceId, context.workspaceId),
      eq(workspaceMembers.isActive, true),
    ),
  });

  if (!member) {
    throw new Error("Selected member does not belong to the current workspace.");
  }
}

async function assertWorkspaceOneTimeManualEntry(
  context: CurrentWorkspaceContext,
  manualEntryId: string,
  db: DbExecutor = getDb(),
) {
  const entry = await db.query.manualEntries.findFirst({
    where: and(
      eq(manualEntries.id, manualEntryId),
      eq(manualEntries.workspaceId, context.workspaceId),
      eq(manualEntries.sourceType, "one_time_manual"),
    ),
  });

  if (!entry) {
    throw new Error("One-time manual entry was not found in the current workspace.");
  }

  return entry;
}

function validateOneTimeManualEntry(input: {
  eventKind: OneTimeManualEntryEventKind;
  classificationType: OneTimeManualEntryClassificationType;
  payerMemberId: string | null;
}) {
  if (input.eventKind === "income" && input.classificationType !== "income") {
    throw new Error("Income manual entries must use income classification.");
  }

  if (input.eventKind === "expense" && input.classificationType === "income") {
    throw new Error("Expense manual entries cannot use income classification.");
  }

  if (input.classificationType === "personal" && !input.payerMemberId) {
    throw new Error("Personal manual entries require a member owner.");
  }
}

export async function listOneTimeManualEntries(
  context: CurrentWorkspaceContext,
): Promise<OneTimeManualEntryItem[]> {
  const db = getDb();
  const [entries, members] = await Promise.all([
    db
      .select({
        id: manualEntries.id,
        title: manualEntries.title,
        eventKind: manualEntries.eventKind,
        originalAmount: manualEntries.originalAmount,
        originalCurrency: manualEntries.originalCurrency,
        normalizedAmount: manualEntries.normalizedAmount,
        workspaceCurrency: manualEntries.workspaceCurrency,
        payerMemberId: manualEntries.payerMemberId,
        classificationType: manualEntries.classificationType,
        category: manualEntries.category,
        eventDate: manualEntries.eventDate,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "one_time_manual"),
          inArray(
            manualEntries.classificationType,
            ONE_TIME_MANUAL_ENTRY_CLASSIFICATION_TYPES,
          ),
        ),
      )
      .orderBy(desc(manualEntries.eventDate), desc(manualEntries.createdAt)),
    listWorkspaceMembers(context),
  ]);

  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));

  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    eventKind: entry.eventKind,
    originalAmount: entry.originalAmount,
    originalCurrency: entry.originalCurrency,
    normalizedAmount: entry.normalizedAmount,
    workspaceCurrency: entry.workspaceCurrency,
    payerMemberId: entry.payerMemberId,
    payerMemberName: entry.payerMemberId ? memberNames.get(entry.payerMemberId) ?? null : null,
    classificationType: entry.classificationType as OneTimeManualEntryClassificationType,
    category: entry.category,
    eventDate: entry.eventDate,
  }));
}

export async function createOneTimeManualEntry(
  context: CurrentWorkspaceContext,
  input: CreateOneTimeManualEntryInput,
) {
  const db = getDb();
  const payerMemberId = normalizeOptionalText(input.payerMemberId);
  const category = normalizeOptionalText(input.category);
  const eventDate = normalizeDateInput(input.eventDate);

  validateOneTimeManualEntry({
    eventKind: input.eventKind,
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId, db);

  const normalized = normalizeAmountToWorkspaceCurrency({
    amount: input.amount,
    fromCurrency: context.baseCurrency,
    toCurrency: context.baseCurrency,
    monthlyAverageRate: 1,
    rateSource: "same-currency",
  });

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(manualEntries)
      .values({
        workspaceId: context.workspaceId,
        sourceType: "one_time_manual",
        sourceId: null,
        eventKind: input.eventKind,
        title: input.title.trim(),
        originalCurrency: context.baseCurrency,
        originalAmount: normalized.originalAmount.toFixed(6),
        workspaceCurrency: context.baseCurrency,
        normalizedAmount: normalized.normalizedAmount.toFixed(6),
        normalizationRate: normalized.normalizationRate.toFixed(8),
        normalizationRateSource: normalized.normalizationRateSource,
        payerMemberId,
        classificationType: input.classificationType,
        category,
        eventDate,
      })
      .returning({
        id: manualEntries.id,
      });

    await syncManualEntryExpenseEvents(context, [entry.id], tx);

    return {
      manualEntryId: entry.id,
    };
  });
}

export async function updateOneTimeManualEntry(
  context: CurrentWorkspaceContext,
  manualEntryId: string,
  input: UpdateOneTimeManualEntryInput,
) {
  const db = getDb();
  const payerMemberId = normalizeOptionalText(input.payerMemberId);
  const category = normalizeOptionalText(input.category);
  const eventDate = normalizeDateInput(input.eventDate);

  await assertWorkspaceOneTimeManualEntry(context, manualEntryId, db);
  validateOneTimeManualEntry({
    eventKind: input.eventKind,
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId, db);

  const normalized = normalizeAmountToWorkspaceCurrency({
    amount: input.amount,
    fromCurrency: context.baseCurrency,
    toCurrency: context.baseCurrency,
    monthlyAverageRate: 1,
    rateSource: "same-currency",
  });

  await db.transaction(async (tx) => {
    await tx
      .update(manualEntries)
      .set({
        eventKind: input.eventKind,
        title: input.title.trim(),
        originalCurrency: context.baseCurrency,
        originalAmount: normalized.originalAmount.toFixed(6),
        workspaceCurrency: context.baseCurrency,
        normalizedAmount: normalized.normalizedAmount.toFixed(6),
        normalizationRate: normalized.normalizationRate.toFixed(8),
        normalizationRateSource: normalized.normalizationRateSource,
        payerMemberId,
        classificationType: input.classificationType,
        category,
        eventDate,
        updatedAt: new Date(),
      })
      .where(eq(manualEntries.id, manualEntryId));

    await syncManualEntryExpenseEvents(context, [manualEntryId], tx);
  });

  return {
    manualEntryId,
  };
}

export async function deleteOneTimeManualEntry(
  context: CurrentWorkspaceContext,
  manualEntryId: string,
) {
  const db = getDb();

  await assertWorkspaceOneTimeManualEntry(context, manualEntryId, db);

  await db.transaction(async (tx) => {
    const overrideRows = await tx
      .select({
        id: manualEntryOverrides.id,
      })
      .from(manualEntryOverrides)
      .where(eq(manualEntryOverrides.manualEntryId, manualEntryId));

    if (overrideRows.length > 0) {
      await tx
        .delete(manualEntryOverrides)
        .where(
          inArray(
            manualEntryOverrides.id,
            overrideRows.map((row) => row.id),
          ),
        );
    }

    await tx.delete(manualEntries).where(eq(manualEntries.id, manualEntryId));
    await syncManualEntryExpenseEvents(context, [manualEntryId], tx);
  });

  return {
    manualEntryId,
  };
}

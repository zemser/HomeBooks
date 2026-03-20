import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";

import { getDb } from "@/db";
import { manualEntries, manualRecurringExpenses, recurringEntryVersions } from "@/db/schema";
import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import type { ClassificationType } from "@/features/expenses/constants";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import { syncManualEntryExpenseEvents } from "@/features/reporting/expense-events";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type {
  EventKind,
  NormalizationMode,
  RecurrenceRule,
} from "@/features/recurring/constants";
import type {
  GeneratedManualEntryItem,
  RecurringEntryItem,
  RecurringEntryVersionItem,
} from "@/features/recurring/types";
import {
  currentMonthString,
  listMonthStringsBetween,
  normalizeMonthString,
  previousMonthString,
} from "@/features/recurring/utils";

type CreateRecurringEntryInput = {
  title: string;
  eventKind: EventKind;
  payerMemberId?: string | null;
  classificationType: ClassificationType;
  category?: string | null;
  effectiveStartMonth: string;
  amount: number;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: RecurrenceRule;
  notes?: string | null;
};

type UpdateRecurringEntryInput = {
  title: string;
  eventKind: EventKind;
  payerMemberId?: string | null;
  classificationType: ClassificationType;
  category?: string | null;
  active: boolean;
};

type CreateRecurringVersionInput = {
  recurringEntryId: string;
  effectiveStartMonth: string;
  amount: number;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: RecurrenceRule;
  notes?: string | null;
};

type GenerateEntriesInput = {
  startMonth: string;
  endMonth: string;
};

function normalizeOptionalText(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function assertWorkspaceRecurringEntry(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
) {
  const db = getDb();
  const recurringEntry = await db.query.manualRecurringExpenses.findFirst({
    where: and(
      eq(manualRecurringExpenses.id, recurringEntryId),
      eq(manualRecurringExpenses.workspaceId, context.workspaceId),
    ),
  });

  if (!recurringEntry) {
    throw new Error("Recurring entry was not found in the current workspace.");
  }

  return recurringEntry;
}

async function assertWorkspaceMember(
  context: CurrentWorkspaceContext,
  memberId: string | null,
) {
  if (!memberId) {
    return;
  }

  const members = await listWorkspaceMembers(context);
  const exists = members.some((member) => member.id === memberId);

  if (!exists) {
    throw new Error("Selected member does not belong to the current workspace.");
  }
}

function validateRecurringClassification(input: {
  classificationType: ClassificationType;
  payerMemberId: string | null;
}) {
  if (input.classificationType === "personal" && !input.payerMemberId) {
    throw new Error("Personal recurring entries require a member owner.");
  }
}

function normalizeCurrencyCode(value: string) {
  const normalized = value.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error("Currency must be a 3-letter code.");
  }

  return normalized;
}

function assertMonthRange(startMonth: string, endMonth: string) {
  if (startMonth > endMonth) {
    throw new Error("Start month must be before or equal to end month.");
  }
}

function normalizeGeneratedAmount(input: {
  amount: number;
  currency: string;
  workspaceCurrency: string;
  normalizationMode: NormalizationMode;
}) {
  if (input.currency === input.workspaceCurrency) {
    const normalized = normalizeAmountToWorkspaceCurrency({
      amount: input.amount,
      fromCurrency: input.currency,
      toCurrency: input.workspaceCurrency,
      monthlyAverageRate: 1,
      rateSource: "same-currency",
    });

    return normalized;
  }

  return normalizeAmountToWorkspaceCurrency({
    amount: input.amount,
    fromCurrency: input.currency,
    toCurrency: input.workspaceCurrency,
    monthlyAverageRate: 1,
    rateSource: `${input.normalizationMode}-placeholder-rate-1`,
  });
}

function mapVersion(row: {
  id: string;
  effectiveStartMonth: string;
  effectiveEndMonth: string | null;
  amount: string;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: string;
  notes: string | null;
}): RecurringEntryVersionItem {
  return {
    id: row.id,
    effectiveStartMonth: row.effectiveStartMonth,
    effectiveEndMonth: row.effectiveEndMonth,
    amount: row.amount,
    currency: row.currency,
    normalizationMode: row.normalizationMode,
    recurrenceRule: row.recurrenceRule,
    notes: row.notes,
  };
}

export async function listRecurringEntries(context: CurrentWorkspaceContext) {
  const db = getDb();
  const [entries, versions, members] = await Promise.all([
    db
      .select({
        id: manualRecurringExpenses.id,
        title: manualRecurringExpenses.title,
        eventKind: manualRecurringExpenses.eventKind,
        payerMemberId: manualRecurringExpenses.payerMemberId,
        classificationType: manualRecurringExpenses.classificationType,
        category: manualRecurringExpenses.category,
        active: manualRecurringExpenses.active,
      })
      .from(manualRecurringExpenses)
      .where(eq(manualRecurringExpenses.workspaceId, context.workspaceId))
      .orderBy(desc(manualRecurringExpenses.createdAt)),
    db
      .select({
        id: recurringEntryVersions.id,
        recurringEntryId: recurringEntryVersions.recurringEntryId,
        effectiveStartMonth: recurringEntryVersions.effectiveStartMonth,
        effectiveEndMonth: recurringEntryVersions.effectiveEndMonth,
        amount: recurringEntryVersions.amount,
        currency: recurringEntryVersions.currency,
        normalizationMode: recurringEntryVersions.normalizationMode,
        recurrenceRule: recurringEntryVersions.recurrenceRule,
        notes: recurringEntryVersions.notes,
      })
      .from(recurringEntryVersions)
      .innerJoin(
        manualRecurringExpenses,
        eq(manualRecurringExpenses.id, recurringEntryVersions.recurringEntryId),
      )
      .where(eq(manualRecurringExpenses.workspaceId, context.workspaceId))
      .orderBy(
        desc(recurringEntryVersions.effectiveStartMonth),
        desc(recurringEntryVersions.createdAt),
      ),
    listWorkspaceMembers(context),
  ]);

  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));
  const versionsByEntryId = new Map<string, RecurringEntryVersionItem[]>();

  for (const version of versions) {
    const mappedVersion = mapVersion(version);
    const current = versionsByEntryId.get(version.recurringEntryId) ?? [];
    current.push(mappedVersion);
    versionsByEntryId.set(version.recurringEntryId, current);
  }

  const currentMonth = currentMonthString();

  return entries.map<RecurringEntryItem>((entry) => {
    const entryVersions = versionsByEntryId.get(entry.id) ?? [];
    const currentVersion =
      entryVersions.find(
        (version) =>
          version.effectiveStartMonth <= currentMonth &&
          (!version.effectiveEndMonth || version.effectiveEndMonth >= currentMonth),
      ) ?? entryVersions[0] ?? null;

    return {
      id: entry.id,
      title: entry.title,
      eventKind: entry.eventKind,
      payerMemberId: entry.payerMemberId,
      payerMemberName: entry.payerMemberId
        ? memberNames.get(entry.payerMemberId) ?? null
        : null,
      classificationType: entry.classificationType,
      category: entry.category,
      active: entry.active,
      versions: entryVersions,
      currentVersion,
    };
  });
}

export async function listGeneratedManualEntries(
  context: CurrentWorkspaceContext,
  input: GenerateEntriesInput,
) {
  const db = getDb();
  const startMonth = normalizeMonthString(input.startMonth);
  const endMonth = normalizeMonthString(input.endMonth);
  assertMonthRange(startMonth, endMonth);
  const members = await listWorkspaceMembers(context);
  const memberNames = new Map(members.map((member) => [member.id, member.displayName]));

  const entries = await db
    .select({
      id: manualEntries.id,
      sourceId: manualEntries.sourceId,
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
        eq(manualEntries.sourceType, "recurring_generated"),
        gte(manualEntries.eventDate, startMonth),
        lte(manualEntries.eventDate, endMonth),
      ),
    )
    .orderBy(desc(manualEntries.eventDate), desc(manualEntries.createdAt));

  return entries.map<GeneratedManualEntryItem>((entry) => ({
    id: entry.id,
    sourceId: entry.sourceId,
    title: entry.title,
    eventKind: entry.eventKind,
    originalAmount: entry.originalAmount,
    originalCurrency: entry.originalCurrency,
    normalizedAmount: entry.normalizedAmount,
    workspaceCurrency: entry.workspaceCurrency,
    payerMemberId: entry.payerMemberId,
    payerMemberName: entry.payerMemberId ? memberNames.get(entry.payerMemberId) ?? null : null,
    classificationType: entry.classificationType,
    category: entry.category,
    eventDate: entry.eventDate,
  }));
}

export async function createRecurringEntry(
  context: CurrentWorkspaceContext,
  input: CreateRecurringEntryInput,
) {
  const db = getDb();
  const payerMemberId = normalizeOptionalText(input.payerMemberId);
  const category = normalizeOptionalText(input.category);
  const notes = normalizeOptionalText(input.notes);
  const effectiveStartMonth = normalizeMonthString(input.effectiveStartMonth);
  const currency = normalizeCurrencyCode(input.currency);

  validateRecurringClassification({
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId);

  return db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(manualRecurringExpenses)
      .values({
        workspaceId: context.workspaceId,
        title: input.title.trim(),
        eventKind: input.eventKind,
        payerMemberId,
        classificationType: input.classificationType,
        category,
        active: true,
      })
      .returning({
        id: manualRecurringExpenses.id,
      });

    await tx.insert(recurringEntryVersions).values({
      recurringEntryId: entry.id,
      effectiveStartMonth,
      effectiveEndMonth: null,
      amount: input.amount.toFixed(6),
      currency,
      normalizationMode: input.normalizationMode,
      recurrenceRule: input.recurrenceRule,
      notes,
    });

    return entry;
  });
}

export async function updateRecurringEntry(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
  input: UpdateRecurringEntryInput,
) {
  const db = getDb();
  const payerMemberId = normalizeOptionalText(input.payerMemberId);
  const category = normalizeOptionalText(input.category);

  await assertWorkspaceRecurringEntry(context, recurringEntryId);
  validateRecurringClassification({
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId);

  await db
    .update(manualRecurringExpenses)
    .set({
      title: input.title.trim(),
      eventKind: input.eventKind,
      payerMemberId,
      classificationType: input.classificationType,
      category,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(manualRecurringExpenses.id, recurringEntryId));

  return {
    recurringEntryId,
  };
}

export async function createRecurringEntryVersion(
  context: CurrentWorkspaceContext,
  input: CreateRecurringVersionInput,
) {
  const db = getDb();
  const recurringEntry = await assertWorkspaceRecurringEntry(context, input.recurringEntryId);
  const effectiveStartMonth = normalizeMonthString(input.effectiveStartMonth);
  const notes = normalizeOptionalText(input.notes);
  const currency = normalizeCurrencyCode(input.currency);
  const previousMonth = previousMonthString(effectiveStartMonth);
  const currentMonth = currentMonthString();

  if (effectiveStartMonth <= currentMonth) {
    throw new Error("New recurring versions must start in a future month.");
  }

  const existingVersions = await db
    .select({
      id: recurringEntryVersions.id,
      effectiveStartMonth: recurringEntryVersions.effectiveStartMonth,
      effectiveEndMonth: recurringEntryVersions.effectiveEndMonth,
    })
    .from(recurringEntryVersions)
    .where(eq(recurringEntryVersions.recurringEntryId, recurringEntry.id))
    .orderBy(asc(recurringEntryVersions.effectiveStartMonth));

  if (existingVersions.some((version) => version.effectiveStartMonth === effectiveStartMonth)) {
    throw new Error("A version already starts in that month.");
  }

  const previousVersion = [...existingVersions]
    .reverse()
    .find((version) => version.effectiveStartMonth < effectiveStartMonth);
  const nextVersion = existingVersions.find(
    (version) => version.effectiveStartMonth > effectiveStartMonth,
  );

  if (!previousVersion) {
    throw new Error("Future edits must start after the first version month.");
  }

  await db.transaction(async (tx) => {
    await tx
      .update(recurringEntryVersions)
      .set({
        effectiveEndMonth: previousMonth,
        updatedAt: new Date(),
      })
      .where(eq(recurringEntryVersions.id, previousVersion.id));

    await tx.insert(recurringEntryVersions).values({
      recurringEntryId: recurringEntry.id,
      effectiveStartMonth,
      effectiveEndMonth: nextVersion ? previousMonthString(nextVersion.effectiveStartMonth) : null,
      amount: input.amount.toFixed(6),
      currency,
      normalizationMode: input.normalizationMode,
      recurrenceRule: input.recurrenceRule,
      notes,
    });
  });

  return {
    recurringEntryId: recurringEntry.id,
  };
}

export async function generateRecurringEntriesForPeriod(
  context: CurrentWorkspaceContext,
  input: GenerateEntriesInput,
) {
  const db = getDb();
  const startMonth = normalizeMonthString(input.startMonth);
  const endMonth = normalizeMonthString(input.endMonth);
  assertMonthRange(startMonth, endMonth);
  const months = listMonthStringsBetween(startMonth, endMonth);
  const recurringEntries = await listRecurringEntries(context);
  const activeEntries = recurringEntries.filter((entry) => entry.active && entry.versions.length > 0);

  if (activeEntries.length === 0) {
    return {
      createdCount: 0,
    };
  }

  const existingEntries = await db
    .select({
      sourceId: manualEntries.sourceId,
      eventDate: manualEntries.eventDate,
    })
    .from(manualEntries)
    .where(
      and(
        eq(manualEntries.workspaceId, context.workspaceId),
        eq(manualEntries.sourceType, "recurring_generated"),
        gte(manualEntries.eventDate, startMonth),
        lte(manualEntries.eventDate, endMonth),
        inArray(
          manualEntries.sourceId,
          activeEntries.map((entry) => entry.id),
        ),
      ),
    );
  const existingKeys = new Set(
    existingEntries
      .filter((entry): entry is { sourceId: string; eventDate: string } => Boolean(entry.sourceId))
      .map((entry) => `${entry.sourceId}:${entry.eventDate}`),
  );
  const rowsToInsert: Array<typeof manualEntries.$inferInsert> = [];

  for (const entry of activeEntries) {
    for (const month of months) {
      const version = entry.versions.find(
        (candidate) =>
          candidate.effectiveStartMonth <= month &&
          (!candidate.effectiveEndMonth || candidate.effectiveEndMonth >= month),
      );

      if (!version || version.recurrenceRule !== "monthly") {
        continue;
      }

      const existingKey = `${entry.id}:${month}`;

      if (existingKeys.has(existingKey)) {
        continue;
      }

      const amount = Number(version.amount);
      const normalized = normalizeGeneratedAmount({
        amount,
        currency: version.currency,
        workspaceCurrency: context.baseCurrency,
        normalizationMode: version.normalizationMode,
      });

      rowsToInsert.push({
        workspaceId: context.workspaceId,
        sourceType: "recurring_generated",
        sourceId: entry.id,
        eventKind: entry.eventKind,
        title: entry.title,
        originalCurrency: version.currency,
        originalAmount: amount.toFixed(6),
        workspaceCurrency: context.baseCurrency,
        normalizedAmount: normalized.normalizedAmount.toFixed(6),
        normalizationRate: normalized.normalizationRate.toFixed(8),
        normalizationRateSource: normalized.normalizationRateSource,
        payerMemberId: entry.payerMemberId,
        classificationType: entry.classificationType,
        category: entry.category,
        eventDate: month,
      });
    }
  }

  if (rowsToInsert.length === 0) {
    return {
      createdCount: 0,
    };
  }

  await db.transaction(async (tx) => {
    const createdEntries = await tx
      .insert(manualEntries)
      .values(rowsToInsert)
      .returning({
        id: manualEntries.id,
      });

    await syncManualEntryExpenseEvents(
      context,
      createdEntries.map((entry) => entry.id),
      tx,
    );
  });

  return {
    createdCount: rowsToInsert.length,
  };
}

export async function getRecurringPageData(
  context: CurrentWorkspaceContext,
  input?: Partial<GenerateEntriesInput>,
) {
  const startMonth = input?.startMonth ? normalizeMonthString(input.startMonth) : currentMonthString();
  const endMonth = input?.endMonth ? normalizeMonthString(input.endMonth) : currentMonthString();
  assertMonthRange(startMonth, endMonth);
  const [members, recurringEntries, generatedEntries] = await Promise.all([
    listWorkspaceMembers(context),
    listRecurringEntries(context),
    listGeneratedManualEntries(context, {
      startMonth,
      endMonth,
    }),
  ]);

  return {
    workspaceCurrency: context.baseCurrency,
    members,
    recurringEntries,
    generatedEntries,
  };
}

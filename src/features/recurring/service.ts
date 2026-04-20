import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  manualEntries,
  manualEntryOverrides,
  manualRecurringExpenses,
  recurringEntryVersions,
} from "@/db/schema";
import { normalizeAmountToWorkspaceCurrency } from "@/features/currency/normalize";
import type { ClassificationType } from "@/features/expenses/constants";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import { syncManualEntryExpenseEvents } from "@/features/reporting/expense-events";
import {
  assertWorkspaceCategory,
  listWorkspaceCategoryNames,
  normalizeOptionalWorkspaceCategoryName,
} from "@/features/workspaces/categories";
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

type DbClient = ReturnType<typeof getDb>;
type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];
type DbExecutor = DbClient | DbTransaction;

type MaterializeRecurringEntriesInput = GenerateEntriesInput & {
  recurringEntryIds?: string[];
  allowFutureMonths?: boolean;
};

type ExistingGeneratedManualEntryRow = {
  id: string;
  sourceId: string | null;
  eventDate: string;
};

type RecurringGeneratedRowSeed = {
  sourceId: string;
  eventDate: string;
  eventKind: EventKind;
  title: string;
  originalCurrency: string;
  originalAmount: string;
  workspaceCurrency: string;
  normalizedAmount: string;
  normalizationRate: string;
  normalizationRateSource: string;
  payerMemberId: string | null;
  classificationType: ClassificationType;
  category: string | null;
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

function recurringGeneratedKey(sourceId: string, eventDate: string) {
  return `${sourceId}:${eventDate}`;
}

function clampMaterializationRangeToCurrentMonth(
  input: MaterializeRecurringEntriesInput,
): { startMonth: string; endMonth: string } | null {
  const startMonth = normalizeMonthString(input.startMonth);
  const endMonth = normalizeMonthString(input.endMonth);

  if (input.allowFutureMonths) {
    assertMonthRange(startMonth, endMonth);

    return {
      startMonth,
      endMonth,
    };
  }

  const currentMonth = currentMonthString();

  if (startMonth > currentMonth) {
    return null;
  }

  const clampedEndMonth = endMonth > currentMonth ? currentMonth : endMonth;
  assertMonthRange(startMonth, clampedEndMonth);

  return {
    startMonth,
    endMonth: clampedEndMonth,
  };
}

async function withRecurringMaterializationLock<T>(
  context: CurrentWorkspaceContext,
  run: (tx: DbTransaction) => Promise<T>,
) {
  const db = getDb();

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('recurring_generated'), hashtext(${context.workspaceId}))`,
    );

    return run(tx);
  });
}

async function deleteManualEntryRows(
  tx: DbTransaction,
  manualEntryIds: string[],
) {
  if (manualEntryIds.length === 0) {
    return;
  }

  const overrideRows = await tx
    .select({
      id: manualEntryOverrides.id,
    })
    .from(manualEntryOverrides)
    .where(inArray(manualEntryOverrides.manualEntryId, manualEntryIds));

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

  await tx.delete(manualEntries).where(inArray(manualEntries.id, manualEntryIds));
}

async function getRecurringGeneratedEntryBounds(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
  db: DbExecutor = getDb(),
) {
  const [earliestVersionRow, earliestGeneratedRow, latestGeneratedRow] = await Promise.all([
    db
      .select({
        effectiveStartMonth: recurringEntryVersions.effectiveStartMonth,
      })
      .from(recurringEntryVersions)
      .where(eq(recurringEntryVersions.recurringEntryId, recurringEntryId))
      .orderBy(asc(recurringEntryVersions.effectiveStartMonth))
      .limit(1),
    db
      .select({
        eventDate: manualEntries.eventDate,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "recurring_generated"),
          eq(manualEntries.sourceId, recurringEntryId),
        ),
      )
      .orderBy(asc(manualEntries.eventDate))
      .limit(1),
    db
      .select({
        eventDate: manualEntries.eventDate,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "recurring_generated"),
          eq(manualEntries.sourceId, recurringEntryId),
        ),
      )
      .orderBy(desc(manualEntries.eventDate))
      .limit(1),
  ]);

  return {
    earliestVersionMonth: earliestVersionRow[0]?.effectiveStartMonth ?? null,
    earliestGeneratedMonth: earliestGeneratedRow[0]?.eventDate ?? null,
    latestGeneratedMonth: latestGeneratedRow[0]?.eventDate ?? null,
  };
}

export async function materializeRecurringEntriesForRange(
  context: CurrentWorkspaceContext,
  input: MaterializeRecurringEntriesInput,
) {
  const range = clampMaterializationRangeToCurrentMonth(input);

  if (!range) {
    return {
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
    };
  }

  const recurringEntries = await listRecurringEntries(context);
  const activeEntries = recurringEntries.filter(
    (entry) =>
      entry.active &&
      entry.versions.length > 0 &&
      (!input.recurringEntryIds || input.recurringEntryIds.includes(entry.id)),
  );

  if (activeEntries.length === 0) {
    return {
      createdCount: 0,
      updatedCount: 0,
      deletedCount: 0,
    };
  }

  const months = listMonthStringsBetween(range.startMonth, range.endMonth);
  const desiredRows: RecurringGeneratedRowSeed[] = [];

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

      const amount = Number(version.amount);
      const normalized = normalizeGeneratedAmount({
        amount,
        currency: version.currency,
        workspaceCurrency: context.baseCurrency,
        normalizationMode: version.normalizationMode,
      });

      desiredRows.push({
        sourceId: entry.id,
        eventDate: month,
        eventKind: entry.eventKind,
        title: entry.title,
        originalCurrency: version.currency,
        originalAmount: normalized.originalAmount.toFixed(6),
        workspaceCurrency: context.baseCurrency,
        normalizedAmount: normalized.normalizedAmount.toFixed(6),
        normalizationRate: normalized.normalizationRate.toFixed(8),
        normalizationRateSource: normalized.normalizationRateSource,
        payerMemberId: entry.payerMemberId,
        classificationType: entry.classificationType,
        category: entry.category,
      });
    }
  }

  return withRecurringMaterializationLock(context, async (tx) => {
    const existingRows = await tx
      .select({
        id: manualEntries.id,
        sourceId: manualEntries.sourceId,
        eventDate: manualEntries.eventDate,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "recurring_generated"),
          gte(manualEntries.eventDate, range.startMonth),
          lte(manualEntries.eventDate, range.endMonth),
          inArray(
            manualEntries.sourceId,
            activeEntries.map((entry) => entry.id),
          ),
        ),
      );

    const existingByKey = new Map<string, ExistingGeneratedManualEntryRow>();

    for (const row of existingRows) {
      if (!row.sourceId || !row.eventDate) {
        continue;
      }

      existingByKey.set(recurringGeneratedKey(row.sourceId, row.eventDate), row);
    }

    const affectedManualEntryIds = new Set<string>();
    let createdCount = 0;
    let updatedCount = 0;

    for (const row of desiredRows) {
      const key = recurringGeneratedKey(row.sourceId, row.eventDate);
      const existingRow = existingByKey.get(key);

      if (existingRow) {
        await tx
          .update(manualEntries)
          .set({
            eventKind: row.eventKind,
            title: row.title,
            originalCurrency: row.originalCurrency,
            originalAmount: row.originalAmount,
            workspaceCurrency: row.workspaceCurrency,
            normalizedAmount: row.normalizedAmount,
            normalizationRate: row.normalizationRate,
            normalizationRateSource: row.normalizationRateSource,
            payerMemberId: row.payerMemberId,
            classificationType: row.classificationType,
            category: row.category,
            updatedAt: new Date(),
          })
          .where(eq(manualEntries.id, existingRow.id));

        existingByKey.delete(key);
        affectedManualEntryIds.add(existingRow.id);
        updatedCount += 1;
        continue;
      }

      const [createdRow] = await tx
        .insert(manualEntries)
        .values({
          workspaceId: context.workspaceId,
          sourceType: "recurring_generated",
          sourceId: row.sourceId,
          eventKind: row.eventKind,
          title: row.title,
          originalCurrency: row.originalCurrency,
          originalAmount: row.originalAmount,
          workspaceCurrency: row.workspaceCurrency,
          normalizedAmount: row.normalizedAmount,
          normalizationRate: row.normalizationRate,
          normalizationRateSource: row.normalizationRateSource,
          payerMemberId: row.payerMemberId,
          classificationType: row.classificationType,
          category: row.category,
          eventDate: row.eventDate,
        })
        .returning({
          id: manualEntries.id,
        });

      affectedManualEntryIds.add(createdRow.id);
      createdCount += 1;
    }

    const staleRows = Array.from(existingByKey.values());
    const staleManualEntryIds = staleRows.map((row) => row.id);

    if (staleManualEntryIds.length > 0) {
      await deleteManualEntryRows(tx, staleManualEntryIds);
      staleManualEntryIds.forEach((id) => affectedManualEntryIds.add(id));
    }

    if (affectedManualEntryIds.size > 0) {
      await syncManualEntryExpenseEvents(
        context,
        Array.from(affectedManualEntryIds),
        tx,
      );
    }

    return {
      createdCount,
      updatedCount,
      deletedCount: staleManualEntryIds.length,
    };
  });
}

async function deleteRecurringGeneratedEntriesFromMonth(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
  startMonth: string,
) {
  const normalizedStartMonth = normalizeMonthString(startMonth);

  return withRecurringMaterializationLock(context, async (tx) => {
    const rows = await tx
      .select({
        id: manualEntries.id,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "recurring_generated"),
          eq(manualEntries.sourceId, recurringEntryId),
          gte(manualEntries.eventDate, normalizedStartMonth),
        ),
      );

    const manualEntryIds = rows.map((row) => row.id);

    if (manualEntryIds.length === 0) {
      return {
        deletedCount: 0,
      };
    }

    await deleteManualEntryRows(tx, manualEntryIds);
    await syncManualEntryExpenseEvents(context, manualEntryIds, tx);

    return {
      deletedCount: manualEntryIds.length,
    };
  });
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
  const category = normalizeOptionalWorkspaceCategoryName(input.category);
  const notes = normalizeOptionalText(input.notes);
  const effectiveStartMonth = normalizeMonthString(input.effectiveStartMonth);
  const currency = normalizeCurrencyCode(input.currency);

  validateRecurringClassification({
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId);
  const savedCategory = await assertWorkspaceCategory(context, category, db);

  const entry = await db.transaction(async (tx) => {
    const [entry] = await tx
      .insert(manualRecurringExpenses)
      .values({
        workspaceId: context.workspaceId,
        title: input.title.trim(),
        eventKind: input.eventKind,
        payerMemberId,
        classificationType: input.classificationType,
        category: savedCategory,
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

  if (effectiveStartMonth <= currentMonthString()) {
    await materializeRecurringEntriesForRange(context, {
      startMonth: effectiveStartMonth,
      endMonth: currentMonthString(),
      recurringEntryIds: [entry.id],
    });
  }

  return entry;
}

export async function deleteRecurringEntry(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
) {
  await assertWorkspaceRecurringEntry(context, recurringEntryId);

  await withRecurringMaterializationLock(context, async (tx) => {
    const generatedRows = await tx
      .select({
        id: manualEntries.id,
      })
      .from(manualEntries)
      .where(
        and(
          eq(manualEntries.workspaceId, context.workspaceId),
          eq(manualEntries.sourceType, "recurring_generated"),
          eq(manualEntries.sourceId, recurringEntryId),
        ),
      );

    const manualEntryIds = generatedRows.map((row) => row.id);

    if (manualEntryIds.length > 0) {
      await deleteManualEntryRows(tx, manualEntryIds);
      await syncManualEntryExpenseEvents(context, manualEntryIds, tx);
    }

    await tx
      .delete(recurringEntryVersions)
      .where(eq(recurringEntryVersions.recurringEntryId, recurringEntryId));

    await tx
      .delete(manualRecurringExpenses)
      .where(eq(manualRecurringExpenses.id, recurringEntryId));
  });

  return {
    recurringEntryId,
  };
}

export async function updateRecurringEntry(
  context: CurrentWorkspaceContext,
  recurringEntryId: string,
  input: UpdateRecurringEntryInput,
) {
  const db = getDb();
  const payerMemberId = normalizeOptionalText(input.payerMemberId);
  const category = normalizeOptionalWorkspaceCategoryName(input.category);

  await assertWorkspaceRecurringEntry(context, recurringEntryId);
  validateRecurringClassification({
    classificationType: input.classificationType,
    payerMemberId,
  });
  await assertWorkspaceMember(context, payerMemberId);
  const savedCategory = await assertWorkspaceCategory(context, category, db);

  await db
    .update(manualRecurringExpenses)
    .set({
      title: input.title.trim(),
      eventKind: input.eventKind,
      payerMemberId,
      classificationType: input.classificationType,
      category: savedCategory,
      active: input.active,
      updatedAt: new Date(),
    })
    .where(eq(manualRecurringExpenses.id, recurringEntryId));

  if (input.active) {
    const bounds = await getRecurringGeneratedEntryBounds(context, recurringEntryId, db);
    const startMonth = bounds.earliestVersionMonth;
    const currentMonth = currentMonthString();
    const endMonth =
      bounds.latestGeneratedMonth && bounds.latestGeneratedMonth > currentMonth
        ? bounds.latestGeneratedMonth
        : currentMonth;

    if (startMonth && startMonth <= endMonth) {
      await materializeRecurringEntriesForRange(context, {
        startMonth,
        endMonth,
        recurringEntryIds: [recurringEntryId],
        allowFutureMonths: true,
      });
    }
  } else {
    await deleteRecurringGeneratedEntriesFromMonth(
      context,
      recurringEntryId,
      currentMonthString(),
    );
  }

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

  const bounds = await getRecurringGeneratedEntryBounds(context, recurringEntry.id, db);

  if (bounds.latestGeneratedMonth && bounds.latestGeneratedMonth >= effectiveStartMonth) {
    await materializeRecurringEntriesForRange(context, {
      startMonth: effectiveStartMonth,
      endMonth: bounds.latestGeneratedMonth,
      recurringEntryIds: [recurringEntry.id],
      allowFutureMonths: true,
    });
  }

  return {
    recurringEntryId: recurringEntry.id,
  };
}

export async function generateRecurringEntriesForPeriod(
  context: CurrentWorkspaceContext,
  input: GenerateEntriesInput,
) {
  const result = await materializeRecurringEntriesForRange(context, {
    ...input,
    allowFutureMonths: true,
  });

  return {
    createdCount: result.createdCount,
  };
}

export async function getRecurringPageData(
  context: CurrentWorkspaceContext,
  input?: Partial<GenerateEntriesInput>,
) {
  const startMonth = input?.startMonth ? normalizeMonthString(input.startMonth) : currentMonthString();
  const endMonth = input?.endMonth ? normalizeMonthString(input.endMonth) : currentMonthString();
  assertMonthRange(startMonth, endMonth);

  await materializeRecurringEntriesForRange(context, {
    startMonth,
    endMonth,
  });

  const [members, categories, recurringEntries, generatedEntries] = await Promise.all([
    listWorkspaceMembers(context),
    listWorkspaceCategoryNames(context),
    listRecurringEntries(context),
    listGeneratedManualEntries(context, {
      startMonth,
      endMonth,
    }),
  ]);

  return {
    workspaceCurrency: context.baseCurrency,
    members,
    categories,
    recurringEntries,
    generatedEntries,
  };
}

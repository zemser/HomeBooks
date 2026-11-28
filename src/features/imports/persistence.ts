import { transactionIdentity } from "./identity";
import { canAutoApplyMerchantRule, merchantRuleAttribution } from "@/features/expenses/merchant-rules";
import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { getDb, withDbTransaction as runDbTransaction, type DbExecutor } from "@/db";
import {
  classificationRules,
  financialAccounts,
  imports,
  importRows,
  importSources,
  importTemplates,
  transactionClassifications,
  transactions,
  users,
  workspaceMembers,
} from "@/db/schema";
import { normalizeMerchantRuleValue } from "@/features/expenses/suggestions";
import {
  compatibilityMemberOwnerId,
} from "@/features/expenses/payer";
import { getSupportedBankImportCatalog } from "@/features/imports/catalog";
import { parseBankWorkbookWithMonthlyRates } from "@/features/imports/parse-bank-workbook";
import { backfillImportedFxForWorkspace } from "@/features/currency/backfill-imported-fx";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import type {
  ParsedBankStatement,
  ParsedBankTransaction,
  WorkbookData,
} from "@/features/imports/types";
import { isEffectivelyEmptyRow, normalizeRow } from "@/features/imports/utils";
import {
  buildImportStoragePath,
  deleteImportFileAfterSuccessfulPersistence,
  writeImportFile,
} from "@/lib/storage/import-files";

type CurrentImportContext = {
  workspaceId: string;
  userId: string;
  memberId: string;
  baseCurrency: string;
  fxPolicy?: import("@/db/schema").ValuationPolicy;
};

type ActiveExactClassificationRule = {
  matchValue: string;
  classificationType: "personal" | "shared" | "income" | "transfer" | "ignore";
  personalOwnerMemberId: string | null;
  paidByMemberId: string | null;
  receivedByMemberId: string | null;
  splitForSettlement: boolean;
  category: string | null;
  categoryId: string | null;
};

export function resolveImportAccountOwnerMemberId(input: {
  requestedAccountOwnerMemberId?: string | null;
  existingOwnerMemberId?: string | null;
  hasExistingAccount: boolean;
  currentMemberId: string;
}) {
  if (input.requestedAccountOwnerMemberId !== undefined) {
    return input.requestedAccountOwnerMemberId;
  }

  if (input.hasExistingAccount) {
    return input.existingOwnerMemberId ?? null;
  }

  return input.currentMemberId;
}

type RetryableFailedImport = {
  id: string;
  storagePath: string;
};

export type SavedImportSummary = {
  id: string;
  originalFilename: string;
  importStatus: string;
  createdAt: string;
  completedAt: string | null;
  templateName: string | null;
  sourceName: string | null;
  transactionCount: number;
  reviewedTransactionCount: number;
  manuallyReviewedCount: number;
  ruleAppliedCount: number;
  reviewPendingCount: number;
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
  accountId: string | null;
  accountLabel: string | null;
  accountOwnerMemberId: string | null;
  accountOwnerName: string | null;
};

export type SaveImportResult =
  | {
      status: "saved";
      pendingFxCount: number;
      importId: string;
      transactionCount: number;
      duplicateTransactionCount: number;
      automaticRuleCount: number;
      importStatus: string;
      updatedCount: number;
      duplicateOfImportId?: undefined;
    }
  | {
      status: "duplicate";
      importId: string;
      transactionCount: number;
      duplicateTransactionCount: number;
      automaticRuleCount: number;
      importStatus: string;
      updatedCount: number;
      duplicateOfImportId: string;
    };

function hashBuffer(fileBuffer: Buffer) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}

export async function findExistingBankFileImport(
  workspaceId: string,
  checksum: string,
  db: DbExecutor,
) {
  const existingImport = await db.query.imports.findFirst({
    where: and(
      eq(imports.workspaceId, workspaceId),
      eq(imports.fileChecksum, checksum),
      eq(imports.type, "bank"),
    ),
  });

  if (!existingImport) return null;

  const existingTransactionCount = await db.$count(
    transactions,
    eq(transactions.importId, existingImport.id),
  );

  if (existingImport.importStatus === "failed" && existingTransactionCount === 0) {
    return null;
  }

  return {
    id: existingImport.id,
    originalFilename: existingImport.originalFilename,
    createdAt: existingImport.createdAt.toISOString(),
  };
}

export class ImportRowReviewError extends Error {}

export type ImportRowDecisions = Record<string, "keep" | "skip">;

export async function analyzeParsedBankImport(input: {
  context: CurrentImportContext;
  parsed: ParsedBankStatement;
  fileChecksum?: string;
  rowDecisions?: ImportRowDecisions;
  accountOwnerMemberId?: string | null;
  db?: DbExecutor;
}) {
  const db = input.db ?? getDb();
  const importCatalog = await getSupportedBankImportCatalog(db);
  const templateRecord = importCatalog.get(input.parsed.templateId);

  if (!templateRecord) {
    throw new Error(`No seeded template exists for ${input.parsed.templateId}`);
  }

  const accountLabel =
    input.parsed.accountLabel?.trim() || `${templateRecord.sourceName} imported account`;
  const existingAccount = await db.query.financialAccounts.findFirst({ where: and(
    eq(financialAccounts.workspaceId, input.context.workspaceId),
    eq(financialAccounts.importSourceId, templateRecord.sourceId),
    eq(financialAccounts.displayName, accountLabel),
    eq(financialAccounts.externalAccountLabel, accountLabel),
  ) });
  const accountOwnerMemberId = resolveImportAccountOwnerMemberId({
    requestedAccountOwnerMemberId: input.accountOwnerMemberId,
    existingOwnerMemberId: existingAccount?.ownerMemberId ?? null,
    hasExistingAccount: Boolean(existingAccount),
    currentMemberId: input.context.memberId,
  });
  const identities = input.parsed.transactions.map((transaction) =>
    transactionIdentity({
      workspaceId: input.context.workspaceId,
      sourceId: templateRecord.sourceId,
      accountLabel,
      transaction,
    }, input.parsed.templateId),
  );
  const transactionDedupeHashes = [...new Set(identities.flatMap(({ hash, aliases }) => [hash, ...aliases]))];
  const [existingHashRows, activeRuleRows] = await Promise.all([
    transactionDedupeHashes.length > 0
      ? db
          .select({ id: transactions.id, dedupeHash: transactions.dedupeHash })
          .from(transactions)
          .where(
            and(
              eq(transactions.workspaceId, input.context.workspaceId),
              inArray(transactions.transactionDate, [...new Set(input.parsed.transactions.map(row => row.transactionDate))]),
              sql`split_part(${transactions.dedupeHash}, '@', 1) = any(${sql.param(transactionDedupeHashes)}::text[])`,
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        matchValue: classificationRules.matchValue,
        classificationType: classificationRules.defaultClassificationType,
        personalOwnerMemberId: classificationRules.defaultPersonalOwnerMemberId,
        paidByMemberId: classificationRules.defaultPaidByMemberId,
        receivedByMemberId: classificationRules.defaultReceivedByMemberId,
        splitForSettlement: classificationRules.defaultSplitForSettlement,
        category: classificationRules.defaultCategory,
        categoryId: classificationRules.defaultCategoryId,
      })
      .from(classificationRules)
      .where(
        and(
          eq(classificationRules.workspaceId, input.context.workspaceId),
          eq(classificationRules.active, true),
          eq(classificationRules.matchType, "exact"),
        ),
      )
      .orderBy(asc(classificationRules.priority), asc(classificationRules.createdAt)),
  ]);
  const existingIds = new Map<string, string[]>();
  for (const { id, dedupeHash } of existingHashRows) {
    const [baseHash] = dedupeHash.split("@");
    const ids = existingIds.get(baseHash) ?? [];
    ids.push(id);
    existingIds.set(baseHash, ids);
  }
  const incomingCounts = new Map<string, number>();
  const claims = new Map<string, number>();
  const matchesByRow = identities.map(({ hash, aliases }) => {
    incomingCounts.set(hash, (incomingCounts.get(hash) ?? 0) + 1);
    const ids = [hash, ...aliases].flatMap(alias => existingIds.get(alias) ?? []).sort();
    for (const id of ids) claims.set(id, (claims.get(id) ?? 0) + 1);
    return ids;
  });
  const activeRuleByMatch = new Map<string, ActiveExactClassificationRule>();

  for (const rule of activeRuleRows) {
    if (!activeRuleByMatch.has(rule.matchValue)) {
      activeRuleByMatch.set(rule.matchValue, rule);
    }
  }

  const transactionPlans = input.parsed.transactions.map((transaction, index) => {
    const { hash } = identities[index];
    const matches = matchesByRow[index];
    const ambiguous = (incomingCounts.get(hash) ?? 0) > 1 || matches.length > 1 ||
      matches.some(id => (claims.get(id) ?? 0) > 1);
    const reviewKey = ambiguous ? createHash("sha256").update(JSON.stringify([
      input.fileChecksum ?? null, hash, transaction.sourceSheetName, transaction.sourceRowIndex, matches,
    ])).digest("hex") : null;
    const decision = reviewKey ? input.rowDecisions?.[reviewKey] : undefined;
    const duplicate = ambiguous ? decision === "skip" : matches.length === 1;
    const dedupeHash = decision === "keep" ? `${hash}@${reviewKey}` : hash;
    const merchantValue = transaction.merchantRaw?.trim();
    const matchedRule = !duplicate && merchantValue
      ? activeRuleByMatch.get(normalizeMerchantRuleValue(merchantValue)) ?? null
      : null;

    return { transaction, index, dedupeHash, duplicate, ambiguous, matchedRule, decision, reviewKey, existingMatchCount: matches.length };
  });

  const ambiguousRows = transactionPlans.flatMap(({ transaction, reviewKey, existingMatchCount, matchedRule }) =>
    reviewKey ? [{
      key: reviewKey,
      sheet: transaction.sourceSheetName,
      row: transaction.sourceRowIndex + 1,
      merchant: transaction.merchantRaw,
      date: transaction.transactionDate,
      amount: transaction.settlementAmount ?? transaction.originalAmount,
      currency: transaction.settlementCurrency ?? transaction.originalCurrency,
      existingMatchCount,
      autoWithOwner: Boolean(matchedRule && canAutoApplyMerchantRule(matchedRule, "confirmed-owner")),
      autoWithoutOwner: Boolean(matchedRule && canAutoApplyMerchantRule(matchedRule, null)),
    }] : []
  );
  if (input.rowDecisions !== undefined) {
    const validKeys = new Set(ambiguousRows.map(row => row.key));
    if (Object.keys(input.rowDecisions).some(key => !validKeys.has(key)) ||
        ambiguousRows.some(row => !["keep", "skip"].includes(input.rowDecisions![row.key]))) {
      throw new ImportRowReviewError("Matching purchases changed or still need a decision. Preview the statement again and review each matching row.");
    }
  }

  return {
    templateRecord,
    accountLabel,
    transactionPlans,
    transactionCount: transactionPlans.length,
    ambiguousRows,
    newTransactionCount: transactionPlans.filter((item) => !item.duplicate && (!item.ambiguous || item.decision === "keep")).length,
    duplicateTransactionCount: transactionPlans.filter((item) => item.duplicate).length,
    accountOwnerMemberId,
    automaticRuleCount: transactionPlans.filter((item) => (!item.ambiguous || item.decision === "keep") && item.matchedRule && canAutoApplyMerchantRule(item.matchedRule, accountOwnerMemberId)).length,
    automaticRuleCountWithOwner: transactionPlans.filter((item) => (!item.ambiguous || item.decision === "keep") && item.matchedRule && canAutoApplyMerchantRule(item.matchedRule, "confirmed-owner")).length,
    automaticRuleCountWithoutOwner: transactionPlans.filter((item) => (!item.ambiguous || item.decision === "keep") && item.matchedRule && canAutoApplyMerchantRule(item.matchedRule, null)).length,
  };
}

function createImportRowStatusMap(input: {
  workbook: WorkbookData;
  parsedTransactions: ParsedBankTransaction[];
  templateId: string;
}) {
  const parsedRows = new Map(
    input.parsedTransactions.map((transaction) => [
      `${transaction.sourceSheetName}:${transaction.sourceRowIndex}`,
      transaction,
    ]),
  );

  return input.workbook.sheets.flatMap((sheet) =>
    sheet.rows.flatMap((row, rowIndex) => {
      if (isEffectivelyEmptyRow(row)) {
        return [];
      }

      const parsedTransaction = parsedRows.get(`${sheet.name}:${rowIndex}`);

      return [
        {
          rowIndex,
          sheetName: sheet.name,
          sectionName: parsedTransaction?.statementSection ?? null,
          parseStatus: parsedTransaction ? "parsed" : "ignored",
          parseError: null,
          rawDataJson: {
            detectedTemplateId: input.templateId,
            rawValues: normalizeRow(row),
            parsedTransaction: parsedTransaction
              ? {
                  transactionDate: parsedTransaction.transactionDate,
                  bookingDate: parsedTransaction.bookingDate ?? null,
                  description: parsedTransaction.description,
                  merchantRaw: parsedTransaction.merchantRaw,
                  category: parsedTransaction.category ?? null,
                  originalAmount: parsedTransaction.originalAmount,
                  originalCurrency: parsedTransaction.originalCurrency,
                  settlementAmount: parsedTransaction.settlementAmount ?? null,
                  settlementCurrency: parsedTransaction.settlementCurrency ?? null,
                  statementSection: parsedTransaction.statementSection ?? null,
                  notes: parsedTransaction.notes ?? null,
                  cardLastFour: parsedTransaction.cardLastFour ?? null,
                  direction: parsedTransaction.direction,
                  sourceSheetName: parsedTransaction.sourceSheetName,
                  sourceRowIndex: parsedTransaction.sourceRowIndex,
                }
              : null,
          },
        },
      ];
    }),
  );
}

async function findOrCreateFinancialAccount(input: {
  workspaceId: string;
  accountOwnerMemberId: string | null;
  sourceId: string;
  accountLabel: string;
  db: DbExecutor;
}) {
  const displayName = input.accountLabel.trim() || "Imported account";
  const lockKey = JSON.stringify([input.workspaceId, input.sourceId, displayName]);
  await input.db.execute(sql`select pg_advisory_xact_lock(hashtext('bank_import_account'), hashtext(${lockKey}))`);
  const existing = await input.db.query.financialAccounts.findFirst({
    where: and(
      eq(financialAccounts.workspaceId, input.workspaceId),
      eq(financialAccounts.importSourceId, input.sourceId),
      eq(financialAccounts.displayName, displayName),
      eq(financialAccounts.externalAccountLabel, displayName),
    ),
  });

  if (existing) {
    // Persist ownership only alongside a successful import below.
    return { ...existing, ownerMemberId: input.accountOwnerMemberId };
  }

  const [created] = await input.db
    .insert(financialAccounts)
    .values({
      workspaceId: input.workspaceId,
      ownerMemberId: input.accountOwnerMemberId,
      accountType: "credit_card",
      displayName,
      importSourceId: input.sourceId,
      externalAccountLabel: displayName,
    })
    .returning();

  return created;
}

export async function listSavedImports(
  context: CurrentImportContext,
  input?: { type?: "bank" | "investment" },
  db: DbExecutor = getDb(),
) {
  const savedImports = await db
    .select({
      id: imports.id,
      originalFilename: imports.originalFilename,
      importStatus: imports.importStatus,
      createdAt: imports.createdAt,
      completedAt: imports.completedAt,
      templateName: importTemplates.templateName,
      sourceName: importSources.name,
    })
    .from(imports)
    .leftJoin(importTemplates, eq(importTemplates.id, imports.importTemplateId))
    .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
    .where(
      and(
        eq(imports.workspaceId, context.workspaceId),
        eq(imports.importStatus, "completed"),
        input?.type ? eq(imports.type, input.type) : undefined,
      ),
    )
    .orderBy(desc(imports.createdAt));

  if (savedImports.length === 0) {
    return [];
  }

  const importIds = savedImports.map((savedImport) => savedImport.id);
  const [transactionCounts, pendingReviewCounts, classificationCounts, transactionDateRanges, accountRows] = await Promise.all([
    db
      .select({
        importId: transactions.importId,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .where(inArray(transactions.importId, importIds))
      .groupBy(transactions.importId),
    db
      .select({
        importId: transactions.importId,
        count: sql<number>`count(*)::int`,
      })
      .from(transactions)
      .leftJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(
        and(
          inArray(transactions.importId, importIds),
          isNull(transactionClassifications.id),
        ),
      )
      .groupBy(transactions.importId),
    db
      .select({
        importId: transactions.importId,
        ruleAppliedCount: sql<number>`count(*) filter (where ${transactionClassifications.decidedBy} = 'rule')::int`,
        manuallyReviewedCount: sql<number>`count(*) filter (where ${transactionClassifications.decidedBy} <> 'rule')::int`,
      })
      .from(transactions)
      .innerJoin(
        transactionClassifications,
        eq(transactionClassifications.transactionId, transactions.id),
      )
      .where(inArray(transactions.importId, importIds))
      .groupBy(transactions.importId),
    db
      .select({
        importId: transactions.importId,
        earliestTransactionDate: sql<string | null>`min(${transactions.transactionDate})::text`,
        latestTransactionDate: sql<string | null>`max(${transactions.transactionDate})::text`,
      })
      .from(transactions)
      .where(inArray(transactions.importId, importIds))
      .groupBy(transactions.importId),
    db
      .select({
        importId: transactions.importId,
        accountId: sql<string | null>`min(${financialAccounts.id}::text)`,
        accountLabel: sql<string | null>`min(${financialAccounts.displayName})`,
        ownerMemberId: sql<string | null>`min(${financialAccounts.ownerMemberId}::text)`,
        ownerName: sql<string | null>`min(coalesce(nullif(btrim(${workspaceMembers.displayNameOverride}), ''), ${users.displayName}))`,
      })
      .from(transactions)
      .innerJoin(financialAccounts, eq(financialAccounts.id, transactions.accountId))
      .leftJoin(workspaceMembers, eq(workspaceMembers.id, financialAccounts.ownerMemberId))
      .leftJoin(users, eq(users.id, workspaceMembers.userId))
      .where(inArray(transactions.importId, importIds))
      .groupBy(transactions.importId),
  ]);
  const countByImportId = new Map(
    transactionCounts.map((item) => [item.importId, Number(item.count)]),
  );
  const pendingCountByImportId = new Map(
    pendingReviewCounts.map((item) => [item.importId, Number(item.count)]),
  );
  const classificationCountByImportId = new Map(
    classificationCounts.map((item) => [
      item.importId,
      {
        ruleAppliedCount: Number(item.ruleAppliedCount),
        manuallyReviewedCount: Number(item.manuallyReviewedCount),
      },
    ]),
  );
  const dateRangeByImportId = new Map(
    transactionDateRanges.map((item) => [
      item.importId,
      {
        earliestTransactionDate: item.earliestTransactionDate,
        latestTransactionDate: item.latestTransactionDate,
      },
    ]),
  );
  const accountByImportId = new Map(accountRows.map((item) => [item.importId, item]));

  return savedImports.map<SavedImportSummary>((savedImport) => ({
    ...(() => {
      const transactionCount = countByImportId.get(savedImport.id) ?? 0;
      const reviewPendingCount = pendingCountByImportId.get(savedImport.id) ?? 0;
      const classificationCount = classificationCountByImportId.get(savedImport.id);
      const dateRange = dateRangeByImportId.get(savedImport.id);
      const account = accountByImportId.get(savedImport.id);

      return {
        transactionCount,
        reviewedTransactionCount: Math.max(transactionCount - reviewPendingCount, 0),
        manuallyReviewedCount: classificationCount?.manuallyReviewedCount ?? 0,
        ruleAppliedCount: classificationCount?.ruleAppliedCount ?? 0,
        reviewPendingCount,
        earliestTransactionDate: dateRange?.earliestTransactionDate ?? null,
        latestTransactionDate: dateRange?.latestTransactionDate ?? null,
        accountId: account?.accountId ?? null,
        accountLabel: account?.accountLabel ?? null,
        accountOwnerMemberId: account?.ownerMemberId ?? null,
        accountOwnerName: account?.ownerName ?? null,
      };
    })(),
    id: savedImport.id,
    originalFilename: savedImport.originalFilename,
    importStatus: savedImport.importStatus,
    createdAt: savedImport.createdAt.toISOString(),
    completedAt: savedImport.completedAt?.toISOString() ?? null,
    templateName: savedImport.templateName,
    sourceName: savedImport.sourceName,
  }));
}

export async function persistBankImport(input: {
  workbook: WorkbookData;
  originalFilename: string;
  fileBuffer: Buffer;
  rowDecisions?: ImportRowDecisions;
  accountOwnerMemberId?: string | null;
  context: CurrentImportContext;
}, withDbTransaction: typeof runDbTransaction = runDbTransaction) {
  const checksum = hashBuffer(input.fileBuffer);
  const duplicateCheck = await withDbTransaction(input.context.userId, async (db) => {
    const existingImport = await db.query.imports.findFirst({
      where: and(
        eq(imports.workspaceId, input.context.workspaceId),
        eq(imports.fileChecksum, checksum),
        eq(imports.type, "bank"),
      ),
    });

    if (!existingImport) return null;

    const existingTransactionCount = await db.$count(
      transactions,
      eq(transactions.importId, existingImport.id),
    );

    if (existingImport.importStatus === "failed" && existingTransactionCount === 0) {
      return {
        retryImport: {
          id: existingImport.id,
          storagePath: existingImport.storagePath,
        } satisfies RetryableFailedImport,
      };
    }

    return {
      duplicate: {
        status: "duplicate" as const,
        importId: existingImport.id,
        duplicateOfImportId: existingImport.id,
        transactionCount: existingTransactionCount,
        duplicateTransactionCount: existingTransactionCount,
        automaticRuleCount: 0,
        importStatus: existingImport.importStatus,
        updatedCount: 0,
      },
    };
  });

  if (duplicateCheck?.duplicate) {
    const fxRepair = input.context.fxPolicy === "previous-month-v1" ? { updatedCount: 0 }
      : await withDbTransaction(input.context.userId, db => backfillImportedFxForWorkspace(input.context, db));
    return { ...duplicateCheck.duplicate, updatedCount: fxRepair.updatedCount };
  }
  const retryImport = duplicateCheck?.retryImport ?? null;

  const { fxRepair, initialPreview } = await withDbTransaction(input.context.userId, async db => {
    const fxRepair = input.context.fxPolicy === "previous-month-v1" ? { updatedCount: 0 }
      : await backfillImportedFxForWorkspace(input.context, db);
    const preview = await parseBankWorkbookWithMonthlyRates({
      workbook: input.workbook, workspaceCurrency: input.context.baseCurrency, policy: input.context.fxPolicy, db,
    });
    return { fxRepair, initialPreview: preview };
  });
  let preview = initialPreview;
  let importPlan = await withDbTransaction(input.context.userId, (db) =>
    analyzeParsedBankImport({
      context: input.context,
      parsed: preview.parsed,
      fileChecksum: checksum,
      rowDecisions: input.rowDecisions ?? {},
      accountOwnerMemberId: input.accountOwnerMemberId ?? null,
      db,
    }),
  );
  const { accountLabel, templateRecord } = importPlan;
  const account = await withDbTransaction(input.context.userId, async (db) => {
    if (input.accountOwnerMemberId) {
      const member = await db.query.workspaceMembers.findFirst({ where: and(
        eq(workspaceMembers.workspaceId, input.context.workspaceId),
        eq(workspaceMembers.id, input.accountOwnerMemberId), eq(workspaceMembers.isActive, true),
      ) });
      if (!member) throw new Error("Account owner must be an active workspace member.");
    }
    return findOrCreateFinancialAccount({
      workspaceId: input.context.workspaceId,
      accountOwnerMemberId: input.accountOwnerMemberId ?? null,
      sourceId: templateRecord.sourceId,
      accountLabel,
      db,
    });
  });

  const importId = retryImport?.id ?? randomUUID();
  const storagePath =
    retryImport?.storagePath
    ?? buildImportStoragePath({
      workspaceId: input.context.workspaceId,
      importId,
      filename: input.originalFilename,
    });
  const startedAt = new Date();

  await withDbTransaction(input.context.userId, async (db) => {
    if (retryImport) {
      await db.delete(importRows).where(eq(importRows.importId, importId));
      await db
        .update(imports)
        .set({
          uploadedByUserId: input.context.userId,
          importSourceId: templateRecord.sourceId,
          importTemplateId: templateRecord.templateId,
          fileKind: input.workbook.fileKind,
          originalFilename: input.originalFilename,
          storagePath,
          fileChecksum: checksum,
          importStatus: "processing",
          startedAt,
          completedAt: null,
          errorSummary: null,
          updatedAt: new Date(),
        })
        .where(eq(imports.id, importId));
      return;
    }

    await db.insert(imports).values({
      id: importId,
      workspaceId: input.context.workspaceId,
      uploadedByUserId: input.context.userId,
      importSourceId: templateRecord.sourceId,
      importTemplateId: templateRecord.templateId,
      type: "bank",
      fileKind: input.workbook.fileKind,
      originalFilename: input.originalFilename,
      storagePath,
      fileChecksum: checksum,
      importStatus: "processing",
      startedAt,
    });
  });

  try {
    await writeImportFile({
      storagePath,
      fileBuffer: input.fileBuffer,
      fileKind: input.workbook.fileKind,
    });

    const stagingRows = createImportRowStatusMap({
      workbook: input.workbook,
      parsedTransactions: preview.parsed.transactions,
      templateId: preview.parsed.templateId,
    });

    await withDbTransaction(input.context.userId, async (tx) => {
      await tx.update(financialAccounts)
        .set({ ownerMemberId: account.ownerMemberId, updatedAt: new Date() })
        .where(and(eq(financialAccounts.id, account.id), eq(financialAccounts.workspaceId, input.context.workspaceId)));
      // The account update above serializes overlapping saves. Re-evaluate identity
      // under the lock so two concurrent exports cannot create the same charge.
      preview = await parseBankWorkbookWithMonthlyRates({
        workbook: input.workbook, workspaceCurrency: input.context.baseCurrency, policy: input.context.fxPolicy, db: tx,
      });
      importPlan = await analyzeParsedBankImport({
        context: input.context, parsed: preview.parsed, accountOwnerMemberId: account.ownerMemberId, db: tx,
        fileChecksum: checksum, rowDecisions: input.rowDecisions ?? {},
      });
      const reviews = new Map(importPlan.transactionPlans.filter(item => item.decision).map(item => [
        JSON.stringify([item.transaction.sourceSheetName, item.transaction.sourceRowIndex]),
        { key: item.reviewKey, action: item.decision },
      ]));
      if (stagingRows.length > 0) {
        await tx.insert(importRows).values(
          stagingRows.map((row) => ({
            importId,
            rowIndex: row.rowIndex,
            sheetName: row.sheetName,
            sectionName: row.sectionName,
            rawDataJson: { ...row.rawDataJson, duplicateReview: reviews.get(JSON.stringify([row.sheetName, row.rowIndex])) },
            parseStatus: row.parseStatus,
            parseError: row.parseError,
          })),
        );
      }

      const newTransactionPlans = importPlan.transactionPlans.filter((item) => !item.duplicate);

      if (newTransactionPlans.length > 0) {
        const insertedTransactions = await tx
          .insert(transactions)
          .values(
            newTransactionPlans.map(({ transaction, index, dedupeHash }) => {
              const normalizedPreview = preview.previewTransactions[index];

              return {
                workspaceId: input.context.workspaceId,
                accountId: account.id,
                importId,
                transactionDate: transaction.transactionDate,
                bookingDate: transaction.bookingDate ?? null,
                statementSection: transaction.statementSection ?? null,
                description: transaction.description,
                merchantRaw: transaction.merchantRaw,
                originalCurrency: transaction.originalCurrency,
                originalAmount: transaction.originalAmount.toFixed(6),
                settlementCurrency: transaction.settlementCurrency ?? null,
                settlementAmount:
                  transaction.settlementAmount !== undefined
                    ? transaction.settlementAmount.toFixed(6)
                    : null,
                workspaceCurrency: normalizedPreview.workspaceCurrency,
                normalizedAmount: normalizedPreview.normalizedAmount.toFixed(6),
                normalizationRate: normalizedPreview.normalizationRate.toFixed(8),
                normalizationRateSource: normalizedPreview.normalizationRateSource,
                valuationState: normalizedPreview.valuationState,
                valuationPolicy: normalizedPreview.valuationPolicy,
                referenceMonth: normalizedPreview.referenceMonth,
                exchangeRateId: normalizedPreview.exchangeRateId,
                direction: transaction.direction,
                externalReference: null,
                dedupeHash,
              };
            }),
          )
          .returning({
            id: transactions.id,
          });
        const automaticClassifications = insertedTransactions.flatMap((transaction, index) => {
          const matchedRule = newTransactionPlans[index]?.matchedRule;
          if (!matchedRule) {
            return [];
          }

          if (!canAutoApplyMerchantRule(matchedRule, account.ownerMemberId)) return [];
          const attribution = merchantRuleAttribution(matchedRule.classificationType, account.ownerMemberId);

          return [
            {
              transactionId: transaction.id,
              classificationType: matchedRule.classificationType,
              memberOwnerId: compatibilityMemberOwnerId(
                matchedRule.classificationType,
                attribution,
              ),
              personalOwnerMemberId: attribution.personalOwnerMemberId,
              paidByMemberId: attribution.paidByMemberId,
              receivedByMemberId: attribution.receivedByMemberId,
              splitForSettlement: Boolean(matchedRule.splitForSettlement),
              category: matchedRule.category,
              categoryId: matchedRule.categoryId,
              confidence: null,
              decidedBy: "rule" as const,
              reviewedAt: null,
            },
          ];
        });

        if (automaticClassifications.length > 0) {
          await tx.insert(transactionClassifications).values(automaticClassifications);
          await syncTransactionExpenseEvents(
            input.context,
            automaticClassifications.map((classification) => classification.transactionId),
            tx,
          );
        }
      }

      await tx
        .update(imports)
        .set({
          importStatus: "completed",
          completedAt: new Date(),
          errorSummary: null,
        })
        .where(eq(imports.id, importId));
    });

    try {
      await deleteImportFileAfterSuccessfulPersistence(storagePath);
    } catch (cleanupError) {
      const cleanupMessage =
        cleanupError instanceof Error
          ? cleanupError.message
          : "Import source file cleanup failed";

      await withDbTransaction(input.context.userId, (db) =>
        db
          .update(imports)
          .set({
            importStatus: "failed",
            completedAt: new Date(),
            errorSummary: cleanupMessage,
          })
          .where(eq(imports.id, importId)),
      );

      throw cleanupError;
    }

    return {
      status: "saved" as const,
      pendingFxCount: preview.previewTransactions.filter(row => row.valuationState === "pending").length,
      importId,
      transactionCount: importPlan.newTransactionCount,
      duplicateTransactionCount: importPlan.duplicateTransactionCount,
      automaticRuleCount: importPlan.automaticRuleCount,
      importStatus: "completed",
      updatedCount: fxRepair.updatedCount,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import persistence failed";

    await withDbTransaction(input.context.userId, (db) =>
      db
        .update(imports)
        .set({
          importStatus: "failed",
          completedAt: new Date(),
          errorSummary: message,
        })
        .where(eq(imports.id, importId)),
    );

    throw error;
  }
}

import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import { getDb } from "@/db";
import {
  classificationRules,
  financialAccounts,
  imports,
  importRows,
  importSources,
  importTemplates,
  transactionClassifications,
  transactions,
} from "@/db/schema";
import { normalizeMerchantRuleValue } from "@/features/expenses/classifications";
import { ensureSupportedBankImportCatalog } from "@/features/imports/catalog";
import { parseBankWorkbookToPreview } from "@/features/imports/parse-bank-workbook";
import { syncTransactionExpenseEvents } from "@/features/reporting/expense-events";
import type { ParsedBankTransaction, WorkbookData } from "@/features/imports/types";
import { isEffectivelyEmptyRow, normalizeRow } from "@/features/imports/utils";
import { buildImportStoragePath, writeImportFile } from "@/lib/storage/import-files";

type CurrentImportContext = {
  workspaceId: string;
  userId: string;
  memberId: string;
  baseCurrency: string;
};

type ActiveExactClassificationRule = {
  matchValue: string;
  classificationType: "personal" | "shared" | "household" | "income" | "transfer" | "ignore";
  memberOwnerId: string | null;
  category: string | null;
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
};

export type SaveImportResult =
  | {
      status: "saved";
      importId: string;
      transactionCount: number;
      importStatus: string;
      duplicateOfImportId?: undefined;
    }
  | {
      status: "duplicate";
      importId: string;
      transactionCount: number;
      importStatus: string;
      duplicateOfImportId: string;
    };

function hashBuffer(fileBuffer: Buffer) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}

function buildTransactionDedupeHash(input: {
  workspaceId: string;
  sourceId: string;
  accountLabel: string;
  transaction: ParsedBankTransaction;
}) {
  const { transaction } = input;

  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: input.workspaceId,
        sourceId: input.sourceId,
        accountLabel: input.accountLabel,
        transactionDate: transaction.transactionDate,
        bookingDate: transaction.bookingDate ?? null,
        merchantRaw: transaction.merchantRaw,
        description: transaction.description,
        originalAmount: transaction.originalAmount,
        originalCurrency: transaction.originalCurrency,
        settlementAmount: transaction.settlementAmount ?? null,
        settlementCurrency: transaction.settlementCurrency ?? null,
        statementSection: transaction.statementSection ?? null,
        direction: transaction.direction,
      }),
    )
    .digest("hex");
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
  memberId: string;
  sourceId: string;
  accountLabel: string;
}) {
  const db = getDb();
  const displayName = input.accountLabel.trim() || "Imported account";
  const existing = await db.query.financialAccounts.findFirst({
    where: and(
      eq(financialAccounts.workspaceId, input.workspaceId),
      eq(financialAccounts.importSourceId, input.sourceId),
      eq(financialAccounts.displayName, displayName),
      eq(financialAccounts.externalAccountLabel, displayName),
    ),
  });

  if (existing) {
    return existing;
  }

  const [created] = await db
    .insert(financialAccounts)
    .values({
      workspaceId: input.workspaceId,
      ownerMemberId: input.memberId,
      accountType: "credit_card",
      displayName,
      importSourceId: input.sourceId,
      externalAccountLabel: displayName,
    })
    .returning();

  return created;
}

export async function listSavedImports(context: CurrentImportContext) {
  const db = getDb();
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
    .where(eq(imports.workspaceId, context.workspaceId))
    .orderBy(desc(imports.createdAt));

  if (savedImports.length === 0) {
    return [];
  }

  const transactionCounts = await Promise.all(
    savedImports.map(async (savedImport) => ({
      importId: savedImport.id,
      count: await db.$count(transactions, eq(transactions.importId, savedImport.id)),
    })),
  );
  const countByImportId = new Map(
    transactionCounts.map((item) => [item.importId, item.count]),
  );

  return savedImports.map<SavedImportSummary>((savedImport) => ({
    id: savedImport.id,
    originalFilename: savedImport.originalFilename,
    importStatus: savedImport.importStatus,
    createdAt: savedImport.createdAt.toISOString(),
    completedAt: savedImport.completedAt?.toISOString() ?? null,
    templateName: savedImport.templateName,
    sourceName: savedImport.sourceName,
    transactionCount: countByImportId.get(savedImport.id) ?? 0,
  }));
}

export async function persistBankImport(input: {
  workbook: WorkbookData;
  originalFilename: string;
  fileBuffer: Buffer;
  context: CurrentImportContext;
}) {
  const db = getDb();
  const checksum = hashBuffer(input.fileBuffer);
  const existingImport = await db.query.imports.findFirst({
    where: and(
      eq(imports.workspaceId, input.context.workspaceId),
      eq(imports.fileChecksum, checksum),
      eq(imports.type, "bank"),
    ),
  });

  if (existingImport) {
    const existingTransactionCount = await db.$count(
      transactions,
      eq(transactions.importId, existingImport.id),
    );

    return {
      status: "duplicate" as const,
      importId: existingImport.id,
      duplicateOfImportId: existingImport.id,
      transactionCount: existingTransactionCount,
      importStatus: existingImport.importStatus,
    };
  }

  const preview = parseBankWorkbookToPreview({
    workbook: input.workbook,
    workspaceCurrency: input.context.baseCurrency,
  });
  const importCatalog = await ensureSupportedBankImportCatalog();
  const templateRecord = importCatalog.get(preview.parsed.templateId);

  if (!templateRecord) {
    throw new Error(`No seeded template exists for ${preview.parsed.templateId}`);
  }

  const accountLabel =
    preview.parsed.accountLabel?.trim() || `${templateRecord.sourceName} imported account`;
  const account = await findOrCreateFinancialAccount({
    workspaceId: input.context.workspaceId,
    memberId: input.context.memberId,
    sourceId: templateRecord.sourceId,
    accountLabel,
  });

  const importId = randomUUID();
  const storagePath = buildImportStoragePath({
    workspaceId: input.context.workspaceId,
    importId,
    filename: input.originalFilename,
  });
  const startedAt = new Date();

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

  try {
    await writeImportFile({
      storagePath,
      fileBuffer: input.fileBuffer,
    });

    const stagingRows = createImportRowStatusMap({
      workbook: input.workbook,
      parsedTransactions: preview.parsed.transactions,
      templateId: preview.parsed.templateId,
    });

    await db.transaction(async (tx) => {
      const activeRuleRows = await tx
        .select({
          matchValue: classificationRules.matchValue,
          classificationType: classificationRules.defaultClassificationType,
          memberOwnerId: classificationRules.defaultMemberOwnerId,
          category: classificationRules.defaultCategory,
        })
        .from(classificationRules)
        .where(
          and(
            eq(classificationRules.workspaceId, input.context.workspaceId),
            eq(classificationRules.active, true),
            eq(classificationRules.matchType, "exact"),
          ),
        )
        .orderBy(asc(classificationRules.priority), asc(classificationRules.createdAt));
      const activeRuleByMatch = new Map<string, ActiveExactClassificationRule>();

      for (const rule of activeRuleRows) {
        if (!activeRuleByMatch.has(rule.matchValue)) {
          activeRuleByMatch.set(rule.matchValue, rule);
        }
      }

      if (stagingRows.length > 0) {
        await tx.insert(importRows).values(
          stagingRows.map((row) => ({
            importId,
            rowIndex: row.rowIndex,
            sheetName: row.sheetName,
            sectionName: row.sectionName,
            rawDataJson: row.rawDataJson,
            parseStatus: row.parseStatus,
            parseError: row.parseError,
          })),
        );
      }

      if (preview.parsed.transactions.length > 0) {
        const insertedTransactions = await tx
          .insert(transactions)
          .values(
            preview.parsed.transactions.map((transaction, index) => {
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
                direction: transaction.direction,
                externalReference: null,
                dedupeHash: buildTransactionDedupeHash({
                  workspaceId: input.context.workspaceId,
                  sourceId: templateRecord.sourceId,
                  accountLabel,
                  transaction,
                }),
              };
            }),
          )
          .returning({
            id: transactions.id,
            merchantRaw: transactions.merchantRaw,
          });
        const automaticClassifications = insertedTransactions.flatMap((transaction) => {
          const merchantValue = transaction.merchantRaw?.trim();

          if (!merchantValue) {
            return [];
          }

          const matchedRule = activeRuleByMatch.get(
            normalizeMerchantRuleValue(merchantValue),
          );

          if (!matchedRule) {
            return [];
          }

          return [
            {
              transactionId: transaction.id,
              classificationType: matchedRule.classificationType,
              memberOwnerId: matchedRule.memberOwnerId,
              category: matchedRule.category,
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

    return {
      status: "saved" as const,
      importId,
      transactionCount: preview.parsed.transactions.length,
      importStatus: "completed",
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import persistence failed";

    await db
      .update(imports)
      .set({
        importStatus: "failed",
        completedAt: new Date(),
        errorSummary: message,
      })
      .where(eq(imports.id, importId));

    throw error;
  }
}

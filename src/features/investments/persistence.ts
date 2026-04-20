import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, sql } from "drizzle-orm";

import { getDb } from "@/db";
import {
  investmentActivities,
  holdingSnapshots,
  imports,
  investmentAccounts,
  importSources,
  users,
  workspaceMembers,
} from "@/db/schema";
import { ensureExcellenceInvestmentImportSource } from "@/features/investments/catalog";
import {
  inferInvestmentAssetType,
  resolveInvestmentAssetType,
} from "@/features/investments/classification";
import { parseInvestmentWorkbookToPreview } from "@/features/investments/parse-investment-workbook";
import type {
  InvestmentAccountHoldingsSnapshot,
  InvestmentActivityType,
  InvestmentImportSummary,
  InvestmentPreviewActivity,
  InvestmentPreviewHolding,
  PersistedInvestmentActivity,
  SaveInvestmentImportResult,
} from "@/features/investments/types";
import type { WorkbookData } from "@/features/imports/types";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import {
  getInvestmentActivityTypeLabel,
  normalizeInvestmentAccountLabel,
} from "@/features/investments/utils";
import { buildImportStoragePath, writeImportFile } from "@/lib/storage/import-files";

const ACCOUNT_RESOLUTION_LOCK_NAMESPACE = 824301;
const SNAPSHOT_REPLACEMENT_LOCK_NAMESPACE = 824302;
const CHECKSUM_LOCK_NAMESPACE = 824303;
type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export class InvestmentImportValidationError extends Error {}

function hashBuffer(fileBuffer: Buffer) {
  return createHash("sha256").update(fileBuffer).digest("hex");
}

function normalizeAccountLabelForDisplay(value: string) {
  const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ");

  if (!normalized) {
    throw new InvestmentImportValidationError("Account label is required.");
  }

  return normalized;
}

async function acquireAdvisoryLock(
  tx: DbTransaction,
  namespace: number,
  key: string,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(${namespace}, hashtext(${key}))`);
}

function formatNumeric(value: number | null, scale: number) {
  return value === null ? null : value.toFixed(scale);
}

function toNullableNumber(value: string | number | null) {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addNullableNumber(current: number | null, next: number | null) {
  if (next === null) {
    return current;
  }

  return (current ?? 0) + next;
}

function buildHoldingSnapshotValues(input: {
  workspaceId: string;
  importId: string;
  investmentAccountId: string;
  snapshotDate: string;
  holdings: InvestmentPreviewHolding[];
}) {
  return input.holdings.map((holding) => {
    if (holding.marketValueIls === null) {
      throw new InvestmentImportValidationError(
        `Holding "${holding.assetName}" is missing an ILS market value.`,
      );
    }

    const computedCostBasis =
      holding.quantity !== null && holding.costBasisPrice !== null
        ? holding.quantity * holding.costBasisPrice
        : null;

    return {
      workspaceId: input.workspaceId,
      importId: input.importId,
      investmentAccountId: input.investmentAccountId,
      snapshotDate: input.snapshotDate,
      assetName: holding.assetName,
      assetSymbol: holding.securityId,
      assetType: inferInvestmentAssetType(holding.assetName, holding.securityId),
      quantity: formatNumeric(holding.quantity, 8),
      marketValue: formatNumeric(holding.marketValueIls, 6) ?? "0.000000",
      marketValueCurrency: "ILS",
      normalizedMarketValue: formatNumeric(holding.marketValueIls, 6) ?? "0.000000",
      costBasis: formatNumeric(computedCostBasis, 6),
      gainLoss: formatNumeric(holding.gainLossIls, 6),
    };
  });
}

function buildInvestmentActivityValues(input: {
  workspaceId: string;
  importId: string;
  investmentAccountId: string;
  activities: InvestmentPreviewActivity[];
}) {
  return input.activities
    .filter((activity) => activity.activityDate)
    .map((activity) => ({
      workspaceId: input.workspaceId,
      importId: input.importId,
      investmentAccountId: input.investmentAccountId,
      activityDate: activity.activityDate ?? new Date().toISOString().slice(0, 10),
      assetSymbol: activity.assetSymbol,
      assetName: activity.assetName,
      activityType: activity.activityType,
      quantity: formatNumeric(activity.quantity, 8),
      unitPrice: formatNumeric(activity.unitPrice, 8),
      totalAmount: formatNumeric(activity.totalAmount, 6),
      currency: activity.currency,
      normalizedAmount: formatNumeric(activity.normalizedAmount, 6),
    }));
}

function toActivityType(value: string) {
  return value as InvestmentActivityType;
}

function getActivityRange(input: {
  activityPeriodStart: string | null;
  activityPeriodEnd: string | null;
  activities: InvestmentPreviewActivity[];
}) {
  const datedActivities = input.activities
    .map((activity) => activity.activityDate)
    .filter((value): value is string => Boolean(value))
    .sort();

  return {
    startDate: input.activityPeriodStart ?? datedActivities[0] ?? null,
    endDate: input.activityPeriodEnd ?? datedActivities[datedActivities.length - 1] ?? null,
  };
}

async function findWorkspaceMemberOrThrow(input: {
  tx: DbTransaction,
  workspaceId: string;
  ownerMemberId: string;
}) {
  const member = await input.tx.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.id, input.ownerMemberId),
      eq(workspaceMembers.workspaceId, input.workspaceId),
    ),
    columns: {
      id: true,
    },
  });

  if (!member) {
    throw new InvestmentImportValidationError(
      "Selected owner was not found in the current workspace.",
    );
  }

  return member;
}

async function resolveInvestmentAccount(input: {
  tx: DbTransaction,
  workspaceId: string;
  ownerMemberId: string;
  sourceId: string;
  accountLabel: string;
}) {
  const displayName = normalizeAccountLabelForDisplay(input.accountLabel);
  const canonicalDisplayName = normalizeInvestmentAccountLabel(displayName);

  await acquireAdvisoryLock(
    input.tx,
    ACCOUNT_RESOLUTION_LOCK_NAMESPACE,
    [
      input.workspaceId,
      input.ownerMemberId,
      input.sourceId,
      canonicalDisplayName,
    ].join(":"),
  );

  const matches = await input.tx
    .select({
      id: investmentAccounts.id,
      displayName: investmentAccounts.displayName,
    })
    .from(investmentAccounts)
    .where(
      and(
        eq(investmentAccounts.workspaceId, input.workspaceId),
        eq(investmentAccounts.ownerMemberId, input.ownerMemberId),
        eq(investmentAccounts.importSourceId, input.sourceId),
        eq(investmentAccounts.canonicalDisplayName, canonicalDisplayName),
      ),
    );

  if (matches.length > 1) {
    throw new InvestmentImportValidationError(
      "Multiple investment accounts matched this owner and account label. Clean up the duplicate accounts before saving again.",
    );
  }

  if (matches[0]) {
    return {
      id: matches[0].id,
      displayName: matches[0].displayName,
    };
  }

  await input.tx
    .insert(investmentAccounts)
    .values({
      workspaceId: input.workspaceId,
      ownerMemberId: input.ownerMemberId,
      displayName,
      canonicalDisplayName,
      importSourceId: input.sourceId,
      accountCurrency: null,
    })
    .onConflictDoNothing({
      target: [
        investmentAccounts.workspaceId,
        investmentAccounts.ownerMemberId,
        investmentAccounts.importSourceId,
        investmentAccounts.canonicalDisplayName,
      ],
    });

  const createdOrExisting = await input.tx.query.investmentAccounts.findFirst({
    where: and(
      eq(investmentAccounts.workspaceId, input.workspaceId),
      eq(investmentAccounts.ownerMemberId, input.ownerMemberId),
      eq(investmentAccounts.importSourceId, input.sourceId),
      eq(investmentAccounts.canonicalDisplayName, canonicalDisplayName),
    ),
    columns: {
      id: true,
      displayName: true,
    },
  });

  if (!createdOrExisting) {
    throw new Error("Could not resolve the investment account for this workbook.");
  }

  return createdOrExisting;
}

async function upsertFailedInvestmentImport(input: {
  importId: string;
  workspaceId: string;
  userId: string;
  sourceId: string;
  fileKind: WorkbookData["fileKind"];
  originalFilename: string;
  storagePath: string;
  checksum: string;
  message: string;
}) {
  const db = getDb();

  await db
    .insert(imports)
    .values({
      id: input.importId,
      workspaceId: input.workspaceId,
      uploadedByUserId: input.userId,
      importSourceId: input.sourceId,
      importTemplateId: null,
      type: "investment",
      fileKind: input.fileKind,
      originalFilename: input.originalFilename,
      storagePath: input.storagePath,
      fileChecksum: input.checksum,
      importStatus: "failed",
      startedAt: new Date(),
      completedAt: new Date(),
      errorSummary: input.message,
    })
    .onConflictDoUpdate({
      target: imports.id,
      set: {
        uploadedByUserId: input.userId,
        importSourceId: input.sourceId,
        importTemplateId: null,
        fileKind: input.fileKind,
        originalFilename: input.originalFilename,
        storagePath: input.storagePath,
        fileChecksum: input.checksum,
        importStatus: "failed",
        completedAt: new Date(),
        errorSummary: input.message,
        updatedAt: new Date(),
      },
    });
}

export async function listInvestmentImports(
  context: CurrentWorkspaceContext,
): Promise<InvestmentImportSummary[]> {
  const db = getDb();
  const investmentImports = await db
    .select({
      id: imports.id,
      originalFilename: imports.originalFilename,
      importStatus: imports.importStatus,
      createdAt: imports.createdAt,
      completedAt: imports.completedAt,
      sourceName: importSources.name,
    })
    .from(imports)
    .leftJoin(importSources, eq(importSources.id, imports.importSourceId))
    .where(
      and(
        eq(imports.workspaceId, context.workspaceId),
        eq(imports.type, "investment"),
      ),
    )
    .orderBy(desc(imports.createdAt));

  if (investmentImports.length === 0) {
    return [];
  }

  const stats = await Promise.all(
    investmentImports.map(async (investmentImport) => {
      const [holdingCount, activityRow, snapshotRow] = await Promise.all([
        db.$count(holdingSnapshots, eq(holdingSnapshots.importId, investmentImport.id)),
        db
          .select({
            activityCount: sql<number>`count(*)`.as("activity_count"),
            activityPeriodStart: sql<string | null>`min(${investmentActivities.activityDate})`.as(
              "activity_period_start",
            ),
            activityPeriodEnd: sql<string | null>`max(${investmentActivities.activityDate})`.as(
              "activity_period_end",
            ),
          })
          .from(investmentActivities)
          .where(eq(investmentActivities.importId, investmentImport.id))
          .then((rows) => rows[0] ?? null),
        db.query.holdingSnapshots.findFirst({
          where: eq(holdingSnapshots.importId, investmentImport.id),
          columns: {
            snapshotDate: true,
          },
        }),
      ]);

      return {
        importId: investmentImport.id,
        holdingCount,
        activityCount: Number(activityRow?.activityCount ?? 0),
        activityPeriodStart: activityRow?.activityPeriodStart ?? null,
        activityPeriodEnd: activityRow?.activityPeriodEnd ?? null,
        snapshotDate: snapshotRow?.snapshotDate ?? null,
      };
    }),
  );
  const statsByImportId = new Map(stats.map((item) => [item.importId, item]));

  return investmentImports.map((investmentImport) => {
    const stat = statsByImportId.get(investmentImport.id);

    return {
      id: investmentImport.id,
      originalFilename: investmentImport.originalFilename,
      importStatus: investmentImport.importStatus,
      createdAt: investmentImport.createdAt.toISOString(),
      completedAt: investmentImport.completedAt?.toISOString() ?? null,
      sourceName: investmentImport.sourceName ?? null,
      holdingCount: stat?.holdingCount ?? 0,
      activityCount: stat?.activityCount ?? 0,
      snapshotDate: stat?.snapshotDate ?? null,
      activityPeriodStart: stat?.activityPeriodStart ?? null,
      activityPeriodEnd: stat?.activityPeriodEnd ?? null,
    };
  });
}

export async function listInvestmentActivities(
  context: CurrentWorkspaceContext,
): Promise<PersistedInvestmentActivity[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: investmentActivities.id,
      investmentAccountId: investmentActivities.investmentAccountId,
      accountDisplayName: investmentAccounts.displayName,
      ownerDisplayNameOverride: workspaceMembers.displayNameOverride,
      ownerUserDisplayName: users.displayName,
      activityDate: investmentActivities.activityDate,
      assetName: investmentActivities.assetName,
      assetSymbol: investmentActivities.assetSymbol,
      activityType: investmentActivities.activityType,
      quantity: investmentActivities.quantity,
      unitPrice: investmentActivities.unitPrice,
      totalAmount: investmentActivities.totalAmount,
      currency: investmentActivities.currency,
      normalizedAmount: investmentActivities.normalizedAmount,
      importId: imports.id,
      importOriginalFilename: imports.originalFilename,
      importCreatedAt: imports.createdAt,
    })
    .from(investmentActivities)
    .innerJoin(
      investmentAccounts,
      eq(investmentAccounts.id, investmentActivities.investmentAccountId),
    )
    .innerJoin(imports, eq(imports.id, investmentActivities.importId))
    .leftJoin(workspaceMembers, eq(workspaceMembers.id, investmentAccounts.ownerMemberId))
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(investmentActivities.workspaceId, context.workspaceId))
    .orderBy(
      desc(investmentActivities.activityDate),
      desc(imports.createdAt),
      asc(investmentAccounts.displayName),
      asc(investmentActivities.assetName),
    );

  return rows.map((row) => ({
    id: row.id,
    investmentAccountId: row.investmentAccountId,
    accountDisplayName: row.accountDisplayName,
    ownerDisplayName:
      row.ownerDisplayNameOverride?.trim() || row.ownerUserDisplayName?.trim() || null,
    activityDate: row.activityDate,
    assetName: row.assetName,
    assetSymbol: row.assetSymbol,
    activityType: toActivityType(row.activityType),
    activityTypeLabel: getInvestmentActivityTypeLabel(toActivityType(row.activityType)),
    quantity: toNullableNumber(row.quantity),
    unitPrice: toNullableNumber(row.unitPrice),
    totalAmount: toNullableNumber(row.totalAmount),
    currency: row.currency,
    normalizedAmount: toNullableNumber(row.normalizedAmount),
    importId: row.importId,
    importOriginalFilename: row.importOriginalFilename,
    importCreatedAt: row.importCreatedAt.toISOString(),
  }));
}

export async function listInvestmentAccountHoldings(
  context: CurrentWorkspaceContext,
): Promise<InvestmentAccountHoldingsSnapshot[]> {
  const db = getDb();
  const latestSnapshotDates = db
    .select({
      investmentAccountId: holdingSnapshots.investmentAccountId,
      latestSnapshotDate: sql<string>`max(${holdingSnapshots.snapshotDate})`.as(
        "latest_snapshot_date",
      ),
    })
    .from(holdingSnapshots)
    .where(eq(holdingSnapshots.workspaceId, context.workspaceId))
    .groupBy(holdingSnapshots.investmentAccountId)
    .as("latest_snapshot_dates");

  const rows = await db
    .select({
      accountId: investmentAccounts.id,
      accountDisplayName: investmentAccounts.displayName,
      ownerMemberId: investmentAccounts.ownerMemberId,
      ownerDisplayNameOverride: workspaceMembers.displayNameOverride,
      ownerUserDisplayName: users.displayName,
      sourceName: importSources.name,
      snapshotDate: holdingSnapshots.snapshotDate,
      importId: imports.id,
      importCreatedAt: imports.createdAt,
      importOriginalFilename: imports.originalFilename,
      assetName: holdingSnapshots.assetName,
      assetSymbol: holdingSnapshots.assetSymbol,
      assetType: holdingSnapshots.assetType,
      quantity: holdingSnapshots.quantity,
      marketValue: holdingSnapshots.marketValue,
      marketValueCurrency: holdingSnapshots.marketValueCurrency,
      normalizedMarketValue: holdingSnapshots.normalizedMarketValue,
      costBasis: holdingSnapshots.costBasis,
      gainLoss: holdingSnapshots.gainLoss,
    })
    .from(holdingSnapshots)
    .innerJoin(
      latestSnapshotDates,
      and(
        eq(holdingSnapshots.investmentAccountId, latestSnapshotDates.investmentAccountId),
        eq(holdingSnapshots.snapshotDate, latestSnapshotDates.latestSnapshotDate),
      ),
    )
    .innerJoin(investmentAccounts, eq(investmentAccounts.id, holdingSnapshots.investmentAccountId))
    .innerJoin(imports, eq(imports.id, holdingSnapshots.importId))
    .leftJoin(importSources, eq(importSources.id, investmentAccounts.importSourceId))
    .leftJoin(workspaceMembers, eq(workspaceMembers.id, investmentAccounts.ownerMemberId))
    .leftJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(holdingSnapshots.workspaceId, context.workspaceId))
    .orderBy(
      desc(holdingSnapshots.snapshotDate),
      desc(imports.createdAt),
      asc(investmentAccounts.displayName),
      desc(holdingSnapshots.normalizedMarketValue),
      asc(holdingSnapshots.assetName),
    );

  const snapshotsByAccountId = new Map<string, InvestmentAccountHoldingsSnapshot>();

  for (const row of rows) {
    const quantity = toNullableNumber(row.quantity);
    const marketValue = toNullableNumber(row.marketValue) ?? 0;
    const normalizedMarketValue = toNullableNumber(row.normalizedMarketValue) ?? marketValue;
    const costBasis = toNullableNumber(row.costBasis);
    const gainLoss = toNullableNumber(row.gainLoss);
    const resolvedAssetType = resolveInvestmentAssetType({
      assetName: row.assetName,
      assetSymbol: row.assetSymbol,
      storedAssetType: row.assetType,
    });
    const ownerDisplayName =
      row.ownerDisplayNameOverride?.trim() || row.ownerUserDisplayName?.trim() || null;
    const existing =
      snapshotsByAccountId.get(row.accountId)
      ?? {
        accountId: row.accountId,
        accountDisplayName: row.accountDisplayName,
        ownerMemberId: row.ownerMemberId,
        ownerDisplayName,
        sourceName: row.sourceName ?? null,
        snapshotDate: row.snapshotDate,
        importId: row.importId,
        importCreatedAt: row.importCreatedAt.toISOString(),
        importOriginalFilename: row.importOriginalFilename,
        holdingCount: 0,
        totalMarketValue: 0,
        totalCostBasis: null,
        totalGainLoss: null,
        holdings: [],
      } satisfies InvestmentAccountHoldingsSnapshot;

    existing.holdings.push({
      assetName: row.assetName,
      assetSymbol: row.assetSymbol,
      assetType: resolvedAssetType.assetType,
      assetTypeSource: resolvedAssetType.assetTypeSource,
      quantity,
      marketValue,
      marketValueCurrency: row.marketValueCurrency,
      normalizedMarketValue,
      costBasis,
      gainLoss,
    });
    existing.holdingCount += 1;
    existing.totalMarketValue += marketValue;
    existing.totalCostBasis = addNullableNumber(existing.totalCostBasis, costBasis);
    existing.totalGainLoss = addNullableNumber(existing.totalGainLoss, gainLoss);

    snapshotsByAccountId.set(row.accountId, existing);
  }

  return [...snapshotsByAccountId.values()];
}

export async function persistInvestmentImport(input: {
  workbook: WorkbookData;
  originalFilename: string;
  fileBuffer: Buffer;
  ownerMemberId: string;
  accountLabel: string;
  context: CurrentWorkspaceContext;
}): Promise<SaveInvestmentImportResult> {
  if (input.context.baseCurrency !== "ILS") {
    throw new InvestmentImportValidationError(
      "Investment snapshot saves are limited to ILS workspaces until non-ILS normalization is implemented.",
    );
  }

  const db = getDb();
  const source = await ensureExcellenceInvestmentImportSource();
  const checksum = hashBuffer(input.fileBuffer);
  let parsed: ReturnType<typeof parseInvestmentWorkbookToPreview>;

  try {
    parsed = parseInvestmentWorkbookToPreview({
      workbook: input.workbook,
    });
  } catch (error) {
    throw new InvestmentImportValidationError(
      error instanceof Error ? error.message : "Could not parse this investment workbook.",
    );
  }
  const displayAccountLabel = normalizeAccountLabelForDisplay(input.accountLabel);

  if (parsed.preview.provider !== "excellence") {
    throw new InvestmentImportValidationError(
      "Only Excellence investment workbooks can be saved right now.",
    );
  }

  if (parsed.preview.holdings.length > 0 && !parsed.preview.snapshotDate) {
    throw new InvestmentImportValidationError(
      "The workbook is missing a snapshot date, so it cannot be saved yet.",
    );
  }

  if (parsed.preview.holdings.length === 0 && parsed.preview.activities.length === 0) {
    throw new InvestmentImportValidationError(
      "No holdings or activity rows were parsed from this workbook.",
    );
  }

  const snapshotDate = parsed.preview.snapshotDate;
  const activityRange = getActivityRange({
    activityPeriodStart: parsed.preview.activityPeriodStart,
    activityPeriodEnd: parsed.preview.activityPeriodEnd,
    activities: parsed.preview.activities,
  });

  let importId: string = randomUUID();
  let storagePath: string = buildImportStoragePath({
    workspaceId: input.context.workspaceId,
    importId,
    filename: input.originalFilename,
  });

  try {
    const result = await db.transaction(async (tx) => {
      await acquireAdvisoryLock(
        tx,
        CHECKSUM_LOCK_NAMESPACE,
        [
          input.context.workspaceId,
          checksum,
          "investment",
        ].join(":"),
      );

      const existingImport = await tx.query.imports.findFirst({
        where: and(
          eq(imports.workspaceId, input.context.workspaceId),
          eq(imports.fileChecksum, checksum),
          eq(imports.type, "investment"),
        ),
        columns: {
          id: true,
          storagePath: true,
          importStatus: true,
        },
      });

      if (existingImport && existingImport.importStatus !== "failed") {
        return {
          status: "duplicate" as const,
          importId: existingImport.id,
          duplicateOfImportId: existingImport.id,
          holdingCount: await tx.$count(holdingSnapshots, eq(holdingSnapshots.importId, existingImport.id)),
          activityCount: await tx.$count(
            investmentActivities,
            eq(investmentActivities.importId, existingImport.id),
          ),
          importStatus: existingImport.importStatus,
        };
      }

      importId = existingImport?.id ?? importId;
      storagePath = existingImport?.storagePath ?? storagePath;

      await findWorkspaceMemberOrThrow({
        tx,
        workspaceId: input.context.workspaceId,
        ownerMemberId: input.ownerMemberId,
      });

      if (existingImport?.importStatus === "failed") {
        await tx
          .update(imports)
          .set({
            uploadedByUserId: input.context.userId,
            importSourceId: source.sourceId,
            importTemplateId: null,
            fileKind: input.workbook.fileKind,
            originalFilename: input.originalFilename,
            storagePath,
            fileChecksum: checksum,
            importStatus: "processing",
            startedAt: new Date(),
            completedAt: null,
            errorSummary: null,
            updatedAt: new Date(),
          })
          .where(eq(imports.id, importId));
      } else {
        await tx.insert(imports).values({
          id: importId,
          workspaceId: input.context.workspaceId,
          uploadedByUserId: input.context.userId,
          importSourceId: source.sourceId,
          importTemplateId: null,
          type: "investment",
          fileKind: input.workbook.fileKind,
          originalFilename: input.originalFilename,
          storagePath,
          fileChecksum: checksum,
          importStatus: "processing",
          startedAt: new Date(),
        });
      }

      await writeImportFile({
        storagePath,
        fileBuffer: input.fileBuffer,
      });

      const account = await resolveInvestmentAccount({
        tx,
        workspaceId: input.context.workspaceId,
        ownerMemberId: input.ownerMemberId,
        sourceId: source.sourceId,
        accountLabel: displayAccountLabel,
      });

      if (parsed.preview.holdings.length > 0 && snapshotDate) {
        await acquireAdvisoryLock(
          tx,
          SNAPSHOT_REPLACEMENT_LOCK_NAMESPACE,
          [
            input.context.workspaceId,
            account.id,
            snapshotDate,
          ].join(":"),
        );

        await tx
          .delete(holdingSnapshots)
          .where(
            and(
              eq(holdingSnapshots.workspaceId, input.context.workspaceId),
              eq(holdingSnapshots.investmentAccountId, account.id),
              eq(holdingSnapshots.snapshotDate, snapshotDate),
            ),
          );

        await tx.insert(holdingSnapshots).values(
          buildHoldingSnapshotValues({
            workspaceId: input.context.workspaceId,
            importId,
            investmentAccountId: account.id,
            snapshotDate,
            holdings: parsed.preview.holdings,
          }),
        );
      }

      if (parsed.preview.activities.length > 0) {
        if (!activityRange.startDate || !activityRange.endDate) {
          throw new InvestmentImportValidationError(
            "The workbook is missing the activity period, so the activity rows cannot be saved yet.",
          );
        }

        await acquireAdvisoryLock(
          tx,
          SNAPSHOT_REPLACEMENT_LOCK_NAMESPACE,
          [
            input.context.workspaceId,
            account.id,
            activityRange.startDate,
            activityRange.endDate,
            "activities",
          ].join(":"),
        );

        await tx
          .delete(investmentActivities)
          .where(
            and(
              eq(investmentActivities.workspaceId, input.context.workspaceId),
              eq(investmentActivities.investmentAccountId, account.id),
              sql`${investmentActivities.activityDate} >= ${activityRange.startDate}`,
              sql`${investmentActivities.activityDate} <= ${activityRange.endDate}`,
            ),
          );

        const activityValues = buildInvestmentActivityValues({
          workspaceId: input.context.workspaceId,
          importId,
          investmentAccountId: account.id,
          activities: parsed.preview.activities,
        });

        if (activityValues.length > 0) {
          await tx.insert(investmentActivities).values(activityValues);
        }
      }

      await tx
        .update(imports)
        .set({
          importStatus: "completed",
          completedAt: new Date(),
          errorSummary: null,
          updatedAt: new Date(),
        })
        .where(eq(imports.id, importId));

      return {
        status: "saved" as const,
        holdingCount: parsed.preview.holdings.length,
        activityCount: parsed.preview.activities.length,
      };
    });

    if (result.status === "duplicate") {
      return result;
    }

    return {
      status: "saved",
      importId,
      holdingCount: result.holdingCount,
      activityCount: result.activityCount,
      importStatus: "completed",
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Investment import persistence failed";

    await upsertFailedInvestmentImport({
      importId,
      workspaceId: input.context.workspaceId,
      userId: input.context.userId,
      sourceId: source.sourceId,
      fileKind: input.workbook.fileKind,
      originalFilename: input.originalFilename,
      storagePath,
      checksum,
      message,
    });

    throw error;
  }
}

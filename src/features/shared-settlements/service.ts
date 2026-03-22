import { and, desc, eq, inArray } from "drizzle-orm";

import { getDb } from "@/db";
import {
  expenseEvents,
  manualEntries,
  sharedExpenseSplits,
  transactions,
} from "@/db/schema";
import { listWorkspaceMembers } from "@/features/expenses/queries";
import type { CurrentWorkspaceContext } from "@/features/workspaces/current-context";
import type {
  EqualSplitDefinition,
  FixedSplitDefinition,
  PercentageSplitDefinition,
  SettlementBalanceSummary,
  SettlementStatus,
  SharedExpenseSplitState,
  SharedSettlementItem,
  SharedSettlementsPageData,
  SharedSplitMode,
} from "@/features/shared-settlements/types";

type WorkspaceMemberSummary = {
  id: string;
  displayName: string;
};

type SharedSettlementSourceRow = {
  expenseEventId: string;
  sourceId: string;
  sourceType: "transaction" | "recurring";
  title: string;
  totalAmount: string;
  workspaceCurrency: string;
  category: string | null;
  payerMemberId: string | null;
  splitMode: SharedSplitMode | null;
  splitDefinitionJson: unknown;
  settlementStatus: SettlementStatus | null;
};

type DateSourceRow = {
  id: string;
  eventDate: string;
};

const MICRO_MULTIPLIER = 1_000_000n;
const PERCENTAGE_SCALE = 10_000n;

function amountStringToMicros(amount: string) {
  const normalized = amount.trim();

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    throw new Error("Amounts must be numeric.");
  }

  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [wholePart, fractionPart = ""] = unsigned.split(".");
  const safeWhole = wholePart === "" ? "0" : wholePart;
  const paddedFraction = `${fractionPart}000000`.slice(0, 6);
  const micros = BigInt(safeWhole) * MICRO_MULTIPLIER + BigInt(paddedFraction);

  return negative ? micros * -1n : micros;
}

function microsToAmountString(value: bigint) {
  const negative = value < 0n;
  const absolute = negative ? value * -1n : value;
  const whole = absolute / MICRO_MULTIPLIER;
  const fraction = absolute % MICRO_MULTIPLIER;

  return `${negative ? "-" : ""}${whole.toString()}.${fraction.toString().padStart(6, "0")}`;
}

function buildBlockedBalanceSummary(
  workspaceCurrency: string,
  reason: string,
): SettlementBalanceSummary {
  return {
    status: "blocked",
    workspaceCurrency,
    amount: "0.000000",
    fromMemberId: null,
    fromMemberName: null,
    toMemberId: null,
    toMemberName: null,
    summaryText: reason,
  };
}

function normalizeActiveMembers(
  members: Array<{
    id: string;
    displayName: string;
  }>,
) {
  return [...members].sort((left, right) => left.displayName.localeCompare(right.displayName));
}

function assertPairwiseMembers(
  members: WorkspaceMemberSummary[],
): [WorkspaceMemberSummary, WorkspaceMemberSummary] {
  if (members.length !== 2) {
    throw new Error("Shared settlements require exactly 2 active workspace members.");
  }

  return [members[0], members[1]];
}

function memberMapFromPair(pair: [WorkspaceMemberSummary, WorkspaceMemberSummary]) {
  return new Map(pair.map((member) => [member.id, member]));
}

function sortMemberIdsByPair(
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary],
  memberIds: string[],
) {
  const pairIds = new Set(pair.map((member) => member.id));

  if (memberIds.length !== 2 || new Set(memberIds).size !== 2) {
    throw new Error("Shared settlements require exactly 2 distinct members.");
  }

  for (const memberId of memberIds) {
    if (!pairIds.has(memberId)) {
      throw new Error("Split members must match the 2 active workspace members.");
    }
  }

  return pair.map((member) => member.id) as [string, string];
}

function validateEqualSplitDefinition(
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary],
  input: unknown,
): EqualSplitDefinition {
  if (!input || typeof input !== "object" || !("participants" in input)) {
    throw new Error("Equal splits require participants.");
  }

  const participants = (input as { participants?: unknown }).participants;

  if (!Array.isArray(participants)) {
    throw new Error("Equal split participants must be an array.");
  }

  return {
    participants: sortMemberIdsByPair(pair, participants.map(String)),
  };
}

function validatePercentageSplitDefinition(
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary],
  input: unknown,
): PercentageSplitDefinition {
  if (!input || typeof input !== "object" || !("shares" in input)) {
    throw new Error("Percentage splits require shares.");
  }

  const rawShares = (input as { shares?: unknown }).shares;

  if (!Array.isArray(rawShares) || rawShares.length !== 2) {
    throw new Error("Percentage splits require exactly 2 member shares.");
  }

  const sharesByMemberId = new Map<string, number>();

  for (const row of rawShares) {
    if (!row || typeof row !== "object") {
      throw new Error("Percentage shares are invalid.");
    }

    const memberId = String((row as { memberId?: unknown }).memberId ?? "");
    const percentageBps = Number((row as { percentageBps?: unknown }).percentageBps);

    if (!Number.isInteger(percentageBps) || percentageBps < 0) {
      throw new Error("Percentage shares must use whole-number basis points.");
    }

    if (sharesByMemberId.has(memberId)) {
      throw new Error("Percentage splits cannot repeat the same member.");
    }

    sharesByMemberId.set(memberId, percentageBps);
  }

  const orderedMemberIds = sortMemberIdsByPair(pair, Array.from(sharesByMemberId.keys()));
  const orderedShares = orderedMemberIds.map((memberId) => ({
    memberId,
    percentageBps: sharesByMemberId.get(memberId) ?? 0,
  })) as PercentageSplitDefinition["shares"];
  const totalBps = orderedShares.reduce((sum, row) => sum + row.percentageBps, 0);

  if (totalBps !== Number(PERCENTAGE_SCALE)) {
    throw new Error("Percentage split shares must add up to 10000 basis points.");
  }

  return {
    shares: orderedShares,
  };
}

function validateFixedSplitDefinition(
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary],
  totalAmount: string,
  input: unknown,
): FixedSplitDefinition {
  if (!input || typeof input !== "object" || !("shares" in input)) {
    throw new Error("Fixed splits require shares.");
  }

  const rawShares = (input as { shares?: unknown }).shares;

  if (!Array.isArray(rawShares) || rawShares.length !== 2) {
    throw new Error("Fixed splits require exactly 2 member shares.");
  }

  const sharesByMemberId = new Map<string, string>();

  for (const row of rawShares) {
    if (!row || typeof row !== "object") {
      throw new Error("Fixed shares are invalid.");
    }

    const memberId = String((row as { memberId?: unknown }).memberId ?? "");
    const amount = String((row as { amount?: unknown }).amount ?? "").trim();

    if (!amount) {
      throw new Error("Fixed split amounts are required.");
    }

    if (sharesByMemberId.has(memberId)) {
      throw new Error("Fixed splits cannot repeat the same member.");
    }

    sharesByMemberId.set(memberId, microsToAmountString(amountStringToMicros(amount)));
  }

  const orderedMemberIds = sortMemberIdsByPair(pair, Array.from(sharesByMemberId.keys()));
  const shares = orderedMemberIds.map((memberId) => ({
    memberId,
    amount: sharesByMemberId.get(memberId) ?? "0.000000",
  })) as FixedSplitDefinition["shares"];
  const totalMicros = shares.reduce((sum, row) => sum + amountStringToMicros(row.amount), 0n);

  if (totalMicros !== amountStringToMicros(totalAmount)) {
    throw new Error("Fixed split amounts must add up to the full expense total.");
  }

  return {
    shares,
  };
}

function validateSplitState(input: {
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary];
  splitMode: SharedSplitMode;
  splitDefinition: unknown;
  settlementStatus: SettlementStatus;
  totalAmount: string;
}): SharedExpenseSplitState {
  switch (input.splitMode) {
    case "equal":
      return {
        splitMode: "equal",
        splitDefinition: validateEqualSplitDefinition(input.pair, input.splitDefinition),
        settlementStatus: input.settlementStatus,
      };
    case "percentage":
      return {
        splitMode: "percentage",
        splitDefinition: validatePercentageSplitDefinition(input.pair, input.splitDefinition),
        settlementStatus: input.settlementStatus,
      };
    case "fixed":
      return {
        splitMode: "fixed",
        splitDefinition: validateFixedSplitDefinition(
          input.pair,
          input.totalAmount,
          input.splitDefinition,
        ),
        settlementStatus: input.settlementStatus,
      };
  }
}

function buildEqualShareMicros(totalAmount: string, memberIds: [string, string]) {
  const totalMicros = amountStringToMicros(totalAmount);
  const memberCount = BigInt(memberIds.length);
  const baseMicros = totalMicros / memberCount;
  let remainder = totalMicros % memberCount;

  return memberIds.map((memberId) => {
    const direction = remainder === 0n ? 0n : remainder > 0n ? 1n : -1n;
    remainder -= direction;

    return {
      memberId,
      amountMicros: baseMicros + direction,
    };
  });
}

function buildPercentageShareMicros(
  totalAmount: string,
  shares: PercentageSplitDefinition["shares"],
) {
  const totalMicros = amountStringToMicros(totalAmount);
  const baseShares = shares.map((share) => {
    const scaled = totalMicros * BigInt(share.percentageBps);

    return {
      memberId: share.memberId,
      amountMicros: scaled / PERCENTAGE_SCALE,
      remainder: scaled % PERCENTAGE_SCALE,
    };
  });
  const allocatedMicros = baseShares.reduce((sum, row) => sum + row.amountMicros, 0n);
  let remainder = totalMicros - allocatedMicros;
  const ordered = [...baseShares].sort((left, right) => {
    const remainderDiff = Number(right.remainder - left.remainder);
    return remainderDiff !== 0 ? remainderDiff : left.memberId.localeCompare(right.memberId);
  });

  while (remainder !== 0n) {
    for (const share of ordered) {
      if (remainder === 0n) {
        break;
      }

      const direction = remainder > 0n ? 1n : -1n;
      share.amountMicros += direction;
      remainder -= direction;
    }
  }

  return shares.map((share) => ({
    memberId: share.memberId,
    amountMicros: ordered.find((row) => row.memberId === share.memberId)?.amountMicros ?? 0n,
  }));
}

function buildFixedShareMicros(shares: FixedSplitDefinition["shares"]) {
  return shares.map((share) => ({
    memberId: share.memberId,
    amountMicros: amountStringToMicros(share.amount),
  }));
}

function resolveShareMicros(input: {
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary];
  totalAmount: string;
  splitState: SharedExpenseSplitState;
}) {
  const memberIds = input.pair.map((member) => member.id) as [string, string];

  switch (input.splitState.splitMode) {
    case "equal":
      return buildEqualShareMicros(input.totalAmount, memberIds);
    case "percentage":
      return buildPercentageShareMicros(input.totalAmount, input.splitState.splitDefinition.shares);
    case "fixed":
      return buildFixedShareMicros(input.splitState.splitDefinition.shares);
  }
}

function buildSettlementItem(input: {
  row: SharedSettlementSourceRow;
  eventDate: string;
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary];
}) {
  const memberById = memberMapFromPair(input.pair);
  const payer = input.row.payerMemberId ? memberById.get(input.row.payerMemberId) ?? null : null;
  const splitState =
    input.row.splitMode && input.row.settlementStatus
      ? validateSplitState({
          pair: input.pair,
          splitMode: input.row.splitMode,
          splitDefinition: input.row.splitDefinitionJson,
          settlementStatus: input.row.settlementStatus,
          totalAmount: input.row.totalAmount,
        })
      : null;

  const shareBreakdown = splitState
    ? resolveShareMicros({
        pair: input.pair,
        totalAmount: input.row.totalAmount,
        splitState,
      }).map((share) => ({
        memberId: share.memberId,
        memberName: memberById.get(share.memberId)?.displayName ?? "Unknown member",
        amount: microsToAmountString(share.amountMicros),
      }))
    : [];

  const settlementImpact =
    splitState && payer
      ? (() => {
          const otherMember = input.pair.find((member) => member.id !== payer.id);
          const otherShare = shareBreakdown.find((share) => share.memberId !== payer.id);

          if (!otherMember || !otherShare) {
            return null;
          }

          return {
            fromMemberId: otherMember.id,
            fromMemberName: otherMember.displayName,
            toMemberId: payer.id,
            toMemberName: payer.displayName,
            amount: otherShare.amount,
          };
        })()
      : null;

  return {
    expenseEventId: input.row.expenseEventId,
    sourceId: input.row.sourceId,
    sourceKind:
      input.row.sourceType === "transaction" ? "imported_transaction" : "recurring_generated",
    sourceType: input.row.sourceType,
    title: input.row.title,
    eventDate: input.eventDate,
    totalAmount: input.row.totalAmount,
    workspaceCurrency: input.row.workspaceCurrency,
    category: input.row.category,
    payerMemberId: payer?.id ?? input.row.payerMemberId,
    payerMemberName: payer?.displayName ?? null,
    splitState,
    shareBreakdown,
    settlementImpact,
  } satisfies SharedSettlementItem;
}

function buildBalanceSummary(input: {
  pair: [WorkspaceMemberSummary, WorkspaceMemberSummary];
  trackedExpenses: SharedSettlementItem[];
  workspaceCurrency: string;
}): SettlementBalanceSummary {
  const totals = new Map(
    input.pair.map((member) => [member.id, 0n]),
  );

  for (const item of input.trackedExpenses) {
    if (!item.splitState || item.splitState.settlementStatus !== "open" || !item.settlementImpact) {
      continue;
    }

    const fromCurrent = totals.get(item.settlementImpact.fromMemberId) ?? 0n;
    const toCurrent = totals.get(item.settlementImpact.toMemberId) ?? 0n;
    const impactMicros = amountStringToMicros(item.settlementImpact.amount);

    totals.set(item.settlementImpact.fromMemberId, fromCurrent - impactMicros);
    totals.set(item.settlementImpact.toMemberId, toCurrent + impactMicros);
  }

  const [memberA, memberB] = input.pair;
  const memberABalance = totals.get(memberA.id) ?? 0n;
  const memberBBalance = totals.get(memberB.id) ?? 0n;

  if (memberABalance === 0n && memberBBalance === 0n) {
    return {
      status: "ready",
      workspaceCurrency: input.workspaceCurrency,
      amount: "0.000000",
      fromMemberId: null,
      fromMemberName: null,
      toMemberId: null,
      toMemberName: null,
      summaryText: "Open shared expenses are currently balanced.",
    };
  }

  const fromMember = memberABalance < 0n ? memberA : memberB;
  const toMember = fromMember.id === memberA.id ? memberB : memberA;
  const amountMicros = fromMember.id === memberA.id ? memberBBalance : memberABalance;

  return {
    status: "ready",
    workspaceCurrency: input.workspaceCurrency,
    amount: microsToAmountString(amountMicros < 0n ? amountMicros * -1n : amountMicros),
    fromMemberId: fromMember.id,
    fromMemberName: fromMember.displayName,
    toMemberId: toMember.id,
    toMemberName: toMember.displayName,
    summaryText: `${fromMember.displayName} owes ${toMember.displayName}`,
  };
}

async function listEligibleSettlementRows(
  context: CurrentWorkspaceContext,
) {
  const db = getDb();
  const rows = await db
    .select({
      expenseEventId: expenseEvents.id,
      sourceId: expenseEvents.sourceId,
      sourceType: expenseEvents.sourceType,
      title: expenseEvents.title,
      totalAmount: expenseEvents.totalAmount,
      workspaceCurrency: expenseEvents.workspaceCurrency,
      category: expenseEvents.category,
      payerMemberId: expenseEvents.payerMemberId,
      splitMode: sharedExpenseSplits.splitMode,
      splitDefinitionJson: sharedExpenseSplits.splitDefinitionJson,
      settlementStatus: sharedExpenseSplits.settlementStatus,
    })
    .from(expenseEvents)
    .leftJoin(sharedExpenseSplits, eq(sharedExpenseSplits.expenseEventId, expenseEvents.id))
    .where(
      and(
        eq(expenseEvents.workspaceId, context.workspaceId),
        eq(expenseEvents.eventKind, "expense"),
        eq(expenseEvents.classificationType, "shared"),
        inArray(expenseEvents.sourceType, ["transaction", "recurring"]),
      ),
    )
    .orderBy(desc(expenseEvents.createdAt));

  return rows as SharedSettlementSourceRow[];
}

async function listSourceDates(rows: SharedSettlementSourceRow[]) {
  const db = getDb();
  const transactionIds = rows
    .filter((row) => row.sourceType === "transaction")
    .map((row) => row.sourceId);
  const recurringIds = rows
    .filter((row) => row.sourceType === "recurring")
    .map((row) => row.sourceId);
  const [transactionRows, recurringRows] = await Promise.all([
    transactionIds.length === 0
      ? Promise.resolve<DateSourceRow[]>([])
      : db
          .select({
            id: transactions.id,
            eventDate: transactions.transactionDate,
          })
          .from(transactions)
          .where(inArray(transactions.id, transactionIds)),
    recurringIds.length === 0
      ? Promise.resolve<DateSourceRow[]>([])
      : db
          .select({
            id: manualEntries.id,
            eventDate: manualEntries.eventDate,
          })
          .from(manualEntries)
          .where(inArray(manualEntries.id, recurringIds)),
  ]);

  return new Map(
    [...transactionRows, ...recurringRows].map((row) => [row.id, row.eventDate]),
  );
}

async function getPairwiseMembers(context: CurrentWorkspaceContext) {
  const members = normalizeActiveMembers(await listWorkspaceMembers(context));
  const blockingReason =
    members.length === 2
      ? null
      : "Shared settlements need exactly 2 active household members. Add or deactivate members in settings before tracking balances.";

  return {
    activeMembers: members,
    blockingReason,
  };
}

export async function getSharedSettlementsPageData(
  context: CurrentWorkspaceContext,
): Promise<SharedSettlementsPageData> {
  const { activeMembers, blockingReason } = await getPairwiseMembers(context);

  if (blockingReason) {
    return {
      workspaceCurrency: context.baseCurrency,
      activeMembers,
      isPairwiseReady: false,
      blockingReason,
      balanceSummary: buildBlockedBalanceSummary(context.baseCurrency, blockingReason),
      needsSplitSetup: [],
      trackedExpenses: [],
    };
  }

  const pair = assertPairwiseMembers(activeMembers);
  const rows = await listEligibleSettlementRows(context);
  const sourceDates = await listSourceDates(rows);
  const items = rows
    .map((row) =>
      buildSettlementItem({
        row,
        eventDate: sourceDates.get(row.sourceId) ?? new Date().toISOString().slice(0, 10),
        pair,
      }),
    )
    .sort((left, right) => {
      if (left.eventDate !== right.eventDate) {
        return right.eventDate.localeCompare(left.eventDate);
      }

      return left.title.localeCompare(right.title);
    });

  const needsSplitSetup = items.filter((item) => !item.splitState);
  const trackedExpenses = items.filter((item) => Boolean(item.splitState));

  return {
    workspaceCurrency: context.baseCurrency,
    activeMembers,
    isPairwiseReady: true,
    blockingReason: null,
    balanceSummary: buildBalanceSummary({
      pair,
      trackedExpenses,
      workspaceCurrency: context.baseCurrency,
    }),
    needsSplitSetup,
    trackedExpenses,
  };
}

export async function upsertSharedSettlement(
  context: CurrentWorkspaceContext,
  input: {
    expenseEventId: string;
    payerMemberId: string;
    splitMode: SharedSplitMode;
    splitDefinition: unknown;
    settlementStatus: SettlementStatus;
  },
) {
  const db = getDb();
  const { activeMembers } = await getPairwiseMembers(context);
  const pair = assertPairwiseMembers(activeMembers);
  const pairMemberIds = new Set(pair.map((member) => member.id));

  if (!pairMemberIds.has(input.payerMemberId)) {
    throw new Error("Payer must be one of the 2 active workspace members.");
  }

  return db.transaction(async (tx) => {
    const expenseEvent = await tx
      .select({
        id: expenseEvents.id,
        totalAmount: expenseEvents.totalAmount,
      })
      .from(expenseEvents)
      .where(
        and(
          eq(expenseEvents.id, input.expenseEventId),
          eq(expenseEvents.workspaceId, context.workspaceId),
          eq(expenseEvents.eventKind, "expense"),
          eq(expenseEvents.classificationType, "shared"),
          inArray(expenseEvents.sourceType, ["transaction", "recurring"]),
        ),
      )
      .then((rows) => rows[0] ?? null);

    if (!expenseEvent) {
      throw new Error("Shared settlement source expense was not found.");
    }

    const splitState = validateSplitState({
      pair,
      splitMode: input.splitMode,
      splitDefinition: input.splitDefinition,
      settlementStatus: input.settlementStatus,
      totalAmount: expenseEvent.totalAmount,
    });

    await tx
      .update(expenseEvents)
      .set({
        payerMemberId: input.payerMemberId,
        updatedAt: new Date(),
      })
      .where(eq(expenseEvents.id, expenseEvent.id));

    await tx
      .insert(sharedExpenseSplits)
      .values({
        expenseEventId: expenseEvent.id,
        splitMode: splitState.splitMode,
        splitDefinitionJson: splitState.splitDefinition,
        settlementStatus: splitState.settlementStatus,
      })
      .onConflictDoUpdate({
        target: sharedExpenseSplits.expenseEventId,
        set: {
          splitMode: splitState.splitMode,
          splitDefinitionJson: splitState.splitDefinition,
          settlementStatus: splitState.settlementStatus,
          updatedAt: new Date(),
        },
      });

    return {
      expenseEventId: expenseEvent.id,
    };
  });
}

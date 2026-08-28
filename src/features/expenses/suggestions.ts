import type { ClassificationType } from "@/features/expenses/constants";
import { classificationAllowsPayer } from "@/features/expenses/payer";
import type { ClassificationSuggestion } from "@/features/expenses/types";

export type HistoricalClassificationDecision = {
  merchantRaw: string | null;
  classificationType: ClassificationType;
  category: string | null;
  categoryId: string | null;
  memberOwnerId: string | null;
};

export function normalizeMerchantRuleValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function buildExactMerchantSuggestions(
  rows: HistoricalClassificationDecision[],
  memberNames: ReadonlyMap<string, string> = new Map(),
) {
  const result = new Map<string, ClassificationSuggestion>();
  const decisionsByMerchant = new Map<
    string,
    Map<string, { count: number; row: HistoricalClassificationDecision }>
  >();

  rows.forEach((row) => {
    if (!row.merchantRaw?.trim()) return;
    const merchantKey = normalizeMerchantRuleValue(row.merchantRaw);
    const decisionKey = JSON.stringify([
      row.classificationType,
      row.categoryId ?? row.category?.trim().toLocaleLowerCase() ?? null,
      classificationAllowsPayer(row.classificationType) ? row.memberOwnerId : null,
    ]);
    const decisions = decisionsByMerchant.get(merchantKey) ?? new Map();
    const current = decisions.get(decisionKey);
    decisions.set(
      decisionKey,
      current ? { ...current, count: current.count + 1 } : { count: 1, row },
    );
    decisionsByMerchant.set(merchantKey, decisions);
  });

  decisionsByMerchant.forEach((decisions, merchantKey) => {
    const ranked = Array.from(decisions.values()).sort((left, right) => right.count - left.count);
    const winner = ranked[0];
    const total = ranked.reduce((sum, decision) => sum + decision.count, 0);
    if (!winner || total < 2 || winner.count / total < 0.75) return;
    const memberOwnerId = classificationAllowsPayer(winner.row.classificationType)
      ? winner.row.memberOwnerId
      : null;

    result.set(merchantKey, {
      classificationType: winner.row.classificationType,
      category: winner.row.category,
      categoryId: winner.row.categoryId,
      memberOwnerId,
      memberOwnerName: memberOwnerId
        ? memberNames.get(memberOwnerId) ?? null
        : null,
      matchingTransactionCount: total,
      supportingTransactionCount: winner.count,
      confidence: winner.count === total ? "strong" : "likely",
      source: "merchant_history",
    });
  });

  return result;
}

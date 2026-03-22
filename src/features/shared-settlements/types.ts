export type SharedSplitMode = "equal" | "percentage" | "fixed";
export type SettlementStatus = "open" | "settled" | "ignored";

export type EqualSplitDefinition = {
  participants: [string, string];
};

export type PercentageSplitDefinition = {
  shares: [
    { memberId: string; percentageBps: number },
    { memberId: string; percentageBps: number },
  ];
};

export type FixedSplitDefinition = {
  shares: [
    { memberId: string; amount: string },
    { memberId: string; amount: string },
  ];
};

export type SharedExpenseSplitState =
  | {
      splitMode: "equal";
      splitDefinition: EqualSplitDefinition;
      settlementStatus: SettlementStatus;
    }
  | {
      splitMode: "percentage";
      splitDefinition: PercentageSplitDefinition;
      settlementStatus: SettlementStatus;
    }
  | {
      splitMode: "fixed";
      splitDefinition: FixedSplitDefinition;
      settlementStatus: SettlementStatus;
    };

export type SettlementBalanceSummary = {
  status: "ready" | "blocked";
  workspaceCurrency: string;
  amount: string;
  fromMemberId: string | null;
  fromMemberName: string | null;
  toMemberId: string | null;
  toMemberName: string | null;
  summaryText: string;
};

export type SharedSettlementItem = {
  expenseEventId: string;
  sourceId: string;
  sourceKind: "imported_transaction" | "one_time_manual" | "recurring_generated";
  sourceType: "transaction" | "manual" | "recurring";
  title: string;
  eventDate: string;
  totalAmount: string;
  workspaceCurrency: string;
  category: string | null;
  payerMemberId: string | null;
  payerMemberName: string | null;
  splitState: SharedExpenseSplitState | null;
  shareBreakdown: Array<{
    memberId: string;
    memberName: string;
    amount: string;
  }>;
  settlementImpact: {
    fromMemberId: string;
    fromMemberName: string;
    toMemberId: string;
    toMemberName: string;
    amount: string;
  } | null;
};

export type SharedSettlementsPageData = {
  workspaceCurrency: string;
  activeMembers: Array<{
    id: string;
    displayName: string;
  }>;
  isPairwiseReady: boolean;
  blockingReason: string | null;
  balanceSummary: SettlementBalanceSummary;
  needsSplitSetup: SharedSettlementItem[];
  trackedExpenses: SharedSettlementItem[];
};

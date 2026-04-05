import type {
  MonthlyReportSummary,
  ReportingPeriodSummary,
  ReportingViewMode,
} from "@/features/reporting/monthly-report";

export type WorkspaceHomeImportActivity = {
  id: string;
  originalFilename: string;
  importStatus: string;
  createdAt: string;
  completedAt: string | null;
  sourceName: string | null;
  transactionCount: number;
  reviewedTransactionCount: number;
  reviewPendingCount: number;
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
};

export type WorkspaceHomeNotableState = {
  title: string;
  description: string;
  href: string;
  tone: "neutral" | "warning";
};

export type WorkspaceHomeSnapshot = {
  workspaceName: string;
  setup: {
    baseCurrency: string;
    canUpdateBaseCurrency: boolean;
    activeMemberCount: number;
    activeOwnerCount: number;
    pairwiseSettlementReady: boolean;
  };
  workflow: {
    importCount: number;
    transactionCount: number;
    reviewQueueCount: number;
    manualEntryCount: number;
    recurringRuleCount: number;
    hasManualEntries: boolean;
    hasRecurringRules: boolean;
  };
  reporting: {
    selectedMonth: string;
    reportingMode: ReportingViewMode;
    available: boolean;
    monthSummary: MonthlyReportSummary | null;
    rollingTwelveSummary: ReportingPeriodSummary | null;
  };
  recentActivity: {
    latestImports: WorkspaceHomeImportActivity[];
    notableStates: WorkspaceHomeNotableState[];
  };
};

export type AppShellSnapshot = {
  workspaceName: string;
  baseCurrency: string;
  activeMemberCount: number;
  pairwiseSettlementReady: boolean;
  reviewQueueCount: number;
  settingsNeedsAttention: boolean;
};

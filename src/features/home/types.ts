import type {
  MonthCompleteness,
  MonthlyReportSummary,
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

export type WorkspaceHomePrimarySnapshot = {
  workspaceName: string;
  setup: {
    activeMemberCount: number;
  };
  workflow: {
    importCount: number;
    latestTransactionMonth: string | null;
    reviewQueueCount: number;
  };
};

export type WorkspaceHomeReportingSnapshot = {
  selectedMonth: string;
  reportingMode: ReportingViewMode;
  available: boolean;
  completeness: MonthCompleteness;
  monthSummary: MonthlyReportSummary | null;
};

export type WorkspaceHomeActivitySnapshot = {
  latestImports: WorkspaceHomeImportActivity[];
};

export type AppShellSnapshot = {
  workspaceName: string;
  baseCurrency: string;
  activeMemberCount: number;
  pairwiseSettlementReady: boolean;
  reviewQueueCount: number;
};

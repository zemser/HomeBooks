import type { ClassificationType, DecisionSource } from "@/features/expenses/constants";
import type { ExpenseAllocationState } from "@/features/expenses/allocation";
import type { OneTimeManualEntryItem } from "@/features/manual-entries/types";

export type TransactionClassificationState = {
  classificationType: ClassificationType;
  category: string | null;
  memberOwnerId: string | null;
  memberOwnerName: string | null;
  decidedBy: DecisionSource;
  reviewedAt: string | null;
} | null;

export type ExpenseTransactionItem = {
  id: string;
  transactionDate: string;
  bookingDate: string | null;
  description: string;
  merchantRaw: string | null;
  originalAmount: string;
  originalCurrency: string | null;
  settlementAmount: string | null;
  settlementCurrency: string | null;
  normalizedAmount: string;
  workspaceCurrency: string;
  normalizationRateSource: string | null;
  direction: string;
  accountDisplayName: string;
  importSourceName: string | null;
  importOriginalFilename: string;
  classification: TransactionClassificationState;
  allocation: ExpenseAllocationState | null;
};

export type WorkspaceMemberOption = {
  id: string;
  displayName: string;
};

export type ReviewQueueImportSummary = {
  importId: string;
  originalFilename: string;
  sourceName: string | null;
  totalCount: number;
  reviewedCount: number;
  remainingCount: number;
  earliestTransactionDate: string | null;
  latestTransactionDate: string | null;
};

export type ReviewQueueSummary = {
  totalTransactionCount: number;
  reviewedCount: number;
  queueCount: number;
  completionPercentage: number;
  latestTransactionMonth: string | null;
  remainingByImport: ReviewQueueImportSummary[];
};

export type ReviewQueueResponse = {
  queue: ExpenseTransactionItem[];
  focusTransaction: ExpenseTransactionItem | null;
  members: WorkspaceMemberOption[];
  categories: string[];
  summary: ReviewQueueSummary;
};

export type ExpensesPageData = {
  transactions: ExpenseTransactionItem[];
  oneTimeManualEntries: OneTimeManualEntryItem[];
  members: WorkspaceMemberOption[];
  categories: string[];
};

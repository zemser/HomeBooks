import type { ClassificationType, DecisionSource } from "@/features/expenses/constants";
import type { ExpenseAllocationState } from "@/features/expenses/allocation";
import type { OneTimeManualEntryItem } from "@/features/manual-entries/types";
import type { WorkspaceCategoryItem } from "@/features/workspaces/types";

export type TransactionClassificationState = {
  classificationType: ClassificationType;
  category: string | null;
  categoryId: string | null;
  personalOwnerMemberId: string | null;
  personalOwnerName: string | null;
  paidByMemberId: string | null;
  paidByName: string | null;
  receivedByMemberId: string | null;
  receivedByName: string | null;
  decidedBy: DecisionSource;
  reviewedAt: string | null;
} | null;

export type ExpenseTransactionItem = {
  id: string;
  accountId: string;
  importId: string;
  importerMemberId: string | null;
  accountOwnerMemberId: string | null;
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
  suggestion: ClassificationSuggestion | null;
  similarQueueCount: number;
  exactRuleExists: boolean;
};

export type ClassificationSuggestion = {
  classificationType: ClassificationType;
  category: string | null;
  categoryId: string | null;
  personalOwnerMemberId: string | null;
  personalOwnerName: string | null;
  paidByMemberId: string | null;
  paidByName: string | null;
  receivedByMemberId: string | null;
  receivedByName: string | null;
  matchingTransactionCount: number;
  supportingTransactionCount: number;
  confidence: "strong" | "likely";
  source: "merchant_history";
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
  selectedImport: ReviewQueueImportSummary | null;
};

export type ReviewQueueResponse = {
  queue: ExpenseTransactionItem[];
  focusTransaction: ExpenseTransactionItem | null;
  members: WorkspaceMemberOption[];
  categories: string[];
  categoryCatalog: Array<{ id: string; name: string }>;
  recentCategories: string[];
  summary: ReviewQueueSummary;
  pagination: {
    page: number;
    pageSize: number;
    filteredCount: number;
    totalPages: number;
  };
  filterOptions: {
    months: string[];
    imports: Array<{ id: string; label: string }>;
    accounts: Array<{ id: string; label: string }>;
  };
};

export type ExpensesPageData = {
  transactions: ExpenseTransactionItem[];
  oneTimeManualEntries: OneTimeManualEntryItem[];
  members: WorkspaceMemberOption[];
  categories: string[];
  categoryCatalog: WorkspaceCategoryItem[];
};

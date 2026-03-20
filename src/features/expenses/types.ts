import type { ClassificationType, DecisionSource } from "@/features/expenses/constants";

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
  direction: string;
  accountDisplayName: string;
  importSourceName: string | null;
  importOriginalFilename: string;
  classification: TransactionClassificationState;
};

export type WorkspaceMemberOption = {
  id: string;
  displayName: string;
};

export type ReviewQueueResponse = {
  queue: ExpenseTransactionItem[];
  focusTransaction: ExpenseTransactionItem | null;
  members: WorkspaceMemberOption[];
};

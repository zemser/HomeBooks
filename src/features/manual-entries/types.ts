import type { ExpenseAllocationState } from "@/features/expenses/allocation";
import type {
  OneTimeManualEntryClassificationType,
  OneTimeManualEntryEventKind,
} from "@/features/manual-entries/constants";

export type OneTimeManualEntryItem = {
  id: string;
  title: string;
  eventKind: OneTimeManualEntryEventKind;
  originalAmount: string;
  originalCurrency: string;
  normalizedAmount: string;
  workspaceCurrency: string;
  payerMemberId: string | null;
  payerMemberName: string | null;
  classificationType: OneTimeManualEntryClassificationType;
  category: string | null;
  eventDate: string;
  allocation: ExpenseAllocationState | null;
};

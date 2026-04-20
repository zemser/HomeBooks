import type { ClassificationType } from "@/features/expenses/constants";
import type {
  EventKind,
  NormalizationMode,
  RecurrenceRule,
} from "@/features/recurring/constants";

export type RecurringEntryVersionItem = {
  id: string;
  effectiveStartMonth: string;
  effectiveEndMonth: string | null;
  amount: string;
  currency: string;
  normalizationMode: NormalizationMode;
  recurrenceRule: RecurrenceRule | string;
  notes: string | null;
};

export type RecurringEntryItem = {
  id: string;
  title: string;
  eventKind: EventKind;
  payerMemberId: string | null;
  payerMemberName: string | null;
  classificationType: ClassificationType;
  category: string | null;
  active: boolean;
  versions: RecurringEntryVersionItem[];
  currentVersion: RecurringEntryVersionItem | null;
};

export type GeneratedManualEntryItem = {
  id: string;
  sourceId: string | null;
  title: string;
  eventKind: EventKind;
  originalAmount: string;
  originalCurrency: string;
  normalizedAmount: string;
  workspaceCurrency: string;
  payerMemberId: string | null;
  payerMemberName: string | null;
  classificationType: ClassificationType;
  category: string | null;
  eventDate: string;
};

export type RecurringPageData = {
  workspaceCurrency: string;
  members: Array<{
    id: string;
    displayName: string;
  }>;
  categories: string[];
  recurringEntries: RecurringEntryItem[];
  generatedEntries: GeneratedManualEntryItem[];
};

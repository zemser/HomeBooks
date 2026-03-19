export type ImportFileKind = "csv" | "xlsx";

export type TabularCell = string | number | boolean | Date | null | undefined;
export type TabularRow = TabularCell[];

export type WorkbookSheet = {
  name: string;
  rows: TabularRow[];
};

export type WorkbookData = {
  fileKind: ImportFileKind;
  filename: string;
  sheets: WorkbookSheet[];
};

export type DetectedTemplateId =
  | "fibi_credit_statement"
  | "discount_card_export"
  | "unknown";

export type DetectedTemplate = {
  id: DetectedTemplateId;
  confidence: number;
  reason: string;
};

export type NormalizedBankTransaction = {
  transactionDate: string;
  bookingDate?: string;
  description: string;
  merchantRaw: string;
  category?: string;
  originalAmount: number;
  originalCurrency: string;
  settlementAmount?: number;
  settlementCurrency?: string;
  statementSection?: string;
  notes?: string;
  cardLastFour?: string;
  direction: "debit" | "credit";
};

export type ParsedBankStatement = {
  templateId: Exclude<DetectedTemplateId, "unknown">;
  accountLabel?: string;
  statementLabel?: string;
  transactions: NormalizedBankTransaction[];
};

export type CurrencyNormalizer = (input: {
  amount: number;
  fromCurrency: string;
  transactionDate: string;
}) => {
  normalizedAmount: number;
  workspaceCurrency: string;
  normalizationRate: number;
  normalizationRateSource: string;
};

export type NormalizedTransactionPreview = NormalizedBankTransaction & {
  normalizedAmount: number;
  workspaceCurrency: string;
  normalizationRate: number;
  normalizationRateSource: string;
};


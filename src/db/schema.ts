import {
  boolean,
  char,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const importTypeEnum = pgEnum("import_type", ["bank", "investment"]);
export const fileKindEnum = pgEnum("file_kind", ["csv", "xlsx"]);
export const importStatusEnum = pgEnum("import_status", [
  "uploaded",
  "processing",
  "completed",
  "failed",
]);
export const classificationTypeEnum = pgEnum("classification_type", [
  "personal",
  "shared",
  "household",
  "income",
  "transfer",
  "ignore",
]);
export const eventKindEnum = pgEnum("event_kind", ["expense", "income"]);
export const sourceTypeEnum = pgEnum("source_type", ["transaction", "manual", "recurring"]);
export const reportingModeEnum = pgEnum("reporting_mode", [
  "payment_date",
  "allocated_period",
]);
export const allocationMethodEnum = pgEnum("allocation_method", [
  "single_month",
  "equal_split",
  "manual_split",
]);
export const splitModeEnum = pgEnum("split_mode", ["equal", "percentage", "fixed"]);
export const settlementStatusEnum = pgEnum("settlement_status", ["open", "settled", "ignored"]);
export const periodTypeEnum = pgEnum("period_type", ["month", "quarter", "year", "rolling_12m"]);
export const normalizationModeEnum = pgEnum("normalization_mode", [
  "monthly_average",
  "fixed_rate",
  "none",
]);
export const ruleMatchTypeEnum = pgEnum("rule_match_type", ["contains", "regex", "exact"]);
export const decisionSourceEnum = pgEnum("decision_source", [
  "rule",
  "user",
  "system_default",
]);
export const manualEntrySourceTypeEnum = pgEnum("manual_entry_source_type", [
  "one_time_manual",
  "recurring_generated",
]);
export const manualEntryOverrideTypeEnum = pgEnum("manual_entry_override_type", [
  "amount",
  "date",
  "category",
  "payer",
  "skip",
]);
export const investmentActivityTypeEnum = pgEnum("investment_activity_type", [
  "buy",
  "sell",
  "dividend",
  "fee",
  "cash_in",
  "cash_out",
]);
export const assetTypeEnum = pgEnum("asset_type", [
  "cash",
  "index",
  "stock",
  "fund",
  "bond",
  "other",
]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  ...timestamps,
});

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  baseCurrency: char("base_currency", { length: 3 }).notNull(),
  countryCode: char("country_code", { length: 2 }),
  ...timestamps,
});

export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    displayNameOverride: text("display_name_override"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    workspaceUserUnique: unique().on(table.workspaceId, table.userId),
  }),
);

export const importSources = pgTable("import_sources", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: importTypeEnum("type").notNull(),
  name: text("name").notNull(),
  countryCode: char("country_code", { length: 2 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  typeNameUnique: unique().on(table.type, table.name),
}));

export const importTemplates = pgTable("import_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  importSourceId: uuid("import_source_id")
    .notNull()
    .references(() => importSources.id),
  templateName: text("template_name").notNull(),
  fileKind: fileKindEnum("file_kind").notNull(),
  sheetNamePattern: text("sheet_name_pattern"),
  headerMappingJson: jsonb("header_mapping_json").notNull(),
  dateFormat: text("date_format"),
  amountRulesJson: jsonb("amount_rules_json"),
  sectionRulesJson: jsonb("section_rules_json"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
}, (table) => ({
  sourceTemplateUnique: unique().on(table.importSourceId, table.templateName),
}));

export const imports = pgTable(
  "imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    importSourceId: uuid("import_source_id").references(() => importSources.id),
    importTemplateId: uuid("import_template_id").references(() => importTemplates.id),
    type: importTypeEnum("type").notNull(),
    fileKind: fileKindEnum("file_kind").notNull(),
    originalFilename: text("original_filename").notNull(),
    storagePath: text("storage_path").notNull(),
    fileChecksum: text("file_checksum").notNull(),
    importStatus: importStatusEnum("import_status").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    errorSummary: text("error_summary"),
    ...timestamps,
  },
  (table) => ({
    workspaceTypeCreatedIdx: index("imports_workspace_type_created_idx").on(
      table.workspaceId,
      table.type,
      table.createdAt,
    ),
    workspaceChecksumTypeUnique: unique().on(table.workspaceId, table.fileChecksum, table.type),
  }),
);

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id),
    rowIndex: integer("row_index").notNull(),
    sheetName: text("sheet_name"),
    sectionName: text("section_name"),
    rawDataJson: jsonb("raw_data_json").notNull(),
    parseStatus: text("parse_status").notNull(),
    parseError: text("parse_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    importRowIdx: index("import_rows_import_row_idx").on(table.importId, table.rowIndex),
  }),
);

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  ownerMemberId: uuid("owner_member_id").references(() => workspaceMembers.id),
  accountType: text("account_type").notNull(),
  displayName: text("display_name").notNull(),
  importSourceId: uuid("import_source_id").references(() => importSources.id),
  externalAccountLabel: text("external_account_label"),
  ...timestamps,
});

export const transactions = pgTable(
  "transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    accountId: uuid("account_id")
      .notNull()
      .references(() => financialAccounts.id),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id),
    transactionDate: date("transaction_date").notNull(),
    bookingDate: date("booking_date"),
    statementSection: text("statement_section"),
    description: text("description").notNull(),
    merchantRaw: text("merchant_raw"),
    originalCurrency: char("original_currency", { length: 3 }),
    originalAmount: numeric("original_amount", { precision: 18, scale: 6 }).notNull(),
    settlementCurrency: char("settlement_currency", { length: 3 }),
    settlementAmount: numeric("settlement_amount", { precision: 18, scale: 6 }),
    workspaceCurrency: char("workspace_currency", { length: 3 }).notNull(),
    normalizedAmount: numeric("normalized_amount", { precision: 18, scale: 6 }).notNull(),
    normalizationRate: numeric("normalization_rate", { precision: 18, scale: 8 }),
    normalizationRateSource: text("normalization_rate_source"),
    direction: text("direction").notNull(),
    externalReference: text("external_reference"),
    dedupeHash: text("dedupe_hash").notNull(),
    ...timestamps,
  },
  (table) => ({
    workspaceTransactionDateIdx: index("transactions_workspace_date_idx").on(
      table.workspaceId,
      table.transactionDate,
    ),
    workspaceDedupeIdx: index("transactions_workspace_dedupe_idx").on(
      table.workspaceId,
      table.dedupeHash,
    ),
    importIdx: index("transactions_import_idx").on(table.importId),
  }),
);

export const transactionClassifications = pgTable(
  "transaction_classifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transactionId: uuid("transaction_id")
      .notNull()
      .references(() => transactions.id),
    classificationType: classificationTypeEnum("classification_type").notNull(),
    memberOwnerId: uuid("member_owner_id").references(() => workspaceMembers.id),
    category: text("category"),
    confidence: numeric("confidence", { precision: 5, scale: 4 }),
    decidedBy: decisionSourceEnum("decided_by").notNull(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    transactionUnique: unique().on(table.transactionId),
  }),
);

export const classificationRules = pgTable(
  "classification_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    matchType: ruleMatchTypeEnum("match_type").notNull(),
    matchValue: text("match_value").notNull(),
    defaultClassificationType: classificationTypeEnum("default_classification_type").notNull(),
    defaultMemberOwnerId: uuid("default_member_owner_id").references(() => workspaceMembers.id),
    defaultCategory: text("default_category"),
    priority: integer("priority").notNull().default(100),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    workspacePriorityIdx: index("classification_rules_workspace_priority_idx").on(
      table.workspaceId,
      table.active,
      table.priority,
    ),
  }),
);

export const expenseEvents = pgTable(
  "expense_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceType: sourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    eventKind: eventKindEnum("event_kind").notNull(),
    title: text("title").notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 6 }).notNull(),
    workspaceCurrency: char("workspace_currency", { length: 3 }).notNull(),
    classificationType: classificationTypeEnum("classification_type").notNull(),
    payerMemberId: uuid("payer_member_id").references(() => workspaceMembers.id),
    category: text("category"),
    reportingMode: reportingModeEnum("reporting_mode").notNull(),
    ...timestamps,
  },
  (table) => ({
    workspaceEventKindCategoryIdx: index("expense_events_workspace_kind_category_idx").on(
      table.workspaceId,
      table.eventKind,
      table.category,
    ),
    workspaceReportingModeIdx: index("expense_events_workspace_reporting_mode_idx").on(
      table.workspaceId,
      table.reportingMode,
    ),
  }),
);

export const expenseAllocations = pgTable(
  "expense_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseEventId: uuid("expense_event_id")
      .notNull()
      .references(() => expenseEvents.id),
    reportMonth: date("report_month").notNull(),
    allocatedAmount: numeric("allocated_amount", { precision: 18, scale: 6 }).notNull(),
    allocationMethod: allocationMethodEnum("allocation_method").notNull(),
    coverageStartDate: date("coverage_start_date"),
    coverageEndDate: date("coverage_end_date"),
    ...timestamps,
  },
  (table) => ({
    expenseEventIdx: index("expense_allocations_event_idx").on(table.expenseEventId),
    reportMonthIdx: index("expense_allocations_report_month_idx").on(table.reportMonth),
  }),
);

export const manualRecurringExpenses = pgTable("manual_recurring_expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  title: text("title").notNull(),
  eventKind: eventKindEnum("event_kind").notNull(),
  payerMemberId: uuid("payer_member_id").references(() => workspaceMembers.id),
  classificationType: classificationTypeEnum("classification_type").notNull(),
  category: text("category"),
  active: boolean("active").notNull().default(true),
  ...timestamps,
});

export const recurringEntryVersions = pgTable(
  "recurring_entry_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recurringEntryId: uuid("recurring_entry_id")
      .notNull()
      .references(() => manualRecurringExpenses.id),
    effectiveStartMonth: date("effective_start_month").notNull(),
    effectiveEndMonth: date("effective_end_month"),
    amount: numeric("amount", { precision: 18, scale: 6 }).notNull(),
    currency: char("currency", { length: 3 }).notNull(),
    normalizationMode: normalizationModeEnum("normalization_mode").notNull(),
    recurrenceRule: text("recurrence_rule").notNull(),
    notes: text("notes"),
    ...timestamps,
  },
  (table) => ({
    recurringEntryStartMonthIdx: index("recurring_entry_versions_entry_month_idx").on(
      table.recurringEntryId,
      table.effectiveStartMonth,
    ),
  }),
);

export const manualEntries = pgTable(
  "manual_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    sourceType: manualEntrySourceTypeEnum("source_type").notNull(),
    sourceId: uuid("source_id"),
    eventKind: eventKindEnum("event_kind").notNull(),
    title: text("title").notNull(),
    originalCurrency: char("original_currency", { length: 3 }).notNull(),
    originalAmount: numeric("original_amount", { precision: 18, scale: 6 }).notNull(),
    workspaceCurrency: char("workspace_currency", { length: 3 }).notNull(),
    normalizedAmount: numeric("normalized_amount", { precision: 18, scale: 6 }).notNull(),
    normalizationRate: numeric("normalization_rate", { precision: 18, scale: 8 }),
    normalizationRateSource: text("normalization_rate_source"),
    payerMemberId: uuid("payer_member_id").references(() => workspaceMembers.id),
    classificationType: classificationTypeEnum("classification_type").notNull(),
    category: text("category"),
    eventDate: date("event_date").notNull(),
    ...timestamps,
  },
  (table) => ({
    workspaceEventDateIdx: index("manual_entries_workspace_event_date_idx").on(
      table.workspaceId,
      table.eventDate,
    ),
    sourceIdx: index("manual_entries_source_idx").on(table.sourceType, table.sourceId),
  }),
);

export const manualEntryOverrides = pgTable("manual_entry_overrides", {
  id: uuid("id").defaultRandom().primaryKey(),
  manualEntryId: uuid("manual_entry_id")
    .notNull()
    .references(() => manualEntries.id),
  overrideType: manualEntryOverrideTypeEnum("override_type").notNull(),
  oldValueJson: jsonb("old_value_json"),
  newValueJson: jsonb("new_value_json").notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sharedExpenseSplits = pgTable(
  "shared_expense_splits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    expenseEventId: uuid("expense_event_id")
      .notNull()
      .references(() => expenseEvents.id),
    splitMode: splitModeEnum("split_mode").notNull(),
    splitDefinitionJson: jsonb("split_definition_json").notNull(),
    settlementStatus: settlementStatusEnum("settlement_status").notNull(),
    ...timestamps,
  },
  (table) => ({
    expenseEventIdx: index("shared_expense_splits_event_idx").on(table.expenseEventId),
  }),
);

export const investmentAccounts = pgTable("investment_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  ownerMemberId: uuid("owner_member_id").references(() => workspaceMembers.id),
  displayName: text("display_name").notNull(),
  importSourceId: uuid("import_source_id").references(() => importSources.id),
  accountCurrency: char("account_currency", { length: 3 }),
  ...timestamps,
});

export const investmentActivities = pgTable("investment_activities", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id),
  investmentAccountId: uuid("investment_account_id")
    .notNull()
    .references(() => investmentAccounts.id),
  importId: uuid("import_id")
    .notNull()
    .references(() => imports.id),
  activityDate: date("activity_date").notNull(),
  assetSymbol: text("asset_symbol"),
  assetName: text("asset_name").notNull(),
  activityType: investmentActivityTypeEnum("activity_type").notNull(),
  quantity: numeric("quantity", { precision: 18, scale: 8 }),
  unitPrice: numeric("unit_price", { precision: 18, scale: 8 }),
  totalAmount: numeric("total_amount", { precision: 18, scale: 6 }),
  currency: char("currency", { length: 3 }),
  normalizedAmount: numeric("normalized_amount", { precision: 18, scale: 6 }),
  ...timestamps,
});

export const holdingSnapshots = pgTable(
  "holding_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    investmentAccountId: uuid("investment_account_id")
      .notNull()
      .references(() => investmentAccounts.id),
    snapshotDate: date("snapshot_date").notNull(),
    assetName: text("asset_name").notNull(),
    assetSymbol: text("asset_symbol"),
    assetType: assetTypeEnum("asset_type").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 8 }),
    marketValue: numeric("market_value", { precision: 18, scale: 6 }).notNull(),
    marketValueCurrency: char("market_value_currency", { length: 3 }).notNull(),
    normalizedMarketValue: numeric("normalized_market_value", {
      precision: 18,
      scale: 6,
    }).notNull(),
    costBasis: numeric("cost_basis", { precision: 18, scale: 6 }),
    gainLoss: numeric("gain_loss", { precision: 18, scale: 6 }),
    ...timestamps,
  },
  (table) => ({
    workspaceSnapshotDateIdx: index("holding_snapshots_workspace_date_idx").on(
      table.workspaceId,
      table.snapshotDate,
    ),
  }),
);

export const exchangeRateMonthly = pgTable(
  "exchange_rate_monthly",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    baseCurrency: char("base_currency", { length: 3 }).notNull(),
    quoteCurrency: char("quote_currency", { length: 3 }).notNull(),
    yearMonth: date("year_month").notNull(),
    averageRate: numeric("average_rate", { precision: 18, scale: 8 }).notNull(),
    sourceName: text("source_name").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pairMonthSourceUnique: unique().on(
      table.baseCurrency,
      table.quoteCurrency,
      table.yearMonth,
      table.sourceName,
    ),
  }),
);

export const periodSummaries = pgTable(
  "period_summaries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id),
    periodType: periodTypeEnum("period_type").notNull(),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    summaryType: text("summary_type").notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).notNull().defaultNow(),
    summaryJson: jsonb("summary_json").notNull(),
  },
  (table) => ({
    periodLookupIdx: index("period_summaries_lookup_idx").on(
      table.workspaceId,
      table.periodType,
      table.periodStart,
      table.periodEnd,
      table.summaryType,
    ),
  }),
);

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobType: text("job_type").notNull(),
    jobPayload: jsonb("job_payload").notNull(),
    status: text("status").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    lastError: text("last_error"),
    ...timestamps,
  },
  (table) => ({
    statusAvailableIdx: index("jobs_status_available_idx").on(table.status, table.availableAt),
  }),
);

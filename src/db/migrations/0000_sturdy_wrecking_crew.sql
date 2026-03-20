CREATE TYPE "public"."allocation_method" AS ENUM('single_month', 'equal_split', 'manual_split');--> statement-breakpoint
CREATE TYPE "public"."asset_type" AS ENUM('cash', 'index', 'stock', 'fund', 'bond', 'other');--> statement-breakpoint
CREATE TYPE "public"."classification_type" AS ENUM('personal', 'shared', 'household', 'income', 'transfer', 'ignore');--> statement-breakpoint
CREATE TYPE "public"."decision_source" AS ENUM('rule', 'user', 'system_default');--> statement-breakpoint
CREATE TYPE "public"."event_kind" AS ENUM('expense', 'income');--> statement-breakpoint
CREATE TYPE "public"."file_kind" AS ENUM('csv', 'xlsx');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('uploaded', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_type" AS ENUM('bank', 'investment');--> statement-breakpoint
CREATE TYPE "public"."investment_activity_type" AS ENUM('buy', 'sell', 'dividend', 'fee', 'cash_in', 'cash_out');--> statement-breakpoint
CREATE TYPE "public"."manual_entry_override_type" AS ENUM('amount', 'date', 'category', 'payer', 'skip');--> statement-breakpoint
CREATE TYPE "public"."manual_entry_source_type" AS ENUM('one_time_manual', 'recurring_generated');--> statement-breakpoint
CREATE TYPE "public"."normalization_mode" AS ENUM('monthly_average', 'fixed_rate', 'none');--> statement-breakpoint
CREATE TYPE "public"."period_type" AS ENUM('month', 'quarter', 'year', 'rolling_12m');--> statement-breakpoint
CREATE TYPE "public"."reporting_mode" AS ENUM('payment_date', 'allocated_period');--> statement-breakpoint
CREATE TYPE "public"."rule_match_type" AS ENUM('contains', 'regex', 'exact');--> statement-breakpoint
CREATE TYPE "public"."settlement_status" AS ENUM('open', 'settled', 'ignored');--> statement-breakpoint
CREATE TYPE "public"."source_type" AS ENUM('transaction', 'manual', 'recurring');--> statement-breakpoint
CREATE TYPE "public"."split_mode" AS ENUM('equal', 'percentage', 'fixed');--> statement-breakpoint
CREATE TABLE "classification_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"match_type" "rule_match_type" NOT NULL,
	"match_value" text NOT NULL,
	"default_classification_type" "classification_type" NOT NULL,
	"default_member_owner_id" uuid,
	"default_category" text,
	"priority" integer DEFAULT 100 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rate_monthly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"base_currency" char(3) NOT NULL,
	"quote_currency" char(3) NOT NULL,
	"year_month" date NOT NULL,
	"average_rate" numeric(18, 8) NOT NULL,
	"source_name" text NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_rate_monthly_base_currency_quote_currency_year_month_source_name_unique" UNIQUE("base_currency","quote_currency","year_month","source_name")
);
--> statement-breakpoint
CREATE TABLE "expense_allocations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_event_id" uuid NOT NULL,
	"report_month" date NOT NULL,
	"allocated_amount" numeric(18, 6) NOT NULL,
	"allocation_method" "allocation_method" NOT NULL,
	"coverage_start_date" date,
	"coverage_end_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "expense_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" "source_type" NOT NULL,
	"source_id" uuid NOT NULL,
	"event_kind" "event_kind" NOT NULL,
	"title" text NOT NULL,
	"total_amount" numeric(18, 6) NOT NULL,
	"workspace_currency" char(3) NOT NULL,
	"classification_type" "classification_type" NOT NULL,
	"payer_member_id" uuid,
	"category" text,
	"reporting_mode" "reporting_mode" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "financial_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"account_type" text NOT NULL,
	"display_name" text NOT NULL,
	"import_source_id" uuid,
	"external_account_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holding_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"snapshot_date" date NOT NULL,
	"asset_name" text NOT NULL,
	"asset_symbol" text,
	"asset_type" "asset_type" NOT NULL,
	"quantity" numeric(18, 8),
	"market_value" numeric(18, 6) NOT NULL,
	"market_value_currency" char(3) NOT NULL,
	"normalized_market_value" numeric(18, 6) NOT NULL,
	"cost_basis" numeric(18, 6),
	"gain_loss" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"sheet_name" text,
	"section_name" text,
	"raw_data_json" jsonb NOT NULL,
	"parse_status" text NOT NULL,
	"parse_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "import_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "import_type" NOT NULL,
	"name" text NOT NULL,
	"country_code" char(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_sources_type_name_unique" UNIQUE("type","name")
);
--> statement-breakpoint
CREATE TABLE "import_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"import_source_id" uuid NOT NULL,
	"template_name" text NOT NULL,
	"file_kind" "file_kind" NOT NULL,
	"sheet_name_pattern" text,
	"header_mapping_json" jsonb NOT NULL,
	"date_format" text,
	"amount_rules_json" jsonb,
	"section_rules_json" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_templates_import_source_id_template_name_unique" UNIQUE("import_source_id","template_name")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"uploaded_by_user_id" uuid NOT NULL,
	"import_source_id" uuid,
	"import_template_id" uuid,
	"type" "import_type" NOT NULL,
	"file_kind" "file_kind" NOT NULL,
	"original_filename" text NOT NULL,
	"storage_path" text NOT NULL,
	"file_checksum" text NOT NULL,
	"import_status" "import_status" NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_summary" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "imports_workspace_id_file_checksum_type_unique" UNIQUE("workspace_id","file_checksum","type")
);
--> statement-breakpoint
CREATE TABLE "investment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"owner_member_id" uuid,
	"display_name" text NOT NULL,
	"import_source_id" uuid,
	"account_currency" char(3),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "investment_activities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"investment_account_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"activity_date" date NOT NULL,
	"asset_symbol" text,
	"asset_name" text NOT NULL,
	"activity_type" "investment_activity_type" NOT NULL,
	"quantity" numeric(18, 8),
	"unit_price" numeric(18, 8),
	"total_amount" numeric(18, 6),
	"currency" char(3),
	"normalized_amount" numeric(18, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" text NOT NULL,
	"job_payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"source_type" "manual_entry_source_type" NOT NULL,
	"source_id" uuid,
	"event_kind" "event_kind" NOT NULL,
	"title" text NOT NULL,
	"original_currency" char(3) NOT NULL,
	"original_amount" numeric(18, 6) NOT NULL,
	"workspace_currency" char(3) NOT NULL,
	"normalized_amount" numeric(18, 6) NOT NULL,
	"normalization_rate" numeric(18, 8),
	"normalization_rate_source" text,
	"payer_member_id" uuid,
	"classification_type" "classification_type" NOT NULL,
	"category" text,
	"event_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_entry_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"manual_entry_id" uuid NOT NULL,
	"override_type" "manual_entry_override_type" NOT NULL,
	"old_value_json" jsonb,
	"new_value_json" jsonb NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "manual_recurring_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"event_kind" "event_kind" NOT NULL,
	"payer_member_id" uuid,
	"classification_type" "classification_type" NOT NULL,
	"category" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"period_type" "period_type" NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"summary_type" text NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"summary_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_entry_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recurring_entry_id" uuid NOT NULL,
	"effective_start_month" date NOT NULL,
	"effective_end_month" date,
	"amount" numeric(18, 6) NOT NULL,
	"currency" char(3) NOT NULL,
	"normalization_mode" "normalization_mode" NOT NULL,
	"recurrence_rule" text NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_expense_splits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_event_id" uuid NOT NULL,
	"split_mode" "split_mode" NOT NULL,
	"split_definition_json" jsonb NOT NULL,
	"settlement_status" "settlement_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"transaction_id" uuid NOT NULL,
	"classification_type" "classification_type" NOT NULL,
	"member_owner_id" uuid,
	"category" text,
	"confidence" numeric(5, 4),
	"decided_by" "decision_source" NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transaction_classifications_transaction_id_unique" UNIQUE("transaction_id")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"transaction_date" date NOT NULL,
	"booking_date" date,
	"statement_section" text,
	"description" text NOT NULL,
	"merchant_raw" text,
	"original_currency" char(3),
	"original_amount" numeric(18, 6) NOT NULL,
	"settlement_currency" char(3),
	"settlement_amount" numeric(18, 6),
	"workspace_currency" char(3) NOT NULL,
	"normalized_amount" numeric(18, 6) NOT NULL,
	"normalization_rate" numeric(18, 8),
	"normalization_rate_source" text,
	"direction" text NOT NULL,
	"external_reference" text,
	"dedupe_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"display_name_override" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_unique" UNIQUE("workspace_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" char(3) NOT NULL,
	"country_code" char(2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_member_owner_id_workspace_members_id_fk" FOREIGN KEY ("default_member_owner_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_allocations" ADD CONSTRAINT "expense_allocations_expense_event_id_expense_events_id_fk" FOREIGN KEY ("expense_event_id") REFERENCES "public"."expense_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_payer_member_id_workspace_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "financial_accounts" ADD CONSTRAINT "financial_accounts_import_source_id_import_sources_id_fk" FOREIGN KEY ("import_source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_templates" ADD CONSTRAINT "import_templates_import_source_id_import_sources_id_fk" FOREIGN KEY ("import_source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_import_source_id_import_sources_id_fk" FOREIGN KEY ("import_source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_import_template_id_import_templates_id_fk" FOREIGN KEY ("import_template_id") REFERENCES "public"."import_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_import_source_id_import_sources_id_fk" FOREIGN KEY ("import_source_id") REFERENCES "public"."import_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_investment_account_id_investment_accounts_id_fk" FOREIGN KEY ("investment_account_id") REFERENCES "public"."investment_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "investment_activities" ADD CONSTRAINT "investment_activities_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_payer_member_id_workspace_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entry_overrides" ADD CONSTRAINT "manual_entry_overrides_manual_entry_id_manual_entries_id_fk" FOREIGN KEY ("manual_entry_id") REFERENCES "public"."manual_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_payer_member_id_workspace_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_summaries" ADD CONSTRAINT "period_summaries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_entry_versions" ADD CONSTRAINT "recurring_entry_versions_recurring_entry_id_manual_recurring_expenses_id_fk" FOREIGN KEY ("recurring_entry_id") REFERENCES "public"."manual_recurring_expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shared_expense_splits" ADD CONSTRAINT "shared_expense_splits_expense_event_id_expense_events_id_fk" FOREIGN KEY ("expense_event_id") REFERENCES "public"."expense_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_transaction_id_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_member_owner_id_workspace_members_id_fk" FOREIGN KEY ("member_owner_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_financial_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."financial_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classification_rules_workspace_priority_idx" ON "classification_rules" USING btree ("workspace_id","active","priority");--> statement-breakpoint
CREATE INDEX "expense_allocations_event_idx" ON "expense_allocations" USING btree ("expense_event_id");--> statement-breakpoint
CREATE INDEX "expense_allocations_report_month_idx" ON "expense_allocations" USING btree ("report_month");--> statement-breakpoint
CREATE INDEX "expense_events_workspace_kind_category_idx" ON "expense_events" USING btree ("workspace_id","event_kind","category");--> statement-breakpoint
CREATE INDEX "expense_events_workspace_reporting_mode_idx" ON "expense_events" USING btree ("workspace_id","reporting_mode");--> statement-breakpoint
CREATE INDEX "holding_snapshots_workspace_date_idx" ON "holding_snapshots" USING btree ("workspace_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "import_rows_import_row_idx" ON "import_rows" USING btree ("import_id","row_index");--> statement-breakpoint
CREATE INDEX "imports_workspace_type_created_idx" ON "imports" USING btree ("workspace_id","type","created_at");--> statement-breakpoint
CREATE INDEX "jobs_status_available_idx" ON "jobs" USING btree ("status","available_at");--> statement-breakpoint
CREATE INDEX "manual_entries_workspace_event_date_idx" ON "manual_entries" USING btree ("workspace_id","event_date");--> statement-breakpoint
CREATE INDEX "manual_entries_source_idx" ON "manual_entries" USING btree ("source_type","source_id");--> statement-breakpoint
CREATE INDEX "period_summaries_lookup_idx" ON "period_summaries" USING btree ("workspace_id","period_type","period_start","period_end","summary_type");--> statement-breakpoint
CREATE INDEX "recurring_entry_versions_entry_month_idx" ON "recurring_entry_versions" USING btree ("recurring_entry_id","effective_start_month");--> statement-breakpoint
CREATE INDEX "shared_expense_splits_event_idx" ON "shared_expense_splits" USING btree ("expense_event_id");--> statement-breakpoint
CREATE INDEX "transactions_workspace_date_idx" ON "transactions" USING btree ("workspace_id","transaction_date");--> statement-breakpoint
CREATE INDEX "transactions_workspace_dedupe_idx" ON "transactions" USING btree ("workspace_id","dedupe_hash");--> statement-breakpoint
CREATE INDEX "transactions_import_idx" ON "transactions" USING btree ("import_id");
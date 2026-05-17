CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."current_user_id"()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."is_workspace_member"("target_workspace_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "workspace_members"
    WHERE "workspace_members"."workspace_id" = "target_workspace_id"
      AND "workspace_members"."user_id" = "app"."current_user_id"()
      AND "workspace_members"."is_active" = true
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."is_workspace_owner"("target_workspace_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "workspace_members"
    WHERE "workspace_members"."workspace_id" = "target_workspace_id"
      AND "workspace_members"."user_id" = "app"."current_user_id"()
      AND "workspace_members"."is_active" = true
      AND "workspace_members"."role" = 'owner'
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_import"("target_import_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "imports"
    WHERE "imports"."id" = "target_import_id"
      AND "app"."is_workspace_member"("imports"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_financial_account"("target_account_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "financial_accounts"
    WHERE "financial_accounts"."id" = "target_account_id"
      AND "app"."is_workspace_member"("financial_accounts"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_transaction"("target_transaction_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "transactions"
    WHERE "transactions"."id" = "target_transaction_id"
      AND "app"."is_workspace_member"("transactions"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_expense_event"("target_expense_event_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "expense_events"
    WHERE "expense_events"."id" = "target_expense_event_id"
      AND "app"."is_workspace_member"("expense_events"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_recurring_entry"("target_recurring_entry_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "manual_recurring_expenses"
    WHERE "manual_recurring_expenses"."id" = "target_recurring_entry_id"
      AND "app"."is_workspace_member"("manual_recurring_expenses"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_manual_entry"("target_manual_entry_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "manual_entries"
    WHERE "manual_entries"."id" = "target_manual_entry_id"
      AND "app"."is_workspace_member"("manual_entries"."workspace_id")
  )
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."can_access_investment_account"("target_account_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "investment_accounts"
    WHERE "investment_accounts"."id" = "target_account_id"
      AND "app"."is_workspace_member"("investment_accounts"."workspace_id")
  )
$$;
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspaces" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_members" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "workspace_categories" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "import_sources" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "import_templates" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "imports" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "import_rows" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "financial_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transactions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "transaction_classifications" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "classification_rules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expense_events" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "expense_allocations" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "recurring_entry_versions" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "manual_entries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "manual_entry_overrides" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "shared_expense_splits" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "investment_accounts" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "investment_activities" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "holding_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "exchange_rate_monthly" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "period_summaries" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "users_select_workspace_peers" ON "users"
  FOR SELECT USING (
    "id" = "app"."current_user_id"()
    OR EXISTS (
      SELECT 1
      FROM "workspace_members" "current_member"
      INNER JOIN "workspace_members" "target_member"
        ON "target_member"."workspace_id" = "current_member"."workspace_id"
      WHERE "current_member"."user_id" = "app"."current_user_id"()
        AND "current_member"."is_active" = true
        AND "target_member"."user_id" = "users"."id"
    )
  );
--> statement-breakpoint
CREATE POLICY "users_insert_authenticated" ON "users"
  FOR INSERT WITH CHECK ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "users_update_self" ON "users"
  FOR UPDATE USING ("id" = "app"."current_user_id"())
  WITH CHECK ("id" = "app"."current_user_id"());
--> statement-breakpoint
CREATE POLICY "workspaces_select_member" ON "workspaces"
  FOR SELECT USING ("app"."is_workspace_member"("id"));
--> statement-breakpoint
CREATE POLICY "workspaces_insert_authenticated" ON "workspaces"
  FOR INSERT WITH CHECK ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "workspaces_update_owner" ON "workspaces"
  FOR UPDATE USING ("app"."is_workspace_owner"("id"))
  WITH CHECK ("app"."is_workspace_owner"("id"));
--> statement-breakpoint
CREATE POLICY "workspace_members_select_workspace" ON "workspace_members"
  FOR SELECT USING ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "workspace_members_insert_self_or_owner" ON "workspace_members"
  FOR INSERT WITH CHECK (
    "user_id" = "app"."current_user_id"()
    OR "app"."is_workspace_owner"("workspace_id")
  );
--> statement-breakpoint
CREATE POLICY "workspace_members_update_owner" ON "workspace_members"
  FOR UPDATE USING ("app"."is_workspace_owner"("workspace_id"))
  WITH CHECK ("app"."is_workspace_owner"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_workspace_categories" ON "workspace_categories"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "import_sources_select_authenticated" ON "import_sources"
  FOR SELECT USING ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "import_sources_insert_authenticated" ON "import_sources"
  FOR INSERT WITH CHECK ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "import_templates_select_authenticated" ON "import_templates"
  FOR SELECT USING ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "import_templates_insert_authenticated" ON "import_templates"
  FOR INSERT WITH CHECK ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "workspace_owned_imports" ON "imports"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "import_rows_by_import" ON "import_rows"
  FOR ALL USING ("app"."can_access_import"("import_id"))
  WITH CHECK ("app"."can_access_import"("import_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_financial_accounts" ON "financial_accounts"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_transactions" ON "transactions"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK (
    "app"."is_workspace_member"("workspace_id")
    AND "app"."can_access_financial_account"("account_id")
    AND "app"."can_access_import"("import_id")
  );
--> statement-breakpoint
CREATE POLICY "transaction_classifications_by_transaction" ON "transaction_classifications"
  FOR ALL USING ("app"."can_access_transaction"("transaction_id"))
  WITH CHECK ("app"."can_access_transaction"("transaction_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_classification_rules" ON "classification_rules"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_expense_events" ON "expense_events"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "expense_allocations_by_event" ON "expense_allocations"
  FOR ALL USING ("app"."can_access_expense_event"("expense_event_id"))
  WITH CHECK ("app"."can_access_expense_event"("expense_event_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_manual_recurring_expenses" ON "manual_recurring_expenses"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "recurring_entry_versions_by_entry" ON "recurring_entry_versions"
  FOR ALL USING ("app"."can_access_recurring_entry"("recurring_entry_id"))
  WITH CHECK ("app"."can_access_recurring_entry"("recurring_entry_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_manual_entries" ON "manual_entries"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "manual_entry_overrides_by_entry" ON "manual_entry_overrides"
  FOR ALL USING ("app"."can_access_manual_entry"("manual_entry_id"))
  WITH CHECK ("app"."can_access_manual_entry"("manual_entry_id"));
--> statement-breakpoint
CREATE POLICY "shared_expense_splits_by_event" ON "shared_expense_splits"
  FOR ALL USING ("app"."can_access_expense_event"("expense_event_id"))
  WITH CHECK ("app"."can_access_expense_event"("expense_event_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_investment_accounts" ON "investment_accounts"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));
--> statement-breakpoint
CREATE POLICY "workspace_owned_investment_activities" ON "investment_activities"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK (
    "app"."is_workspace_member"("workspace_id")
    AND "app"."can_access_investment_account"("investment_account_id")
    AND "app"."can_access_import"("import_id")
  );
--> statement-breakpoint
CREATE POLICY "workspace_owned_holding_snapshots" ON "holding_snapshots"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK (
    "app"."is_workspace_member"("workspace_id")
    AND "app"."can_access_investment_account"("investment_account_id")
    AND "app"."can_access_import"("import_id")
  );
--> statement-breakpoint
CREATE POLICY "exchange_rates_select_authenticated" ON "exchange_rate_monthly"
  FOR SELECT USING ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "exchange_rates_write_authenticated" ON "exchange_rate_monthly"
  FOR ALL USING ("app"."current_user_id"() IS NOT NULL)
  WITH CHECK ("app"."current_user_id"() IS NOT NULL);
--> statement-breakpoint
CREATE POLICY "workspace_owned_period_summaries" ON "period_summaries"
  FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
  WITH CHECK ("app"."is_workspace_member"("workspace_id"));

ALTER TABLE "classification_rules" ADD COLUMN "default_personal_owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD COLUMN "default_paid_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD COLUMN "default_received_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_events" ADD COLUMN "personal_owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_events" ADD COLUMN "received_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD COLUMN "personal_owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD COLUMN "received_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD COLUMN "personal_owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD COLUMN "received_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD COLUMN "personal_owner_member_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD COLUMN "paid_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD COLUMN "received_by_member_id" uuid;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_personal_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("default_personal_owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_paid_by_member_id_workspace_members_id_fk" FOREIGN KEY ("default_paid_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_received_by_member_id_workspace_members_id_fk" FOREIGN KEY ("default_received_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_personal_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("personal_owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_received_by_member_id_workspace_members_id_fk" FOREIGN KEY ("received_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_personal_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("personal_owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_received_by_member_id_workspace_members_id_fk" FOREIGN KEY ("received_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_personal_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("personal_owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_received_by_member_id_workspace_members_id_fk" FOREIGN KEY ("received_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_personal_owner_member_id_workspace_members_id_fk" FOREIGN KEY ("personal_owner_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_paid_by_member_id_workspace_members_id_fk" FOREIGN KEY ("paid_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_received_by_member_id_workspace_members_id_fk" FOREIGN KEY ("received_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
UPDATE "transaction_classifications" AS "tc"
SET
  "personal_owner_member_id" = CASE
    WHEN "tc"."classification_type" = 'personal' THEN "tc"."member_owner_id"
    ELSE NULL
  END,
  "paid_by_member_id" = CASE
    WHEN "tc"."classification_type" IN ('personal', 'household') THEN "fa"."owner_member_id"
    WHEN "tc"."classification_type" = 'shared' THEN "tc"."member_owner_id"
    ELSE NULL
  END,
  "received_by_member_id" = CASE
    WHEN "tc"."classification_type" = 'income' THEN "tc"."member_owner_id"
    ELSE NULL
  END,
  "updated_at" = now()
FROM "transactions" AS "t"
INNER JOIN "financial_accounts" AS "fa" ON "fa"."id" = "t"."account_id"
WHERE "tc"."transaction_id" = "t"."id";--> statement-breakpoint
UPDATE "transaction_classifications"
SET
  "member_owner_id" = CASE "classification_type"
    WHEN 'personal' THEN "personal_owner_member_id"
    WHEN 'shared' THEN "paid_by_member_id"
    WHEN 'household' THEN "paid_by_member_id"
    WHEN 'income' THEN "received_by_member_id"
    ELSE NULL
  END,
  "updated_at" = now();--> statement-breakpoint
UPDATE "manual_entries"
SET
  "personal_owner_member_id" = CASE
    WHEN "classification_type" = 'personal' THEN "payer_member_id"
    ELSE NULL
  END,
  "received_by_member_id" = CASE
    WHEN "classification_type" = 'income' THEN "payer_member_id"
    ELSE NULL
  END,
  "payer_member_id" = CASE
    WHEN "classification_type" IN ('personal', 'shared', 'household') THEN "payer_member_id"
    ELSE NULL
  END,
  "updated_at" = now();--> statement-breakpoint
UPDATE "manual_recurring_expenses"
SET
  "personal_owner_member_id" = CASE
    WHEN "classification_type" = 'personal' THEN "payer_member_id"
    ELSE NULL
  END,
  "received_by_member_id" = CASE
    WHEN "classification_type" = 'income' THEN "payer_member_id"
    ELSE NULL
  END,
  "payer_member_id" = CASE
    WHEN "classification_type" IN ('personal', 'shared', 'household') THEN "payer_member_id"
    ELSE NULL
  END,
  "updated_at" = now();--> statement-breakpoint
UPDATE "classification_rules"
SET
  "default_personal_owner_member_id" = CASE
    WHEN "default_classification_type" = 'personal' THEN "default_member_owner_id"
    ELSE NULL
  END,
  "default_paid_by_member_id" = CASE
    WHEN "default_classification_type" IN ('personal', 'shared', 'household') THEN "default_member_owner_id"
    ELSE NULL
  END,
  "default_received_by_member_id" = CASE
    WHEN "default_classification_type" = 'income' THEN "default_member_owner_id"
    ELSE NULL
  END,
  "updated_at" = now();--> statement-breakpoint
UPDATE "classification_rules"
SET
  "default_member_owner_id" = CASE "default_classification_type"
    WHEN 'personal' THEN "default_personal_owner_member_id"
    WHEN 'shared' THEN "default_paid_by_member_id"
    WHEN 'household' THEN "default_paid_by_member_id"
    WHEN 'income' THEN "default_received_by_member_id"
    ELSE NULL
  END,
  "updated_at" = now();--> statement-breakpoint
UPDATE "expense_events"
SET
  "personal_owner_member_id" = "transaction_classifications"."personal_owner_member_id",
  "payer_member_id" = "transaction_classifications"."paid_by_member_id",
  "received_by_member_id" = "transaction_classifications"."received_by_member_id",
  "updated_at" = now()
FROM "transaction_classifications"
WHERE "expense_events"."source_type" = 'transaction'
  AND "expense_events"."source_id" = "transaction_classifications"."transaction_id";--> statement-breakpoint
UPDATE "expense_events"
SET
  "personal_owner_member_id" = "manual_entries"."personal_owner_member_id",
  "payer_member_id" = "manual_entries"."payer_member_id",
  "received_by_member_id" = "manual_entries"."received_by_member_id",
  "updated_at" = now()
FROM "manual_entries"
WHERE "expense_events"."source_id" = "manual_entries"."id"
  AND (
    ("expense_events"."source_type" = 'manual' AND "manual_entries"."source_type" = 'one_time_manual')
    OR ("expense_events"."source_type" = 'recurring' AND "manual_entries"."source_type" = 'recurring_generated')
  );--> statement-breakpoint
DELETE FROM "shared_expense_splits"
USING "expense_events"
WHERE "shared_expense_splits"."expense_event_id" = "expense_events"."id"
  AND (
    "expense_events"."event_kind" <> 'expense'
    OR "expense_events"."classification_type" <> 'shared'
  );--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_member_attribution_check" CHECK ((
        (
          "classification_rules"."default_classification_type" = 'personal'
          AND "classification_rules"."default_personal_owner_member_id" IS NOT NULL
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" IN ('shared', 'household')
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" = 'income'
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_paid_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" IN ('transfer', 'ignore')
          AND "classification_rules"."default_personal_owner_member_id" IS NULL
          AND "classification_rules"."default_paid_by_member_id" IS NULL
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
      ));--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_member_attribution_check" CHECK ((
        (
          "expense_events"."classification_type" = 'personal'
          AND "expense_events"."personal_owner_member_id" IS NOT NULL
          AND "expense_events"."received_by_member_id" IS NULL
        )
        OR (
          "expense_events"."classification_type" IN ('shared', 'household')
          AND "expense_events"."personal_owner_member_id" IS NULL
          AND "expense_events"."received_by_member_id" IS NULL
        )
        OR (
          "expense_events"."classification_type" = 'income'
          AND "expense_events"."personal_owner_member_id" IS NULL
          AND "expense_events"."payer_member_id" IS NULL
        )
        OR (
          "expense_events"."classification_type" IN ('transfer', 'ignore')
          AND "expense_events"."personal_owner_member_id" IS NULL
          AND "expense_events"."payer_member_id" IS NULL
          AND "expense_events"."received_by_member_id" IS NULL
        )
      ));--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_member_attribution_check" CHECK ((
        (
          "manual_entries"."classification_type" = 'personal'
          AND "manual_entries"."personal_owner_member_id" IS NOT NULL
          AND "manual_entries"."received_by_member_id" IS NULL
        )
        OR (
          "manual_entries"."classification_type" IN ('shared', 'household')
          AND "manual_entries"."personal_owner_member_id" IS NULL
          AND "manual_entries"."received_by_member_id" IS NULL
        )
        OR (
          "manual_entries"."classification_type" = 'income'
          AND "manual_entries"."personal_owner_member_id" IS NULL
          AND "manual_entries"."payer_member_id" IS NULL
        )
        OR (
          "manual_entries"."classification_type" IN ('transfer', 'ignore')
          AND "manual_entries"."personal_owner_member_id" IS NULL
          AND "manual_entries"."payer_member_id" IS NULL
          AND "manual_entries"."received_by_member_id" IS NULL
        )
      ));--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_member_attribution_check" CHECK ((
        (
          "manual_recurring_expenses"."classification_type" = 'personal'
          AND "manual_recurring_expenses"."personal_owner_member_id" IS NOT NULL
          AND "manual_recurring_expenses"."received_by_member_id" IS NULL
        )
        OR (
          "manual_recurring_expenses"."classification_type" IN ('shared', 'household')
          AND "manual_recurring_expenses"."personal_owner_member_id" IS NULL
          AND "manual_recurring_expenses"."received_by_member_id" IS NULL
        )
        OR (
          "manual_recurring_expenses"."classification_type" = 'income'
          AND "manual_recurring_expenses"."personal_owner_member_id" IS NULL
          AND "manual_recurring_expenses"."payer_member_id" IS NULL
        )
        OR (
          "manual_recurring_expenses"."classification_type" IN ('transfer', 'ignore')
          AND "manual_recurring_expenses"."personal_owner_member_id" IS NULL
          AND "manual_recurring_expenses"."payer_member_id" IS NULL
          AND "manual_recurring_expenses"."received_by_member_id" IS NULL
        )
      ));--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_member_attribution_check" CHECK ((
        (
          "transaction_classifications"."classification_type" = 'personal'
          AND "transaction_classifications"."personal_owner_member_id" IS NOT NULL
          AND "transaction_classifications"."received_by_member_id" IS NULL
        )
        OR (
          "transaction_classifications"."classification_type" IN ('shared', 'household')
          AND "transaction_classifications"."personal_owner_member_id" IS NULL
          AND "transaction_classifications"."received_by_member_id" IS NULL
        )
        OR (
          "transaction_classifications"."classification_type" = 'income'
          AND "transaction_classifications"."personal_owner_member_id" IS NULL
          AND "transaction_classifications"."paid_by_member_id" IS NULL
        )
        OR (
          "transaction_classifications"."classification_type" IN ('transfer', 'ignore')
          AND "transaction_classifications"."personal_owner_member_id" IS NULL
          AND "transaction_classifications"."paid_by_member_id" IS NULL
          AND "transaction_classifications"."received_by_member_id" IS NULL
        )
      ));

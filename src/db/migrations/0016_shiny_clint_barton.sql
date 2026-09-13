-- Shared spending scope: add split_for_settlement, map household -> shared, then recreate the enum.
-- Mapping matches src/features/expenses/spending-scope.ts inferBackfillSplitForSettlement
-- with an absent stored flag (the column is new).
ALTER TABLE "classification_decision_batches" ADD COLUMN "previous_splits" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "classification_rules" ADD COLUMN "default_split_for_settlement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expense_events" ADD COLUMN "split_for_settlement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD COLUMN "split_for_settlement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD COLUMN "split_for_settlement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD COLUMN "split_for_settlement" boolean DEFAULT false NOT NULL;--> statement-breakpoint
DELETE FROM "shared_expense_splits"
USING "expense_events"
WHERE "shared_expense_splits"."expense_event_id" = "expense_events"."id"
  AND "expense_events"."classification_type" = 'household';--> statement-breakpoint
UPDATE "transaction_classifications" AS "tc"
SET "split_for_settlement" = true
FROM "transactions" AS "t"
WHERE "tc"."transaction_id" = "t"."id"
  AND "tc"."classification_type" = 'shared'
  AND (
    SELECT count(*)::int
    FROM "workspace_members" AS "wm"
    WHERE "wm"."workspace_id" = "t"."workspace_id"
      AND "wm"."is_active" = true
  ) >= 2;--> statement-breakpoint
UPDATE "classification_rules" AS "cr"
SET "default_split_for_settlement" = true
WHERE "cr"."default_classification_type" = 'shared'
  AND (
    SELECT count(*)::int
    FROM "workspace_members" AS "wm"
    WHERE "wm"."workspace_id" = "cr"."workspace_id"
      AND "wm"."is_active" = true
  ) >= 2;--> statement-breakpoint
UPDATE "manual_entries" AS "me"
SET "split_for_settlement" = true
WHERE "me"."classification_type" = 'shared'
  AND (
    SELECT count(*)::int
    FROM "workspace_members" AS "wm"
    WHERE "wm"."workspace_id" = "me"."workspace_id"
      AND "wm"."is_active" = true
  ) >= 2;--> statement-breakpoint
UPDATE "manual_recurring_expenses" AS "mre"
SET "split_for_settlement" = true
WHERE "mre"."classification_type" = 'shared'
  AND (
    SELECT count(*)::int
    FROM "workspace_members" AS "wm"
    WHERE "wm"."workspace_id" = "mre"."workspace_id"
      AND "wm"."is_active" = true
  ) >= 2;--> statement-breakpoint
UPDATE "expense_events" AS "ee"
SET "split_for_settlement" = true
WHERE "ee"."classification_type" = 'shared'
  AND (
    SELECT count(*)::int
    FROM "workspace_members" AS "wm"
    WHERE "wm"."workspace_id" = "ee"."workspace_id"
      AND "wm"."is_active" = true
  ) >= 2;--> statement-breakpoint
UPDATE "transaction_classifications"
SET "classification_type" = 'shared'
WHERE "classification_type" = 'household';--> statement-breakpoint
UPDATE "classification_rules"
SET "default_classification_type" = 'shared'
WHERE "default_classification_type" = 'household';--> statement-breakpoint
UPDATE "manual_entries"
SET "classification_type" = 'shared'
WHERE "classification_type" = 'household';--> statement-breakpoint
UPDATE "manual_recurring_expenses"
SET "classification_type" = 'shared'
WHERE "classification_type" = 'household';--> statement-breakpoint
UPDATE "expense_events"
SET "classification_type" = 'shared'
WHERE "classification_type" = 'household';--> statement-breakpoint
UPDATE "expense_events" AS "ee"
SET
  "classification_type" = "tc"."classification_type",
  "split_for_settlement" = "tc"."split_for_settlement"
FROM "transaction_classifications" AS "tc"
WHERE "ee"."source_type" = 'transaction'
  AND "ee"."source_id" = "tc"."transaction_id";--> statement-breakpoint
UPDATE "expense_events" AS "ee"
SET
  "classification_type" = "me"."classification_type",
  "split_for_settlement" = "me"."split_for_settlement"
FROM "manual_entries" AS "me"
WHERE "ee"."source_id" = "me"."id"
  AND "ee"."source_type" IN ('manual', 'recurring');--> statement-breakpoint
ALTER TABLE "classification_rules" DROP CONSTRAINT "classification_rules_member_attribution_check";--> statement-breakpoint
ALTER TABLE "expense_events" DROP CONSTRAINT "expense_events_member_attribution_check";--> statement-breakpoint
ALTER TABLE "manual_entries" DROP CONSTRAINT "manual_entries_member_attribution_check";--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" DROP CONSTRAINT "manual_recurring_expenses_member_attribution_check";--> statement-breakpoint
ALTER TABLE "transaction_classifications" DROP CONSTRAINT "transaction_classifications_member_attribution_check";--> statement-breakpoint
ALTER TABLE "classification_rules" ALTER COLUMN "default_classification_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "expense_events" ALTER COLUMN "classification_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "manual_entries" ALTER COLUMN "classification_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ALTER COLUMN "classification_type" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ALTER COLUMN "classification_type" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."classification_type";--> statement-breakpoint
CREATE TYPE "public"."classification_type" AS ENUM('personal', 'shared', 'income', 'transfer', 'ignore');--> statement-breakpoint
ALTER TABLE "classification_rules" ALTER COLUMN "default_classification_type" SET DATA TYPE "public"."classification_type" USING "default_classification_type"::"public"."classification_type";--> statement-breakpoint
ALTER TABLE "expense_events" ALTER COLUMN "classification_type" SET DATA TYPE "public"."classification_type" USING "classification_type"::"public"."classification_type";--> statement-breakpoint
ALTER TABLE "manual_entries" ALTER COLUMN "classification_type" SET DATA TYPE "public"."classification_type" USING "classification_type"::"public"."classification_type";--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ALTER COLUMN "classification_type" SET DATA TYPE "public"."classification_type" USING "classification_type"::"public"."classification_type";--> statement-breakpoint
ALTER TABLE "transaction_classifications" ALTER COLUMN "classification_type" SET DATA TYPE "public"."classification_type" USING "classification_type"::"public"."classification_type";--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_split_for_settlement_check" CHECK ("classification_rules"."default_split_for_settlement" = false OR "classification_rules"."default_classification_type" = 'shared');--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_member_attribution_check" CHECK ((
        (
          "classification_rules"."default_classification_type" = 'personal'
          AND "classification_rules"."default_received_by_member_id" IS NULL
        )
        OR (
          "classification_rules"."default_classification_type" = 'shared'
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
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_split_for_settlement_check" CHECK ("expense_events"."split_for_settlement" = false OR "expense_events"."classification_type" = 'shared');--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_member_attribution_check" CHECK ((
        (
          "expense_events"."classification_type" = 'personal'
          AND "expense_events"."personal_owner_member_id" IS NOT NULL
          AND "expense_events"."received_by_member_id" IS NULL
        )
        OR (
          "expense_events"."classification_type" = 'shared'
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
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_split_for_settlement_check" CHECK ("manual_entries"."split_for_settlement" = false OR "manual_entries"."classification_type" = 'shared');--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_member_attribution_check" CHECK ((
        (
          "manual_entries"."classification_type" = 'personal'
          AND "manual_entries"."personal_owner_member_id" IS NOT NULL
          AND "manual_entries"."received_by_member_id" IS NULL
        )
        OR (
          "manual_entries"."classification_type" = 'shared'
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
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_split_for_settlement_check" CHECK ("manual_recurring_expenses"."split_for_settlement" = false OR "manual_recurring_expenses"."classification_type" = 'shared');--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_member_attribution_check" CHECK ((
        (
          "manual_recurring_expenses"."classification_type" = 'personal'
          AND "manual_recurring_expenses"."personal_owner_member_id" IS NOT NULL
          AND "manual_recurring_expenses"."received_by_member_id" IS NULL
        )
        OR (
          "manual_recurring_expenses"."classification_type" = 'shared'
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
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_split_for_settlement_check" CHECK ("transaction_classifications"."split_for_settlement" = false OR "transaction_classifications"."classification_type" = 'shared');--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_member_attribution_check" CHECK ((
        (
          "transaction_classifications"."classification_type" = 'personal'
          AND "transaction_classifications"."personal_owner_member_id" IS NOT NULL
          AND "transaction_classifications"."received_by_member_id" IS NULL
        )
        OR (
          "transaction_classifications"."classification_type" = 'shared'
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

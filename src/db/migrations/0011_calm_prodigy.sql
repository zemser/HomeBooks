-- Normalize legacy rows that were accepted before payer and event-kind rules were unified.
UPDATE "manual_recurring_expenses"
SET
  "classification_type" = CASE
    WHEN "event_kind" = 'income' THEN 'income'::"classification_type"
    WHEN "classification_type" = 'income' THEN 'household'::"classification_type"
    ELSE "classification_type"
  END,
  "updated_at" = now()
WHERE
  ("event_kind" = 'income' AND "classification_type" <> 'income')
  OR ("event_kind" = 'expense' AND "classification_type" = 'income');
--> statement-breakpoint
UPDATE "manual_entries"
SET
  "classification_type" = CASE
    WHEN "event_kind" = 'income' THEN 'income'::"classification_type"
    WHEN "classification_type" = 'income' THEN 'household'::"classification_type"
    ELSE "classification_type"
  END,
  "updated_at" = now()
WHERE
  ("event_kind" = 'income' AND "classification_type" <> 'income')
  OR ("event_kind" = 'expense' AND "classification_type" = 'income');
--> statement-breakpoint
UPDATE "manual_recurring_expenses"
SET "payer_member_id" = NULL, "updated_at" = now()
WHERE "payer_member_id" IS NOT NULL
  AND "classification_type" NOT IN ('personal', 'shared', 'income');
--> statement-breakpoint
UPDATE "manual_entries"
SET "payer_member_id" = NULL, "updated_at" = now()
WHERE "payer_member_id" IS NOT NULL
  AND "classification_type" NOT IN ('personal', 'shared', 'income');
--> statement-breakpoint
UPDATE "transaction_classifications"
SET "member_owner_id" = NULL, "updated_at" = now()
WHERE "member_owner_id" IS NOT NULL
  AND "classification_type" NOT IN ('personal', 'shared', 'income');
--> statement-breakpoint
UPDATE "classification_rules"
SET "default_member_owner_id" = NULL, "updated_at" = now()
WHERE "default_member_owner_id" IS NOT NULL
  AND "default_classification_type" NOT IN ('personal', 'shared', 'income');
--> statement-breakpoint
DELETE FROM "manual_entry_overrides"
USING "manual_entries"
WHERE "manual_entry_overrides"."manual_entry_id" = "manual_entries"."id"
  AND "manual_entry_overrides"."override_type" = 'payer'
  AND "manual_entries"."classification_type" NOT IN ('personal', 'shared', 'income');
--> statement-breakpoint
UPDATE "expense_events"
SET
  "payer_member_id" = "transaction_classifications"."member_owner_id",
  "updated_at" = now()
FROM "transaction_classifications"
WHERE "expense_events"."source_type" = 'transaction'
  AND "expense_events"."source_id" = "transaction_classifications"."transaction_id";
--> statement-breakpoint
UPDATE "expense_events"
SET
  "event_kind" = "manual_entries"."event_kind",
  "classification_type" = "manual_entries"."classification_type",
  "payer_member_id" = "manual_entries"."payer_member_id",
  "updated_at" = now()
FROM "manual_entries"
WHERE "expense_events"."source_id" = "manual_entries"."id"
  AND (
    ("expense_events"."source_type" = 'manual' AND "manual_entries"."source_type" = 'one_time_manual')
    OR ("expense_events"."source_type" = 'recurring' AND "manual_entries"."source_type" = 'recurring_generated')
  );
--> statement-breakpoint
DELETE FROM "shared_expense_splits"
USING "expense_events"
WHERE "shared_expense_splits"."expense_event_id" = "expense_events"."id"
  AND (
    "expense_events"."event_kind" <> 'expense'
    OR "expense_events"."classification_type" <> 'shared'
  );
--> statement-breakpoint
DELETE FROM "manual_entry_overrides"
WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "manual_entry_id", "override_type"
        ORDER BY "changed_at" DESC, "id" DESC
      ) AS "duplicate_rank"
    FROM "manual_entry_overrides"
  ) AS "ranked_overrides"
  WHERE "duplicate_rank" > 1
);
--> statement-breakpoint
ALTER TABLE "manual_entry_overrides" ADD CONSTRAINT "manual_entry_overrides_manual_entry_id_override_type_unique" UNIQUE("manual_entry_id","override_type");

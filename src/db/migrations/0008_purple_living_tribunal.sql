ALTER TABLE "classification_rules" ADD COLUMN "default_category_id" uuid;--> statement-breakpoint
ALTER TABLE "expense_events" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD COLUMN "category_id" uuid;--> statement-breakpoint
WITH "legacy_categories" AS (
  SELECT "transactions"."workspace_id", btrim("transaction_classifications"."category") AS "name"
  FROM "transaction_classifications"
  INNER JOIN "transactions" ON "transactions"."id" = "transaction_classifications"."transaction_id"
  WHERE nullif(btrim("transaction_classifications"."category"), '') IS NOT NULL
  UNION ALL
  SELECT "workspace_id", btrim("default_category")
  FROM "classification_rules"
  WHERE nullif(btrim("default_category"), '') IS NOT NULL
  UNION ALL
  SELECT "workspace_id", btrim("category")
  FROM "expense_events"
  WHERE nullif(btrim("category"), '') IS NOT NULL
  UNION ALL
  SELECT "workspace_id", btrim("category")
  FROM "manual_entries"
  WHERE nullif(btrim("category"), '') IS NOT NULL
  UNION ALL
  SELECT "workspace_id", btrim("category")
  FROM "manual_recurring_expenses"
  WHERE nullif(btrim("category"), '') IS NOT NULL
)
INSERT INTO "workspace_categories" ("workspace_id", "name", "canonical_name")
SELECT "workspace_id", min("name"), lower("name")
FROM "legacy_categories"
GROUP BY "workspace_id", lower("name")
ON CONFLICT ("workspace_id", "canonical_name") DO NOTHING;--> statement-breakpoint
INSERT INTO "workspace_categories" ("workspace_id", "name", "canonical_name")
SELECT "workspaces"."id", "starter"."name", lower("starter"."name")
FROM "workspaces"
CROSS JOIN (
  VALUES
    ('Groceries'), ('Dining'), ('Housing'), ('Utilities'), ('Transport'),
    ('Healthcare'), ('Insurance'), ('Shopping'), ('Entertainment'), ('Travel'),
    ('Education'), ('Gifts'), ('Fees'), ('Income'), ('Uncategorized'), ('Other')
) AS "starter"("name")
WHERE NOT EXISTS (
  SELECT 1 FROM "workspace_categories"
  WHERE "workspace_categories"."workspace_id" = "workspaces"."id"
)
ON CONFLICT ("workspace_id", "canonical_name") DO NOTHING;--> statement-breakpoint
UPDATE "transaction_classifications"
SET "category_id" = "workspace_categories"."id"
FROM "transactions", "workspace_categories"
WHERE "transactions"."id" = "transaction_classifications"."transaction_id"
  AND "workspace_categories"."workspace_id" = "transactions"."workspace_id"
  AND "workspace_categories"."canonical_name" = lower(btrim("transaction_classifications"."category"));--> statement-breakpoint
UPDATE "classification_rules"
SET "default_category_id" = "workspace_categories"."id"
FROM "workspace_categories"
WHERE "workspace_categories"."workspace_id" = "classification_rules"."workspace_id"
  AND "workspace_categories"."canonical_name" = lower(btrim("classification_rules"."default_category"));--> statement-breakpoint
UPDATE "expense_events"
SET "category_id" = "workspace_categories"."id"
FROM "workspace_categories"
WHERE "workspace_categories"."workspace_id" = "expense_events"."workspace_id"
  AND "workspace_categories"."canonical_name" = lower(btrim("expense_events"."category"));--> statement-breakpoint
UPDATE "manual_entries"
SET "category_id" = "workspace_categories"."id"
FROM "workspace_categories"
WHERE "workspace_categories"."workspace_id" = "manual_entries"."workspace_id"
  AND "workspace_categories"."canonical_name" = lower(btrim("manual_entries"."category"));--> statement-breakpoint
UPDATE "manual_recurring_expenses"
SET "category_id" = "workspace_categories"."id"
FROM "workspace_categories"
WHERE "workspace_categories"."workspace_id" = "manual_recurring_expenses"."workspace_id"
  AND "workspace_categories"."canonical_name" = lower(btrim("manual_recurring_expenses"."category"));--> statement-breakpoint
ALTER TABLE "classification_rules" ADD CONSTRAINT "classification_rules_default_category_id_workspace_categories_id_fk" FOREIGN KEY ("default_category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_events" ADD CONSTRAINT "expense_events_category_id_workspace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_entries" ADD CONSTRAINT "manual_entries_category_id_workspace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_recurring_expenses" ADD CONSTRAINT "manual_recurring_expenses_category_id_workspace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_classifications" ADD CONSTRAINT "transaction_classifications_category_id_workspace_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;

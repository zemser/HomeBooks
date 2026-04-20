CREATE TABLE "workspace_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"canonical_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_categories_workspace_canonical_unique" UNIQUE("workspace_id","canonical_name")
);
--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD CONSTRAINT "workspace_categories_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_categories_workspace_created_idx" ON "workspace_categories" USING btree ("workspace_id","created_at");--> statement-breakpoint
INSERT INTO "workspace_categories" ("id", "workspace_id", "name", "canonical_name", "created_at", "updated_at")
SELECT
	gen_random_uuid(),
	deduped."workspace_id",
	deduped."name",
	deduped."canonical_name",
	now(),
	now()
FROM (
	SELECT DISTINCT ON (source."workspace_id", source."canonical_name")
		source."workspace_id",
		source."name",
		source."canonical_name"
	FROM (
		SELECT
			"transactions"."workspace_id" AS "workspace_id",
			btrim("transaction_classifications"."category") AS "name",
			lower(btrim("transaction_classifications"."category")) AS "canonical_name"
		FROM "transaction_classifications"
		INNER JOIN "transactions"
			ON "transactions"."id" = "transaction_classifications"."transaction_id"
		WHERE btrim("transaction_classifications"."category") <> ''
		UNION ALL
		SELECT
			"classification_rules"."workspace_id" AS "workspace_id",
			btrim("classification_rules"."default_category") AS "name",
			lower(btrim("classification_rules"."default_category")) AS "canonical_name"
		FROM "classification_rules"
		WHERE btrim("classification_rules"."default_category") <> ''
		UNION ALL
		SELECT
			"manual_entries"."workspace_id" AS "workspace_id",
			btrim("manual_entries"."category") AS "name",
			lower(btrim("manual_entries"."category")) AS "canonical_name"
		FROM "manual_entries"
		WHERE btrim("manual_entries"."category") <> ''
		UNION ALL
		SELECT
			"manual_recurring_expenses"."workspace_id" AS "workspace_id",
			btrim("manual_recurring_expenses"."category") AS "name",
			lower(btrim("manual_recurring_expenses"."category")) AS "canonical_name"
		FROM "manual_recurring_expenses"
		WHERE btrim("manual_recurring_expenses"."category") <> ''
		UNION ALL
		SELECT
			"expense_events"."workspace_id" AS "workspace_id",
			btrim("expense_events"."category") AS "name",
			lower(btrim("expense_events"."category")) AS "canonical_name"
		FROM "expense_events"
		WHERE btrim("expense_events"."category") <> ''
	) source
	ORDER BY source."workspace_id", source."canonical_name", source."name"
) deduped;

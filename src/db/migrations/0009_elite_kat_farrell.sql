CREATE TYPE "public"."category_applicability" AS ENUM('expense', 'income', 'both');--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "parent_category_id" uuid;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "applicability" "category_applicability" DEFAULT 'both' NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "sort_order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "icon" text;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD COLUMN "color" text;--> statement-breakpoint
WITH "ordered_categories" AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "workspace_id"
      ORDER BY lower("name"), "created_at", "id"
    ) * 10 AS "next_sort_order"
  FROM "workspace_categories"
)
UPDATE "workspace_categories"
SET "sort_order" = "ordered_categories"."next_sort_order"
FROM "ordered_categories"
WHERE "workspace_categories"."id" = "ordered_categories"."id";--> statement-breakpoint
UPDATE "workspace_categories"
SET "applicability" = CASE
  WHEN lower("canonical_name") IN ('income', 'salary', 'salaray')
    THEN 'income'::"category_applicability"
  WHEN lower("canonical_name") IN (
    'groceries', 'dining', 'housing', 'utilities', 'transport', 'healthcare',
    'insurance', 'shopping', 'entertainment', 'travel', 'education', 'gifts', 'fees'
  ) THEN 'expense'::"category_applicability"
  ELSE 'both'::"category_applicability"
END;--> statement-breakpoint
ALTER TABLE "workspace_categories" ADD CONSTRAINT "workspace_categories_parent_category_id_workspace_categories_id_fk" FOREIGN KEY ("parent_category_id") REFERENCES "public"."workspace_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_categories_workspace_sort_idx" ON "workspace_categories" USING btree ("workspace_id","active","sort_order");

WITH seeded_sources AS (
  INSERT INTO "import_sources" ("type", "name", "country_code")
  VALUES
    ('bank', 'Max', 'IL'),
    ('bank', 'Cal', 'IL'),
    ('investment', 'Excellence', 'IL')
  ON CONFLICT ("type", "name") DO UPDATE
    SET "country_code" = EXCLUDED."country_code"
  RETURNING "id", "type", "name"
)
INSERT INTO "import_templates" (
  "import_source_id",
  "template_name",
  "file_kind",
  "header_mapping_json",
  "active"
)
SELECT
  "seeded_sources"."id",
  "template_definition"."template_name",
  "template_definition"."file_kind"::"file_kind",
  '{}'::jsonb,
  true
FROM "seeded_sources"
INNER JOIN (
  VALUES
    ('bank'::"import_type", 'Max', 'max_credit_statement', 'xlsx'),
    ('bank'::"import_type", 'Cal', 'cal_card_export', 'xlsx'),
    ('bank'::"import_type", 'Cal', 'cal_recent_transactions_report', 'xlsx')
) AS "template_definition"("type", "source_name", "template_name", "file_kind")
  ON "template_definition"."type" = "seeded_sources"."type"
  AND "template_definition"."source_name" = "seeded_sources"."name"
ON CONFLICT ("import_source_id", "template_name") DO UPDATE
  SET
    "file_kind" = EXCLUDED."file_kind",
    "header_mapping_json" = EXCLUDED."header_mapping_json",
    "active" = true,
    "updated_at" = now();

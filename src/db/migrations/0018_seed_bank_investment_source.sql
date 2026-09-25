INSERT INTO "import_sources" ("type", "name", "country_code")
VALUES ('investment', 'Bank', 'IL')
ON CONFLICT ("type", "name") DO UPDATE
  SET "country_code" = EXCLUDED."country_code";

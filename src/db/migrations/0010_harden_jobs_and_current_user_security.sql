-- The jobs table is an internal worker queue, not browser/API data.
REVOKE ALL ON TABLE "public"."jobs" FROM "anon", "authenticated";
--> statement-breakpoint
ALTER TABLE "public"."jobs" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS "No API access to internal jobs" ON "public"."jobs";
--> statement-breakpoint
CREATE POLICY "No API access to internal jobs"
  ON "public"."jobs"
  FOR ALL
  TO "anon", "authenticated"
  USING (false)
  WITH CHECK (false);
--> statement-breakpoint
-- Pin the helper search path so name resolution cannot be influenced by a caller.
CREATE OR REPLACE FUNCTION "app"."current_user_id"()
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = pg_catalog
AS $$
  SELECT nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

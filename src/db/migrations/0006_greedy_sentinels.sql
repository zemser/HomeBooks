CREATE TABLE "classification_decision_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"action_type" text NOT NULL,
	"transaction_ids" jsonb NOT NULL,
	"previous_classifications" jsonb NOT NULL,
	"previous_rules" jsonb DEFAULT 'null'::jsonb,
	"rule_match_value" text,
	"undone_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classification_decision_batches" ADD CONSTRAINT "classification_decision_batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classification_decision_batches" ADD CONSTRAINT "classification_decision_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "classification_decision_batches_workspace_created_idx" ON "classification_decision_batches" USING btree ("workspace_id","created_at");
--> statement-breakpoint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'finapp_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "classification_decision_batches" TO "finapp_app";
  END IF;
END
$$;
--> statement-breakpoint
ALTER TABLE "classification_decision_batches" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regprocedure('app.is_workspace_member(uuid)') IS NOT NULL
    AND to_regprocedure('app.current_user_id()') IS NOT NULL THEN
    EXECUTE $policy$
      CREATE POLICY "workspace_owned_classification_decision_batches"
      ON "classification_decision_batches"
      FOR ALL USING ("app"."is_workspace_member"("workspace_id"))
      WITH CHECK (
        "app"."is_workspace_member"("workspace_id")
        AND "user_id" = "app"."current_user_id"()
      )
    $policy$;
  END IF;
END
$$;

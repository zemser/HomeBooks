ALTER TABLE "holding_snapshots" ADD COLUMN "import_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD COLUMN "canonical_display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "holding_snapshots" ADD CONSTRAINT "holding_snapshots_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "holding_snapshots_import_idx" ON "holding_snapshots" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "holding_snapshots_account_date_idx" ON "holding_snapshots" USING btree ("investment_account_id","snapshot_date");--> statement-breakpoint
ALTER TABLE "investment_accounts" ADD CONSTRAINT "investment_accounts_workspace_owner_source_canonical_unique" UNIQUE("workspace_id","owner_member_id","import_source_id","canonical_display_name");
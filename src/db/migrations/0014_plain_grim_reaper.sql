CREATE TABLE "workspace_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"invited_email" text NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"workspace_name_snapshot" text NOT NULL,
	"invited_by_display_name" text NOT NULL,
	"accepted_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invites_status_check" CHECK ("workspace_invites"."status" in ('pending', 'accepted', 'declined', 'revoked')),
	CONSTRAINT "workspace_invites_role_check" CHECK ("workspace_invites"."role" in ('owner', 'member')),
	CONSTRAINT "workspace_invites_email_lower_check" CHECK ("workspace_invites"."invited_email" = lower("workspace_invites"."invited_email"))
);
--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_accepted_by_user_id_users_id_fk" FOREIGN KEY ("accepted_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invites_pending_email_unique" ON "workspace_invites" USING btree ("workspace_id","invited_email") WHERE "workspace_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "workspace_invites_email_status_idx" ON "workspace_invites" USING btree ("invited_email","status");--> statement-breakpoint
CREATE INDEX "workspace_invites_workspace_created_idx" ON "workspace_invites" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."workspace_has_members"("target_workspace_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "workspace_members"
    WHERE "workspace_members"."workspace_id" = "target_workspace_id"
  )
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION "app"."has_pending_workspace_invite"("target_workspace_id" uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "workspace_invites"
    INNER JOIN "users"
      ON "users"."id" = "app"."current_user_id"()
    WHERE "workspace_invites"."workspace_id" = "target_workspace_id"
      AND "workspace_invites"."status" = 'pending'
      AND "workspace_invites"."invited_email" = lower("users"."email")
  )
$$;--> statement-breakpoint
DROP POLICY IF EXISTS "workspace_members_insert_self_or_owner" ON "workspace_members";--> statement-breakpoint
CREATE POLICY "workspace_members_insert_self_or_owner" ON "workspace_members"
  FOR INSERT WITH CHECK (
    "app"."is_workspace_owner"("workspace_id")
    OR (
      "user_id" = "app"."current_user_id"()
      AND "role" = 'member'
      AND "app"."has_pending_workspace_invite"("workspace_id")
    )
    OR (
      "user_id" = "app"."current_user_id"()
      AND "role" = 'owner'
      AND NOT "app"."workspace_has_members"("workspace_id")
    )
  );--> statement-breakpoint
ALTER TABLE "workspace_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "workspace_invites_select_member_or_invitee" ON "workspace_invites"
  FOR SELECT USING (
    "app"."is_workspace_member"("workspace_id")
    OR "invited_email" = (
      SELECT lower("users"."email")
      FROM "users"
      WHERE "users"."id" = "app"."current_user_id"()
    )
  );--> statement-breakpoint
CREATE POLICY "workspace_invites_insert_owner" ON "workspace_invites"
  FOR INSERT WITH CHECK (
    "app"."is_workspace_owner"("workspace_id")
    AND "role" = 'member'
    AND "status" = 'pending'
    AND "invited_by_user_id" = "app"."current_user_id"()
  );--> statement-breakpoint
CREATE POLICY "workspace_invites_update_owner_or_invitee" ON "workspace_invites"
  FOR UPDATE USING (
    (
      "app"."is_workspace_owner"("workspace_id")
      AND "status" = 'pending'
    )
    OR (
      "status" = 'pending'
      AND "invited_email" = (
        SELECT lower("users"."email")
        FROM "users"
        WHERE "users"."id" = "app"."current_user_id"()
      )
    )
  )
  WITH CHECK (
    (
      "app"."is_workspace_owner"("workspace_id")
      AND "role" = 'member'
      AND "status" = 'revoked'
    )
    OR (
      "invited_email" = (
        SELECT lower("users"."email")
        FROM "users"
        WHERE "users"."id" = "app"."current_user_id"()
      )
      AND "role" = 'member'
      AND "status" IN ('accepted', 'declined')
    )
  );

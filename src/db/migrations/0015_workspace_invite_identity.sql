CREATE OR REPLACE FUNCTION "app"."workspace_invites_protect_identity"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id
    OR NEW.invited_email IS DISTINCT FROM OLD.invited_email
    OR NEW.invited_by_user_id IS DISTINCT FROM OLD.invited_by_user_id
    OR NEW.role IS DISTINCT FROM OLD.role
    OR NEW.workspace_name_snapshot IS DISTINCT FROM OLD.workspace_name_snapshot
    OR NEW.invited_by_display_name IS DISTINCT FROM OLD.invited_by_display_name
  THEN
    RAISE EXCEPTION 'workspace invite identity cannot change'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "workspace_invites_protect_identity" ON "workspace_invites";
--> statement-breakpoint
CREATE TRIGGER "workspace_invites_protect_identity"
  BEFORE UPDATE ON "workspace_invites"
  FOR EACH ROW
  EXECUTE FUNCTION "app"."workspace_invites_protect_identity"();

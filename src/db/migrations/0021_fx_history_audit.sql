CREATE TABLE public.fx_history_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id),
  run_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('transaction', 'manual', 'recurring')),
  source_id uuid NOT NULL,
  reason text NOT NULL,
  effective_date date NOT NULL,
  before_value jsonb NOT NULL,
  after_value jsonb NOT NULL,
  after_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, run_id, source_kind, source_id)
);
--> statement-breakpoint
ALTER TABLE public.fx_history_audit ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY fx_history_member_read ON public.fx_history_audit FOR SELECT
USING (app.is_workspace_member(workspace_id));
--> statement-breakpoint
CREATE POLICY fx_history_member_insert ON public.fx_history_audit FOR INSERT
WITH CHECK (app.is_workspace_member(workspace_id));
--> statement-breakpoint
REVOKE ALL ON public.fx_history_audit FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'finapp_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.fx_history_audit FROM finapp_app;
    GRANT SELECT, INSERT ON public.fx_history_audit TO finapp_app;
  END IF;
END $$;
--> statement-breakpoint
CREATE FUNCTION public.fx_repair_workspaces(base text, quote text, observation_month date)
RETURNS TABLE ("workspaceId" uuid, "memberId" uuid, "userId" uuid, "baseCurrency" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT w.id, member.id, member.user_id, w.base_currency::text
  FROM public.workspaces w
  CROSS JOIN LATERAL (
    SELECT m.id, m.user_id FROM public.workspace_members m
    WHERE m.workspace_id = w.id AND m.is_active ORDER BY m.id LIMIT 1
  ) member
  WHERE w.fx_policy = 'previous-month-v1' AND (
    EXISTS (SELECT FROM public.transactions t WHERE t.workspace_id = w.id
      AND t.valuation_state = 'pending' AND t.reference_month = observation_month
      AND (t.settlement_currency, t.workspace_currency) IN ((base, quote),(quote, base)))
    OR EXISTS (SELECT FROM public.manual_entries m WHERE m.workspace_id = w.id
      AND m.valuation_state = 'pending' AND m.reference_month = observation_month
      AND (m.original_currency, m.workspace_currency) IN ((base, quote),(quote, base)))
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION public.fx_repair_workspaces(text,text,date) FROM PUBLIC, anon, authenticated;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='homebooks_fx_worker') THEN
    CREATE ROLE homebooks_fx_worker NOLOGIN;
  END IF;
END $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION public.fx_repair_workspaces(text,text,date) TO homebooks_fx_worker;

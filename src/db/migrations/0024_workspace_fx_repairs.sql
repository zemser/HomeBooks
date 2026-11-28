-- The lookup is callable only by the background worker, outside the Data API.
DROP FUNCTION public.fx_repair_workspaces(text, text, date);
--> statement-breakpoint
CREATE FUNCTION app.fx_repair_workspaces(base text, quote text, observation_month date, household uuid DEFAULT NULL)
RETURNS TABLE ("workspaceId" uuid, "memberId" uuid, "userId" uuid, "baseCurrency" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT w.id, member.id, member.user_id, w.base_currency::text
  FROM public.workspaces w
  CROSS JOIN LATERAL (
    SELECT m.id, m.user_id FROM public.workspace_members m
    WHERE m.workspace_id = w.id AND m.is_active ORDER BY m.id LIMIT 1
  ) member
  WHERE (household IS NULL OR w.id = household) AND w.fx_policy = 'previous-month-v1' AND (
    EXISTS (SELECT FROM public.transactions t WHERE t.workspace_id = w.id
      AND t.valuation_state = 'pending' AND t.reference_month = observation_month
      AND (t.settlement_currency, t.workspace_currency) IN ((base, quote),(quote, base)))
    OR EXISTS (SELECT FROM public.manual_entries m WHERE m.workspace_id = w.id
      AND m.valuation_state = 'pending' AND m.reference_month = observation_month
      AND (m.original_currency, m.workspace_currency) IN ((base, quote),(quote, base)))
  )
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.fx_repair_workspaces(text,text,date,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app.fx_repair_workspaces(text,text,date,uuid) TO homebooks_fx_worker;
--> statement-breakpoint
CREATE TABLE app.fx_workspace_repairs (
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL,
  year_month date NOT NULL,
  cursor_id uuid,
  cursor_kind text,
  rescan_requested boolean NOT NULL DEFAULT false,
  available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  failed_at timestamptz,
  PRIMARY KEY (workspace_id, base_currency, quote_currency, year_month)
);
CREATE INDEX fx_workspace_repairs_available_idx ON app.fx_workspace_repairs(available_at);
ALTER TABLE app.fx_workspace_repairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY fx_worker_workspace_queue ON app.fx_workspace_repairs TO homebooks_fx_worker USING (true) WITH CHECK (true);
REVOKE ALL ON app.fx_workspace_repairs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.fx_workspace_repairs TO homebooks_fx_worker;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS transactions_pending_fx_idx ON public.transactions(workspace_id,reference_month,id)
WHERE valuation_state='pending';
CREATE INDEX IF NOT EXISTS manual_entries_pending_fx_idx ON public.manual_entries(workspace_id,reference_month,id)
WHERE valuation_state='pending';

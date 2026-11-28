ALTER TABLE public.exchange_rate_monthly
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS series_code text,
  ADD COLUMN IF NOT EXISTS calculation_version text,
  ADD COLUMN IF NOT EXISTS observation_count integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS public.fx_rate_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), base_currency char(3) NOT NULL,
  quote_currency char(3) NOT NULL, year_month date NOT NULL,
  phase text NOT NULL DEFAULT 'fetch' CHECK (phase IN ('fetch','refresh','repair')),
  attempts integer NOT NULL DEFAULT 0, available_at timestamptz NOT NULL DEFAULT now(),
  lease uuid, requested_during_repair boolean NOT NULL DEFAULT false, last_error text, failed_at timestamptz,
  UNIQUE (base_currency,quote_currency,year_month)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS fx_rate_requests_available_idx ON public.fx_rate_requests(available_at);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='homebooks_fx_worker') THEN
    CREATE ROLE homebooks_fx_worker NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE public.fx_rate_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exchange_rate_monthly ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exchange_rates_write_authenticated ON public.exchange_rate_monthly;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exchange_rate_monthly FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.fx_rate_requests FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public, app TO homebooks_fx_worker;
GRANT SELECT, INSERT ON public.exchange_rate_monthly TO homebooks_fx_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fx_rate_requests TO homebooks_fx_worker;
DROP POLICY IF EXISTS fx_worker_cache_read ON public.exchange_rate_monthly;
CREATE POLICY fx_worker_cache_read ON public.exchange_rate_monthly FOR SELECT TO homebooks_fx_worker USING (true);
DROP POLICY IF EXISTS fx_worker_cache_insert ON public.exchange_rate_monthly;
CREATE POLICY fx_worker_cache_insert ON public.exchange_rate_monthly FOR INSERT TO homebooks_fx_worker WITH CHECK (true);
DROP POLICY IF EXISTS fx_worker_queue ON public.fx_rate_requests;
CREATE POLICY fx_worker_queue ON public.fx_rate_requests TO homebooks_fx_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION app.request_missing_fx_rates(keys jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
  IF app.current_user_id() IS NULL AND NOT pg_has_role(session_user, current_user, 'MEMBER') THEN
    RAISE EXCEPTION 'Missing application identity';
  END IF;
  INSERT INTO public.fx_rate_requests(base_currency, quote_currency, year_month, available_at)
  SELECT DISTINCT k."baseCurrency", 'ILS', k."yearMonth",
    greatest(now(), (k."yearMonth" + interval '1 month') AT TIME ZONE 'Asia/Jerusalem')
  FROM jsonb_to_recordset(keys) AS k("baseCurrency" text, "quoteCurrency" text, "yearMonth" date)
  WHERE k."baseCurrency" IN ('AUD','CAD','CHF','DKK','EGP','EUR','GBP','JOD','JPY','LBP','NOK','SEK','USD','ZAR')
    AND k."quoteCurrency"='ILS' AND extract(day from k."yearMonth")=1
    AND k."yearMonth" BETWEEN date '1960-01-01' AND current_date + interval '2 years'
  ON CONFLICT (base_currency,quote_currency,year_month) DO UPDATE SET requested_during_repair=true
  WHERE fx_rate_requests.phase='repair' AND fx_rate_requests.lease IS NOT NULL
    AND NOT fx_rate_requests.requested_during_repair;
END;
$$;
--> statement-breakpoint
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname='finapp_app') THEN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exchange_rate_monthly FROM finapp_app;
    REVOKE ALL ON public.fx_rate_requests FROM finapp_app;
    GRANT USAGE ON SCHEMA app TO finapp_app;
    GRANT EXECUTE ON FUNCTION app.request_missing_fx_rates(jsonb) TO finapp_app;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION app.request_missing_fx_rates(jsonb) FROM PUBLIC, anon;

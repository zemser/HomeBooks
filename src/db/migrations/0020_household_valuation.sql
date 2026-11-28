ALTER TABLE workspaces ADD COLUMN fx_policy text NOT NULL DEFAULT 'legacy'
  CHECK (fx_policy IN ('legacy', 'previous-month-v1'));
--> statement-breakpoint
ALTER TABLE transactions
  ADD COLUMN valuation_policy text NOT NULL DEFAULT 'legacy' CHECK (valuation_policy IN ('legacy','previous-month-v1')),
  ADD COLUMN valuation_state text NOT NULL DEFAULT 'legacy' CHECK (valuation_state IN ('legacy','recorded','converted','pending')),
  ADD COLUMN reference_month date,
  ADD COLUMN exchange_rate_id uuid REFERENCES exchange_rate_monthly(id);
--> statement-breakpoint
ALTER TABLE manual_entries
  ADD COLUMN valuation_policy text NOT NULL DEFAULT 'legacy' CHECK (valuation_policy IN ('legacy','previous-month-v1')),
  ADD COLUMN valuation_state text NOT NULL DEFAULT 'legacy' CHECK (valuation_state IN ('legacy','recorded','converted','pending')),
  ADD COLUMN reference_month date,
  ADD COLUMN exchange_rate_id uuid REFERENCES exchange_rate_monthly(id);

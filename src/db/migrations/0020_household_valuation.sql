ALTER TABLE workspaces ADD COLUMN IF NOT EXISTS fx_policy text NOT NULL DEFAULT 'legacy',
  ADD CONSTRAINT workspaces_fx_policy_check CHECK (fx_policy IN ('legacy', 'previous-month-v1'));
--> statement-breakpoint
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS valuation_policy text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS valuation_state text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS reference_month date,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES exchange_rate_monthly(id),
  ADD CONSTRAINT transactions_valuation_policy_check CHECK (valuation_policy IN ('legacy','previous-month-v1')),
  ADD CONSTRAINT transactions_valuation_state_check CHECK (valuation_state IN ('legacy','recorded','converted','pending'));
--> statement-breakpoint
ALTER TABLE manual_entries
  ADD COLUMN IF NOT EXISTS valuation_policy text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS valuation_state text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS reference_month date,
  ADD COLUMN IF NOT EXISTS exchange_rate_id uuid REFERENCES exchange_rate_monthly(id),
  ADD CONSTRAINT manual_entries_valuation_policy_check CHECK (valuation_policy IN ('legacy','previous-month-v1')),
  ADD CONSTRAINT manual_entries_valuation_state_check CHECK (valuation_state IN ('legacy','recorded','converted','pending'));

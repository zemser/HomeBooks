# Finance App Schema Reference

## Purpose

Implemented database schema reference based on `src/db/schema.ts` and current migrations in `src/db/migrations`.

Use this file for table/enum/constraint-level details. Keep product direction in `docs/general-design.md`.

## Source of truth

- Drizzle schema: `src/db/schema.ts`
- migrations: `src/db/migrations/*.sql`

## Current migration baseline

- `0000_sturdy_wrecking_crew.sql`
- `0001_special_tattoo.sql`
- `0002_lethal_ironclad.sql`
- `0003_high_hemingway.sql`

## Enums

- `import_type`: `bank`, `investment`
- `file_kind`: `csv`, `xlsx`
- `import_status`: `uploaded`, `processing`, `completed`, `failed`
- `classification_type`: `personal`, `shared`, `household`, `income`, `transfer`, `ignore`
- `event_kind`: `expense`, `income`
- `source_type`: `transaction`, `manual`, `recurring`
- `reporting_mode`: `payment_date`, `allocated_period`
- `allocation_method`: `single_month`, `equal_split`, `manual_split`
- `split_mode`: `equal`, `percentage`, `fixed`
- `settlement_status`: `open`, `settled`, `ignored`
- `period_type`: `month`, `quarter`, `year`, `rolling_12m`
- `normalization_mode`: `monthly_average`, `fixed_rate`, `none`
- `rule_match_type`: `contains`, `regex`, `exact`
- `decision_source`: `rule`, `user`, `system_default`
- `manual_entry_source_type`: `one_time_manual`, `recurring_generated`
- `manual_entry_override_type`: `amount`, `date`, `category`, `payer`, `skip`
- `investment_activity_type`: `buy`, `sell`, `dividend`, `fee`, `cash_in`, `cash_out`
- `asset_type`: `cash`, `index`, `stock`, `fund`, `bond`, `other`

## Tables

### Identity/workspaces

- `users`
  - PK: `id`
  - unique: `email`
- `workspaces`
  - PK: `id`
- `workspace_members`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, `user_id -> users.id`
  - unique: `(workspace_id, user_id)`
- `workspace_categories`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`
  - unique: `(workspace_id, canonical_name)`
  - index: `(workspace_id, created_at)`

### Imports

- `import_sources`
  - PK: `id`
  - unique: `(type, name)`
- `import_templates`
  - PK: `id`
  - FK: `import_source_id -> import_sources.id`
  - unique: `(import_source_id, template_name)`
- `imports`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, `uploaded_by_user_id -> users.id`, optional `import_source_id`, optional `import_template_id`
  - unique: `(workspace_id, file_checksum, type)`
  - index: `(workspace_id, type, created_at)`
- `import_rows`
  - PK: `id`
  - FK: `import_id -> imports.id`
  - index: `(import_id, row_index)`

### Expense ledger and classification

- `financial_accounts`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `owner_member_id -> workspace_members.id`, optional `import_source_id -> import_sources.id`
- `transactions`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, `account_id -> financial_accounts.id`, `import_id -> imports.id`
  - key money fields: `original_amount numeric(18,6)`, `normalized_amount numeric(18,6)`, `normalization_rate numeric(18,8)`
  - indexes: `(workspace_id, transaction_date)`, `(workspace_id, dedupe_hash)`, `(import_id)`
- `transaction_classifications`
  - PK: `id`
  - FK: `transaction_id -> transactions.id`, optional `member_owner_id -> workspace_members.id`
  - unique: `(transaction_id)`
- `classification_rules`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `default_member_owner_id -> workspace_members.id`
  - index: `(workspace_id, active, priority)`

### Reporting/events/allocations

- `expense_events`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `payer_member_id -> workspace_members.id`
  - source pointers: `source_type`, `source_id`
  - indexes: `(workspace_id, event_kind, category)`, `(workspace_id, reporting_mode)`
- `expense_allocations`
  - PK: `id`
  - FK: `expense_event_id -> expense_events.id`
  - indexes: `(expense_event_id)`, `(report_month)`
- `period_summaries`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`
  - index: `(workspace_id, period_type, period_start, period_end, summary_type)`

### Manual and recurring

- `manual_recurring_expenses`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `payer_member_id -> workspace_members.id`
- `recurring_entry_versions`
  - PK: `id`
  - FK: `recurring_entry_id -> manual_recurring_expenses.id`
  - index: `(recurring_entry_id, effective_start_month)`
- `manual_entries`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `payer_member_id -> workspace_members.id`
  - source pointers: `source_type`, `source_id`
  - indexes: `(workspace_id, event_date)`, `(source_type, source_id)`
- `manual_entry_overrides`
  - PK: `id`
  - FK: `manual_entry_id -> manual_entries.id`

### Shared settlements

- `shared_expense_splits`
  - PK: `id`
  - FK: `expense_event_id -> expense_events.id`
  - unique: `(expense_event_id)`
  - index: `(expense_event_id)`

### Investments and FX

- `investment_accounts`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, optional `owner_member_id -> workspace_members.id`, optional `import_source_id -> import_sources.id`
  - unique: `(workspace_id, owner_member_id, import_source_id, canonical_display_name)`
- `investment_activities`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, `investment_account_id -> investment_accounts.id`, `import_id -> imports.id`
- `holding_snapshots`
  - PK: `id`
  - FK: `workspace_id -> workspaces.id`, `import_id -> imports.id`, `investment_account_id -> investment_accounts.id`
  - indexes: `(workspace_id, snapshot_date)`, `(import_id)`, `(investment_account_id, snapshot_date)`
- `exchange_rate_monthly`
  - PK: `id`
  - unique: `(base_currency, quote_currency, year_month, source_name)`

### Jobs

- `jobs`
  - PK: `id`
  - index: `(status, available_at)`

## Data integrity and operational notes

- money values are stored as `numeric` (typically precision 18)
- FX rates are stored as `numeric(18,8)`
- dedupe on imports uses `(workspace_id, file_checksum, type)`
- dedupe for classified transaction relation uses one row per `transaction_id`
- one shared split definition per `expense_event_id`

## RLS status

RLS is now represented by migration `src/db/migrations/0004_hosted_rls_foundation.sql`.

That migration adds:

- `app.current_user_id()` as the request-scoped authenticated user lookup
- workspace membership and ownership helper functions
- child-record access helpers for imports, accounts, transactions, expense events, recurring entries, manual entries, and investment accounts
- RLS enablement for the app-owned workspace tables
- policies for workspace-owned records, onboarding inserts, owner-managed workspace/member updates, import catalogs, exchange rates, and derived child records

The Drizzle snapshot metadata still does not model RLS policy details directly, so the SQL migration is the authoritative RLS reference.

## When to update this doc

Update this file whenever schema changes land in `src/db/schema.ts` or new SQL migrations are added.

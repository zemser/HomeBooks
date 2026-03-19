# Finance App Database Schema

## Purpose

This document translates the product and architecture decisions into a concrete database design for the MVP and near-term extensions.

It is optimized for:

- one PostgreSQL database
- one household workspace per couple or family unit
- imported bank and investment files
- period-based reporting
- multi-currency normalization
- recurring entries with history

## Design rules

- keep original imported values for auditability
- never overwrite historical records silently
- separate raw imports from normalized records
- separate transaction facts from reporting allocations
- store enough metadata to recompute summaries at any time

## Core enums

### `import_type`

- `bank`
- `investment`

### `file_kind`

- `csv`
- `xlsx`

### `import_status`

- `uploaded`
- `processing`
- `completed`
- `failed`

### `classification_type`

- `personal`
- `shared`
- `household`
- `income`
- `transfer`
- `ignore`

### `event_kind`

- `expense`
- `income`

### `source_type`

- `transaction`
- `manual`
- `recurring`

### `reporting_mode`

- `payment_date`
- `allocated_period`

### `allocation_method`

- `single_month`
- `equal_split`
- `manual_split`

### `split_mode`

- `equal`
- `percentage`
- `fixed`

### `settlement_status`

- `open`
- `settled`
- `ignored`

### `period_type`

- `month`
- `quarter`
- `year`
- `rolling_12m`

### `normalization_mode`

- `monthly_average`
- `fixed_rate`
- `none`

### `rule_match_type`

- `contains`
- `regex`
- `exact`

### `decision_source`

- `rule`
- `user`
- `system_default`

### `manual_entry_source_type`

- `one_time_manual`
- `recurring_generated`

### `manual_entry_override_type`

- `amount`
- `date`
- `category`
- `payer`
- `skip`

### `investment_activity_type`

- `buy`
- `sell`
- `dividend`
- `fee`
- `cash_in`
- `cash_out`

### `asset_type`

- `cash`
- `index`
- `stock`
- `fund`
- `bond`
- `other`

## Workspace and users

### `users`

```text
id uuid pk
email text unique not null
display_name text not null
created_at timestamptz not null
updated_at timestamptz not null
```

### `workspaces`

```text
id uuid pk
name text not null
base_currency char(3) not null
country_code char(2) nullable
created_at timestamptz not null
updated_at timestamptz not null
```

### `workspace_members`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
user_id uuid fk -> users.id not null
role text not null
display_name_override text nullable
is_active boolean not null default true
created_at timestamptz not null
updated_at timestamptz not null
```

Constraints:

- unique `(workspace_id, user_id)`

## Imports

### `import_sources`

Provider catalog for banks, brokers, card issuers, and similar sources.

```text
id uuid pk
type import_type not null
name text not null
country_code char(2) nullable
created_at timestamptz not null
```

### `import_templates`

Template definitions for known file layouts.

```text
id uuid pk
import_source_id uuid fk -> import_sources.id not null
template_name text not null
file_kind file_kind not null
sheet_name_pattern text nullable
header_mapping_json jsonb not null
date_format text nullable
amount_rules_json jsonb nullable
section_rules_json jsonb nullable
active boolean not null default true
created_at timestamptz not null
updated_at timestamptz not null
```

Important use:

- `sheet_name_pattern` supports Excel imports
- `section_rules_json` supports statement sections like “transactions billed in dollars”

### `imports`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
uploaded_by_user_id uuid fk -> users.id not null
import_source_id uuid fk -> import_sources.id nullable
import_template_id uuid fk -> import_templates.id nullable
type import_type not null
file_kind file_kind not null
original_filename text not null
storage_path text not null
file_checksum text not null
import_status import_status not null
started_at timestamptz nullable
completed_at timestamptz nullable
error_summary text nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, type, created_at desc)`
- unique `(workspace_id, file_checksum, type)`

### `import_rows`

Staging rows for debugging and reprocessing.

```text
id uuid pk
import_id uuid fk -> imports.id not null
row_index integer not null
sheet_name text nullable
section_name text nullable
raw_data_json jsonb not null
parse_status text not null
parse_error text nullable
created_at timestamptz not null
```

Indexes:

- `(import_id, row_index)`

## Financial accounts

### `financial_accounts`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
owner_member_id uuid fk -> workspace_members.id nullable
account_type text not null
display_name text not null
import_source_id uuid fk -> import_sources.id nullable
external_account_label text nullable
created_at timestamptz not null
updated_at timestamptz not null
```

## Transactions

### `transactions`

Normalized cash movement records from bank-like imports.

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
account_id uuid fk -> financial_accounts.id not null
import_id uuid fk -> imports.id not null
transaction_date date not null
booking_date date nullable
statement_section text nullable
description text not null
merchant_raw text nullable
original_currency char(3) nullable
original_amount numeric(18,6) not null
settlement_currency char(3) nullable
settlement_amount numeric(18,6) nullable
workspace_currency char(3) not null
normalized_amount numeric(18,6) not null
normalization_rate numeric(18,8) nullable
normalization_rate_source text nullable
direction text not null
external_reference text nullable
dedupe_hash text not null
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, transaction_date desc)`
- `(workspace_id, dedupe_hash)`
- `(import_id)`

Notes:

- `original_amount` keeps source amount
- `settlement_amount` supports credit-card statements where billed currency differs from merchant currency
- `normalized_amount` is always in workspace currency

## Classification

### `transaction_classifications`

```text
id uuid pk
transaction_id uuid fk -> transactions.id not null
classification_type classification_type not null
member_owner_id uuid fk -> workspace_members.id nullable
category text nullable
confidence numeric(5,4) nullable
decided_by decision_source not null
reviewed_at timestamptz nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Constraints:

- unique `(transaction_id)`

### `classification_rules`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
match_type rule_match_type not null
match_value text not null
default_classification_type classification_type not null
default_member_owner_id uuid fk -> workspace_members.id nullable
default_category text nullable
priority integer not null default 100
active boolean not null default true
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, active, priority)`

## Expense and income events

### `expense_events`

Core reporting objects for both expenses and income.

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
source_type source_type not null
source_id uuid not null
event_kind event_kind not null
title text not null
total_amount numeric(18,6) not null
workspace_currency char(3) not null
classification_type classification_type not null
payer_member_id uuid fk -> workspace_members.id nullable
category text nullable
reporting_mode reporting_mode not null
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, event_kind, category)`
- `(workspace_id, reporting_mode)`

### `expense_allocations`

```text
id uuid pk
expense_event_id uuid fk -> expense_events.id not null
report_month date not null
allocated_amount numeric(18,6) not null
allocation_method allocation_method not null
coverage_start_date date nullable
coverage_end_date date nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(expense_event_id)`
- `(report_month)`

Constraint:

- `report_month` should always be normalized to the first day of that month

## Manual and recurring entries

### `manual_recurring_expenses`

Despite the legacy name, this table should support recurring income too.

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
title text not null
event_kind event_kind not null
payer_member_id uuid fk -> workspace_members.id nullable
classification_type classification_type not null
category text nullable
active boolean not null default true
created_at timestamptz not null
updated_at timestamptz not null
```

### `recurring_entry_versions`

```text
id uuid pk
recurring_entry_id uuid fk -> manual_recurring_expenses.id not null
effective_start_month date not null
effective_end_month date nullable
amount numeric(18,6) not null
currency char(3) not null
normalization_mode normalization_mode not null
recurrence_rule text not null
notes text nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(recurring_entry_id, effective_start_month desc)`

Constraint:

- versions for the same recurring entry must not overlap in effective month range

### `manual_entries`

One-off or generated manual records that feed reporting.

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
source_type manual_entry_source_type not null
source_id uuid nullable
event_kind event_kind not null
title text not null
original_currency char(3) not null
original_amount numeric(18,6) not null
workspace_currency char(3) not null
normalized_amount numeric(18,6) not null
normalization_rate numeric(18,8) nullable
normalization_rate_source text nullable
payer_member_id uuid fk -> workspace_members.id nullable
classification_type classification_type not null
category text nullable
event_date date not null
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, event_date desc)`
- `(source_type, source_id)`

### `manual_entry_overrides`

```text
id uuid pk
manual_entry_id uuid fk -> manual_entries.id not null
override_type manual_entry_override_type not null
old_value_json jsonb nullable
new_value_json jsonb not null
changed_at timestamptz not null
```

## Shared settlement

### `shared_expense_splits`

```text
id uuid pk
expense_event_id uuid fk -> expense_events.id not null
split_mode split_mode not null
split_definition_json jsonb not null
settlement_status settlement_status not null
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(expense_event_id)`

Note:

- `split_definition_json` stores the participating members and their ratios or fixed amounts

## Investments

### `investment_accounts`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
owner_member_id uuid fk -> workspace_members.id nullable
display_name text not null
import_source_id uuid fk -> import_sources.id nullable
account_currency char(3) nullable
created_at timestamptz not null
updated_at timestamptz not null
```

### `investment_activities`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
investment_account_id uuid fk -> investment_accounts.id not null
import_id uuid fk -> imports.id not null
activity_date date not null
asset_symbol text nullable
asset_name text not null
activity_type investment_activity_type not null
quantity numeric(18,8) nullable
unit_price numeric(18,8) nullable
total_amount numeric(18,6) nullable
currency char(3) nullable
normalized_amount numeric(18,6) nullable
created_at timestamptz not null
updated_at timestamptz not null
```

### `holding_snapshots`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
investment_account_id uuid fk -> investment_accounts.id not null
snapshot_date date not null
asset_name text not null
asset_symbol text nullable
asset_type asset_type not null
quantity numeric(18,8) nullable
market_value numeric(18,6) not null
market_value_currency char(3) not null
normalized_market_value numeric(18,6) not null
cost_basis numeric(18,6) nullable
gain_loss numeric(18,6) nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(workspace_id, snapshot_date desc)`

## Currency tables

### `exchange_rate_monthly`

```text
id uuid pk
base_currency char(3) not null
quote_currency char(3) not null
year_month date not null
average_rate numeric(18,8) not null
source_name text not null
fetched_at timestamptz not null
```

Constraint:

- unique `(base_currency, quote_currency, year_month, source_name)`

Note:

- `year_month` should be normalized to the first day of the month

## Reporting

### `period_summaries`

```text
id uuid pk
workspace_id uuid fk -> workspaces.id not null
period_type period_type not null
period_start date not null
period_end date not null
summary_type text not null
generated_at timestamptz not null
summary_json jsonb not null
```

Indexes:

- `(workspace_id, period_type, period_start, period_end, summary_type)`

Recommended `summary_type` values:

- `cash`
- `adjusted`

## Jobs

### `jobs`

Minimal DB-backed worker queue.

```text
id uuid pk
job_type text not null
job_payload jsonb not null
status text not null
attempt_count integer not null default 0
available_at timestamptz not null
started_at timestamptz nullable
finished_at timestamptz nullable
last_error text nullable
created_at timestamptz not null
updated_at timestamptz not null
```

Indexes:

- `(status, available_at)`

## Recommended derived queries

The app should compute these from source records and cached summaries:

- average monthly household expense for current year
- average monthly savings for trailing 12 months
- yearly spend by category
- yearly income by member
- shared-expense balance by member pair
- FX-normalized spending trends
- investment allocation at latest snapshot

## MVP minimum table set

If we want to build the smallest useful first version, these are the must-have tables:

- `users`
- `workspaces`
- `workspace_members`
- `import_sources`
- `import_templates`
- `imports`
- `import_rows`
- `financial_accounts`
- `transactions`
- `transaction_classifications`
- `classification_rules`
- `expense_events`
- `expense_allocations`
- `manual_recurring_expenses`
- `recurring_entry_versions`
- `manual_entries`
- `exchange_rate_monthly`
- `period_summaries`
- `jobs`

Shared settlement and investments can be added after that without changing the overall model.

# Finance App Implementation Plan

## Goal

Turn the product and architecture decisions into a practical build order for the first working version.

This document answers:

- what we build first
- how to organize the codebase
- which screens and APIs are needed for MVP
- what can wait until later

## Progress snapshot

Completed in code:

- Next.js scaffold and static app routes
- Drizzle schema and first baseline migration
- non-interactive ESLint setup
- seeded dev workspace bootstrap with default base currency resolution
- bank import preview for Max and Cal variants
- persisted bank imports with:
  - local file retention
  - import history API
  - staged raw rows
  - normalized transactions
  - checksum-based duplicate protection
- transactions page on persisted data
- review queue and classification workflow with:
  - bulk classification
  - merchant rule creation
  - rule application during future imports
- recurring entry CRUD with future-dated versions
- recurring-generated manual entries
- one-time manual expense and income entry CRUD inline on `/expenses`
- `expense_events` and `expense_allocations` materialized from reportable sources
- multi-period reporting built from:
  - classified imported transactions
  - recurring-generated entries
  - existing `manual_entries` inputs when present
- dashboard cards backed by real reporting data
- year-to-date summaries
- rolling 12-month summaries
- payment-date and adjusted-period reporting modes
- transaction allocation editing from the review flow with:
  - equal-split coverage ranges
  - manual per-month splits
- allocation editing inline on `/expenses` for:
  - imported transactions
  - one-time manual entries
- shared settlements v1 with:
  - pairwise shared expense selection from classified expense events
  - equal, percentage, and fixed split rules
  - open, settled, and ignored tracking states
  - running open balance summary
- workspace settings polish with:
  - safe base-currency editing before financial data exists
  - owner/member role management
  - member deactivation guardrails
  - settlement-readiness guidance in `/settings`

Next up:

- investment import sidecar
- broader one-time manual shared-entry and settlement coverage
- auth planning and provider selection once early deployment direction is clearer

## Recommended repo structure

```text
finApp/
  docs/
  examples/
  src/
    app/
      (marketing)/
      (auth)/
      dashboard/
      imports/
      reports/
      settings/
    components/
      ui/
      dashboard/
      imports/
      reports/
    features/
      auth/
      workspaces/
      imports/
      expenses/
      reporting/
      recurring/
      currency/
      shared-settlements/
      investments/
    db/
      schema/
      migrations/
      client.ts
    lib/
      dates/
      currency/
      csv/
      excel/
      validation/
    jobs/
      workers/
      handlers/
    types/
  scripts/
  package.json
  tsconfig.json
```

## Module ownership

### `features/auth`

Owns:

- sign-in and session checks
- user identity
- invite or onboarding flow

### `features/workspaces`

Owns:

- household workspace creation
- member management
- workspace settings
- base currency setting

### `features/imports`

Owns:

- upload flow
- template detection
- file parsing
- staging rows
- import history

### `features/expenses`

Owns:

- transactions
- classification
- expense events
- expense allocations
- review queue

### `features/recurring`

Owns:

- recurring expense rules
- recurring income rules
- generated manual entries
- rule version history

### `features/currency`

Owns:

- historical monthly exchange-rate fetching
- conversion helpers
- transparency around normalized amounts

### `features/reporting`

Owns:

- monthly reports
- yearly and trailing averages
- category breakdowns
- saved summary caches

### `features/shared-settlements`

Owns:

- shared expense selection
- split rules
- balances

This should exist as a module boundary now, but can be implemented later.

### `features/investments`

Owns:

- investment imports
- account aggregation
- holdings and activity views

## MVP scope to actually build first

The first build should not try to ship the full vision.

Build this first:

1. workspace setup
2. expense/bank import
3. review and classification
4. recurring manual entries
5. period reporting
6. yearly average dashboard

Do not build first:

- shared settlement balances
- advanced investment analytics
- retirement projections
- complex automation

## MVP screens

## 1. Workspace setup

Path ideas:

- `/`
- `/onboarding`
- `/settings/workspace`

Needs:

- create workspace
- add members
- choose base currency

## 2. Imports list

Path:

- `/imports`

Needs:

- uploaded files list
- import status
- processing errors
- re-run action

## 3. Import wizard

Path:

- `/imports/new`

Needs:

- upload CSV or Excel file
- detect provider/template
- preview rows
- confirm column mapping if needed
- confirm account owner and account label

## 4. Review queue

Path:

- `/imports/review`

Needs:

- transactions needing manual review
- bulk classify actions
- save merchant rule
- assign member ownership
- mark as shared or household

## 5. Transactions page

Path:

- `/expenses`

Needs:

- all normalized transactions
- filters by month, member, account, category
- view original currency and normalized amount
- edit classification

## 6. Recurring entries page

Path:

- `/recurring`

Needs:

- create recurring income
- create recurring expense
- define effective month
- edit amount from a future month only
- view rule history

## 7. Reports page

Path:

- `/reports`

Needs:

- monthly summary
- yearly summary
- trailing 12-month averages
- income/spend/savings cards
- category breakdown

## Core APIs or server actions

## Workspace

- `createWorkspace`
- `addWorkspaceMember`
- `updateWorkspaceBaseCurrency`

## Imports

- `createImport`
- `detectImportTemplate`
- `confirmImportMapping`
- `processImport`
- `reprocessImport`

## Expenses

- `listTransactions`
- `classifyTransaction`
- `bulkClassifyTransactions`
- `createClassificationRule`
- `allocateExpenseAcrossMonths`

## Recurring

- `createRecurringEntry`
- `createRecurringEntryVersion`
- `generateRecurringEntriesForPeriod`
- `overrideGeneratedEntry`

## Reporting

- `getPeriodSummary`
- `regeneratePeriodSummary`
- `getYearlyAverages`
- `getCategoryTrend`

## Currency

- `syncMonthlyExchangeRates`
- `convertAmountToWorkspaceCurrency`

## Suggested first milestones

## Milestone 1: App foundation

Status:

- completed with seeded dev bootstrap instead of real auth

Deliverables:

- Next.js app bootstrapped
- auth working
- workspace creation working
- PostgreSQL connected
- migrations setup ready

Success criteria:

- user can sign in
- user can create a household workspace
- base currency can be set

Notes:

- real auth is intentionally deferred
- the current app uses a seeded dev user/workspace/member contract

## Milestone 2: Import foundation

Status:

- completed for supported bank imports

Deliverables:

- file upload
- import sources/templates tables
- CSV and Excel parsing
- raw import row storage
- import history page

Success criteria:

- user can upload an example file from `examples/`
- file is parsed into staging rows
- parse errors are visible
- confirmed imports are saved into `imports`, `import_rows`, and `transactions`

## Milestone 3: Expense normalization

Status:

- completed for imported transaction persistence and first transaction views

Deliverables:

- normalized transactions
- financial account linking
- transaction dedupe
- classification records

Success criteria:

- user can see parsed transactions
- duplicate imports do not create duplicate transactions
- imported rows have normalized currency amounts

Remaining:

- richer transaction filtering and allocation-aware editing in `/expenses` are still future work

## Milestone 4: Review workflow

Status:

- completed for first-pass manual review and rule reuse

Deliverables:

- uncertain-items queue
- bulk classification tools
- merchant rule creation

Success criteria:

- user can review only uncertain transactions
- future imports reuse saved rules

## Milestone 5: Recurring and manual entries

Status:

- completed for recurring CRUD, version history, recurring-generated manual entries, and one-time manual entry CRUD

Deliverables:

- recurring entries with versions
- generated manual entries
- one-time manual income and expense entries
- future-dated recurring changes that do not rewrite past periods

Success criteria:

- user can create rent as recurring expense
- user can create salary as recurring income
- amount change from future month does not alter past periods

## Milestone 6: Reporting

Status:

- completed for payment-date and broader adjusted-period reporting plus dashboard views

Deliverables:

- payment-date monthly summaries
- adjusted-period summaries backed by `expense_events` and `expense_allocations`
- reports UI
- yearly and trailing-period summaries
- dashboard cards backed by real data
- review-driven transaction allocation editing
- manual split month allocations for imported transactions
- inline allocation editing from `/expenses` for imported and one-time manual rows

Success criteria:

- user can view monthly summary
- user can inspect category and member breakdowns
- user can view yearly summary
- user can view trailing average savings
- user can switch between payment-date and adjusted-period reporting
- user can split a classified transaction across multiple reporting months without mutating the original transaction date

## Milestone 7: Shared settlements

Status:

- completed for pairwise v1 shared split tracking and balance summaries

Deliverables:

- mark shared expenses
- split rules
- balance calculation

Success criteria:

- user can select shared expense events for settlement tracking
- user can define equal, percentage, or fixed two-member split rules
- user can mark tracked items as open, settled, or ignored
- user can see a running open balance between the 2 active workspace members

Remaining:

- shared settlement is intentionally pairwise only in v1
- one-time manual shared entries and reimbursement-ledger history are still future work

## MVP acceptance checklist

The MVP is useful if a household can:

- create a workspace
- upload bank files in CSV or Excel
- review and classify imported data
- add recurring rent and salary manually
- view monthly reporting from classified imports plus manual entries

Still needed for the fuller vision:

- handle foreign-currency expenses in reporting beyond placeholder rates
- settle shared expenses on top of classified data
- support one-time manual shared entries and settlement coverage

## Recommended implementation sequence inside the codebase

Build in this exact order if possible:

1. DB schema and migrations
2. auth and workspace setup
3. import staging flow
4. normalized transactions
5. classification and review queue
6. recurring entries and versioning
7. expense events and allocations
8. period summaries and reports

This order minimizes rework.

What actually happened in code so far:

1. DB schema and migrations
2. seeded workspace setup
3. import staging and persistence
4. normalized transactions plus review/classification
5. recurring entries and generated manual rows
6. multi-period payment-date reporting and dashboard cards
7. `expense_events` and `expense_allocations` for adjusted-period reporting
8. review-driven transaction allocation editing with equal and manual splits
9. pairwise shared settlements v1 plus initial member-management settings
10. DB-backed validation checkpoint completed against local PostgreSQL, including first-run bootstrap hardening and dynamic API freshness fixes
11. workspace settings polish with guarded base-currency editing, role management, and stronger member-state guardrails

The DB-backed validation checkpoint and settings polish slices are now completed, so the next architectural work can move back to shared-expense depth, investments, and later auth planning.

## Completed validation checkpoint

Completed against local Docker PostgreSQL with `.env.local` and `DATABASE_URL`.

Verified:

1. `npm run db:push` works against local PostgreSQL after loading Next-style env files
2. `npm run dev` boots cleanly against the live database
3. the seeded dev workspace bootstrap creates the default user/workspace/member automatically
4. concurrent first-load requests no longer race into duplicate seeded inserts
5. `/settings`, `/expenses`, `/recurring`, and `/reports` load against the live database
6. one-time manual entry CRUD and allocation editing from `/expenses` work end-to-end
7. mutable GET routes now return fresh database state after edits instead of stale cached responses
8. `npm run lint` and `npm run build` both pass after the DB-backed fixes

Still optional:

- smoke-test `/imports` with a real bank file when one is available

## Early deployment note

For local validation, prefer Dockerized PostgreSQL plus `DATABASE_URL`.

For a later Vercel deployment, the most natural PostgreSQL options are:

- Neon when we want the simplest serverless Postgres fit and tight Vercel integration
- Supabase when we want Postgres plus optional platform features such as auth, storage, or realtime

Current recommendation:

- validate locally with plain PostgreSQL first
- prefer Neon for the first Vercel deployment if the app only needs hosted Postgres
- consider Supabase only if we explicitly choose to adopt its broader platform features

Auth note:

- auth is still part of the planned product scope and is not being removed or deferred forever
- the early Neon recommendation is only about the hosted database choice for the first deployment
- we are not locking in an auth provider yet
- if we later choose Supabase, that can be because we intentionally want auth, storage, or realtime from the same platform

Important caveat:

- the current import flow writes uploaded files to local disk, so a production Vercel deployment should either avoid import-heavy usage initially or replace local file persistence with durable object storage first

With that checkpoint green and settings tightened, the next architectural step is broader manual/shared-expense coverage on top of the now-stable classified, allocated, settlement-aware, and settings-backed expense model.

## What to postpone on purpose

Postpone these until the expense core is stable:

- push notifications
- mobile app
- live bank syncing
- AI categorization
- multi-workspace enterprise logic
- advanced investment analytics
- shared-settlement automation

## Recommendation

If we continue from here, the best next engineering step is:

1. expand one-time manual shared-entry and settlement coverage
2. continue investment import foundation as an isolated sidecar
3. scope the later auth slice once early deployment direction and provider choices are clearer
4. replace local import-file persistence before any import-heavy Vercel deployment

That keeps the product moving from fuller non-imported input coverage into broader household finance completeness.

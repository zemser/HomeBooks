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
- recurring entry CRUD with future-dated versions, plus the simplified one-definition flow:
  - saving a recurring definition now auto-materializes the applicable report months
  - pausing a definition removes the current recurring rows from reports, while delete removes the definition entirely
  - future effective-month changes still preserve past prepared months
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
  - pairwise shared expense selection from classified expense events, including one-time manual shared expenses
  - equal, percentage, and fixed split rules
  - open, settled, and ignored tracking states
  - running open balance summary
  - fixed-split reset when a tracked shared manual expense amount changes
- workspace settings polish with:
  - safe base-currency editing before financial data exists
  - owner/member role management
  - member deactivation guardrails
  - settlement-readiness guidance in `/settings`
- shared workflow shell and home hub with:
  - DB-backed `/` home surface for setup, next actions, reporting teaser, and recent activity
  - persistent desktop sidebar plus compact mobile navigation
  - review-count badges and investments beta labeling in shared navigation
  - workflow cross-links between settings, imports, review, expenses, recurring, reports, settlements, and investments
  - `/dashboard` redirected into `/` so there is one clear product home
- expense-workflow dogfooding pass with real `examples/` imports through `/`, plus the first high-value usability fixes:
  - clearer saved-import history with reviewed vs pending counts and stronger next actions after save
  - stronger review-queue progress cues, including reviewed totals, remaining totals, and per-import “what is left” breakdowns
  - ledger filtering and search on `/expenses`, plus smoother deep links from review into ledger and month-specific reports
  - easier reopening of saved one-time manual entries from the expenses surface
  - explicit FX transparency across imports, review, ledger, reports, and home follow-up cues so placeholder-normalized foreign rows are visibly labeled instead of silently blended into the workspace currency
  - clearer queue-cleared handoff into month-aware reports from review, ledger, and `/`
- investment snapshot persistence sidecar with:
  - dedicated `/investments` upload, preview, and save flow
  - Excellence workbook detection by holdings header
  - holdings snapshot parsing from current sample files
  - confirmed owner/account save contract
  - persisted `investment` imports with local file retention
  - canonicalized `investment_accounts` resolution
  - `holding_snapshots` persistence linked back to `imports`
  - duplicate checksum protection plus same-account/same-date replacement
  - investment-only import history shown inside `/investments`
  - latest active holdings view on `/investments`, grouped by investment account and hydrated server-side
  - manual account-label guidance when a workbook does not expose that metadata
  - portfolio summary strip on top of saved holdings
  - account overview cards with portfolio share, top holding, concentration hints, and cost-basis coverage
  - lightweight portfolio composition on top of saved holdings, including:
    - estimated asset-type mix when the workbook only exposes holding names
    - household owner split across saved investment accounts
    - top positions combined across the latest active account snapshots
    - name-based asset-type fallback for older saved snapshots that predate the inference pass
    - symbol-first portfolio rollups so small provider naming differences do not split one holding into multiple top positions
    - upload/preview cleanup so the save flow resets cleanly and sits below the saved investment data instead of competing with it at the top of the page
  - first-pass investment activity import on `/investments`, including:
    - checked-in Excellence activity workbook support
    - workbook detection for holdings or activity exports
    - persisted `investment_activities` rows beside holdings snapshots
    - saved activity history on `/investments`
    - preview/save copy that adapts to activity imports versus holdings snapshots
  - hosted Supabase auth foundation with:
    - Supabase SSR/server/browser helpers
    - hosted-mode sign-in and first-user sign-up pages
    - hosted onboarding that creates the app user, workspace, and owner member from the Supabase identity
    - hosted-mode current-context resolution using Supabase `auth.users.id`
    - required TOTP MFA route at `/mfa`
    - middleware that requires Supabase `aal2` for app pages and API routes in hosted mode
    - dev mode still using the seeded local workspace bootstrap
  - hosted RLS foundation with:
    - request-scoped Supabase user id propagation into Postgres via `app.current_user_id`
    - pooled database connections that set or clear the app user id before each query
    - hosted-mode guard against using obvious bypass/admin DB roles for normal app traffic
    - RLS helper functions for workspace membership, ownership, and child-record access
    - RLS policies for workspace-owned app tables, catalog reads, onboarding inserts, and owner-managed member/workspace updates
    - repeatable `npm run smoke:rls` cross-workspace isolation smoke test for a migrated hosted database
  - temporary hosted import storage with:
    - Supabase Storage mode for bank and investment save flows
    - hosted import source paths under `tmp/workspaces/...`
    - delete-after-success cleanup after persistence
    - private bucket setup script
    - failed-import TTL cleanup script

Next up:

- hosted verification of Supabase Auth, onboarding, required TOTP MFA, and RLS with real project credentials
- configure normal hosted app traffic with a non-bypass Supabase Postgres role
- run the cross-workspace isolation smoke test against the hosted non-bypass role and document any missing grants
- run hosted import storage setup and failed-import cleanup against the real Supabase project
- run one local restore drill from the manual encrypted `pg_dump` backup and restore runbook

## Hosted two-user v1 implementation plan

This is the active cross-cutting implementation slice. It turns the local-first app into a private hosted app for two users without opening the door to broader SaaS complexity yet.

### Current hosted foundation status

Completed in code:

1. Supabase Auth identity and onboarding
   - Supabase SSR/server/browser helpers
   - hosted sign-in and first-user workspace onboarding
   - Supabase `auth.users.id` stored as app `users.id`
   - hosted current-context resolution from the Supabase identity
   - required TOTP MFA gate before onboarding, app pages, or API routes

2. RLS and non-bypass database foundation
   - `app.current_user_id` Postgres request setting is populated from the authenticated Supabase user
   - pooled DB sessions set or clear that user id before each query to avoid stale session context
   - hosted mode fails fast for obvious bypass/admin database usernames unless explicitly allowed for maintenance
   - migration `0004_hosted_rls_foundation.sql` enables RLS and adds helper functions/policies for app tables

Still required:

1. Supabase project smoke test
   - create/use the hosted project and apply migrations
   - confirm sign-in, onboarding, MFA enrollment/challenge, and app access
   - verify the app uses a non-bypass DB role for normal traffic

2. RLS verification
   - create two workspace scenarios with separate hosted users
   - prove cross-workspace reads and writes fail
   - document any role grants needed for the non-bypass DB user
   - use `npm run smoke:rls` as the repeatable baseline once hosted credentials are configured

3. Hosted import processing
   - use Supabase Storage as temporary import-processing storage
   - delete source files after successful parse and persistence
   - document failed-import TTL cleanup
   - run `npm run imports:setup-storage` before hosted import testing
   - run `npm run imports:cleanup-failed` as the scheduled failed-file cleanup path

4. Backup and deployment readiness
   - run one encrypted backup and restore test against a local database
   - configure Vercel only once auth/RLS/storage can be exercised end to end

## Recommended repo structure

```text
finApp/
  docs/
  examples/
  src/
    app/
      (auth)/
      imports/
      reports/
      settings/
      expenses/
      recurring/
      settlements/
      investments/
    components/
      app-shell/
      imports/
      reports/
    features/
      auth/
      home/
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
6. guided home shell and workflow navigation

Do not build first:

- shared settlement balances
- advanced investment analytics
- retirement projections
- complex automation

## MVP screens

## 1. Home hub

Path:

- `/`

Needs:

- setup status
- next recommended action
- review queue attention state
- reporting teaser
- recent imports and notable system state

## 2. Workspace setup

Path ideas:

- `/settings`

Needs:

- create workspace
- add members
- choose base currency

## 3. Imports list

Path:

- `/imports`

Needs:

- uploaded files list
- import status
- processing errors
- re-run action

## 4. Import wizard

Path:

- `/imports/new`

Needs:

- upload CSV or Excel file
- detect provider/template
- preview rows
- confirm column mapping if needed
- confirm account owner and account label

## 5. Review queue

Path:

- `/imports/review`

Needs:

- transactions needing manual review
- bulk classify actions
- save merchant rule
- assign member ownership
- mark as shared or household

## 6. Transactions page

Path:

- `/expenses`

Needs:

- all normalized transactions
- filters by month, member, account, category
- view original currency and normalized amount
- edit classification

## 7. Recurring entries page

Path:

- `/recurring`

Needs:

- create recurring income
- create recurring expense
- define effective month
- edit amount from a future month only
- view rule history

## 8. Reports page

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

- completed for payment-date and broader adjusted-period reporting, with reporting data now teased from the shared home surface

Deliverables:

- payment-date monthly summaries
- adjusted-period summaries backed by `expense_events` and `expense_allocations`
- reports UI
- yearly and trailing-period summaries
- reporting cards backed by real data
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
- reimbursement-ledger history is still future work

## Milestone 8: Workflow shell and home UX

Status:

- completed for the first connected app-shell pass

Deliverables:

- shared app shell with desktop and mobile navigation
- DB-backed home hub on `/`
- review and settings attention states in navigation
- page-level cross-links that make the expense workflow read as one connected journey
- `/dashboard` redirected into `/`

Success criteria:

- user can land on `/` and understand what to do next
- user can reach the main workflow routes without guessing URLs
- review attention is visible from both home and shared navigation
- investments remain accessible without interrupting the expense-first story

Immediate handoff target:

- settlement coverage for one-time manual shared expenses is now completed
- investment preview, holdings persistence, saved holdings views, composition views, and first-pass activity imports for Excellence are now completed as an isolated sidecar
- hosted two-user v1 hardening is the main cross-cutting follow-up: Supabase Auth, RLS, temporary hosted import processing, and manual backup/restore

## MVP acceptance checklist

The MVP is useful if a household can:

- create a workspace
- upload bank files in CSV or Excel
- review and classify imported data
- add recurring rent and salary manually
- view monthly reporting from classified imports plus manual entries

Still needed for the fuller vision:

- handle foreign-currency expenses in reporting beyond placeholder rates
- expand shared settlements beyond pairwise v1 and add reimbursement-ledger history
- dogfood more real investment export files and tighten provider-specific mapping where real files expose gaps

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
12. one-time manual shared-expense settlement coverage inside the existing pairwise flow
13. Excellence investment preview sidecar with dedicated API and `/investments` UI
14. Excellence investment persistence with confirmed owner/account resolution, import history, and `holding_snapshots` writes
15. investment portfolio summaries and account overview reporting on top of the latest active holdings snapshots
16. shared app shell and hybrid home hub on `/`, including workflow navigation and route reframing across the existing expense product surfaces
17. explicit FX transparency and month-aware report handoffs across imports, review, ledger, reports, and `/`, including queue-cleared home cues and report drill-ins
18. recurring definitions simplified into one saved flow, with automatic report materialization plus pause/delete behavior that updates the current report month
19. lightweight investment composition views on top of saved holdings, including heuristic asset typing, owner split, top positions, fallback classification for older snapshots, symbol-based aggregation, and a cleaner preview/save flow
20. first-pass Excellence investment activity import support from a real checked-in workbook sample, with activity persistence and saved activity visibility on `/investments`
21. hosted Supabase auth foundation with sign-in, first-user onboarding, hosted current-context resolution, and required TOTP MFA
22. hosted RLS foundation with request-scoped `app.current_user_id`, non-bypass DB role guardrails, and workspace/member policies

The DB-backed validation checkpoint, settings polish, manual shared-settlement coverage, Excellence investment persistence, shared workflow shell, FX/report-handoff usability pass, the recurring-flow simplification, the saved-holdings composition pass, the first activity-import pass, hosted Auth/MFA, and the hosted RLS foundation are now completed in code. The next work should validate those hosted foundations against a real Supabase project before import-heavy hosted usage.

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
9. `/` now renders a DB-backed home hub and the shared shell routes users through the main product surfaces

Still optional:

- smoke-test the full workflow from `/` through imports, review, expenses, recurring, and reports with a real bank file

## Early deployment note

For local validation, Dockerized PostgreSQL plus `DATABASE_URL` still works.

For the first hosted two-user version, the platform direction is now:

- Vercel for the Next.js app
- Supabase Auth for sign-in and TOTP MFA
- Supabase Postgres for hosted data
- Supabase Storage only as temporary import-processing storage
- custom SMTP before external auth email is relied on

Important caveats:

- Vercel Hobby and Supabase Free are validation tiers, not a durable production promise
- normal user traffic must not use a service-role/admin database path that bypasses RLS
- uploaded source files should be deleted after successful parse and persistence
- manual encrypted backups are preferred over automated third-party `pg_dump` jobs for the two-user v1

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

1. apply and smoke-test the hosted Supabase Auth, MFA, and RLS foundations against real project credentials
2. configure normal hosted app traffic with a non-bypass Supabase Postgres role
3. run the cross-workspace isolation smoke test against the hosted non-bypass role and document any missing grants
4. replace local import-file persistence with temporary Supabase Storage processing and delete-after-success behavior
5. write and test the manual encrypted backup/restore runbook

That turns the current product into a private hosted two-user app while keeping account setup just ahead of the code that needs each platform.

## Next handoff slice

Goal:

- verify and harden the hosted two-user foundation without disturbing the existing expense and investment workflows

Recommended scope:

1. apply migrations to a hosted Supabase project
2. confirm sign-in, onboarding, and TOTP MFA with real credentials
3. verify the runtime database role does not bypass RLS
4. create two workspace scenarios and prove cross-workspace reads/writes fail
5. add temporary Supabase Storage processing for imports, including delete-after-success and failed-import TTL cleanup
6. avoid broad investment or reporting feature expansion unless a regression blocks hosted validation

Definition of done:

- two hosted users can sign in, complete MFA, and reach the intended household workspace
- seeded dev bootstrap is not used in hosted mode
- normal app requests do not use a service-role/admin path that bypasses RLS
- cross-workspace isolation tests prove users cannot read or mutate another workspace's records
- bank and investment import flows work through temporary hosted storage
- uploaded source files are deleted after successful persistence
- failed-import files expire through a documented TTL path
- manual encrypted backup and local restore are documented and tested once
- existing expense, recurring, reports, settlements, and investments flows do not regress

## Proposed next slices

Near-term order:

1. Hosted auth and RLS verification
   - Supabase project setup
   - Supabase Auth, onboarding, required TOTP MFA hosted smoke test
   - RLS policies and non-bypass user request path validation
2. Hosted import processing
   - Supabase Storage private bucket setup
   - local and hosted storage adapters
   - delete-after-success and failed-import TTL cleanup
3. Backup and first hosted deploy
   - manual encrypted `pg_dump` runbook and restore test
   - Vercel project setup
   - hosted smoke test for auth, MFA, RLS, imports, and existing product workflows
4. Product dogfooding after hosted baseline
   - run more real investment activity exports through `/investments`
   - tighten provider action labels, notes, and edge-case handling only where real files show confusion

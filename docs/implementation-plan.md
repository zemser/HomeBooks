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

Next up:

- keep the expense workflow as the top priority with one more narrow polish pass for:
  - any remaining manual-entry, ledger, or home/report affordance issues found during another real-file pass
  - small workflow-copy or CTA refinements only if dogfooding still exposes confusion
- keep investment composition follow-ups secondary until the expense workflow feels stable
- activity import support once we have a real activity export sample
- durable upload storage for a cleaner hosted deployment path once hosted deployment becomes a priority
- auth planning and provider selection once early deployment direction is clearer

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
- investment preview and persistence for Excellence are now completed as an isolated sidecar
- the next investment product slice is reading saved holdings back into `/investments`
- durable upload storage is the main deployment-hardening follow-up before import-heavy hosted usage

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
- persist investment imports into holdings/activity tables and build holdings/activity views

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

The DB-backed validation checkpoint, settings polish, manual shared-settlement coverage, Excellence investment persistence, and the first connected workflow shell are now completed, so the next product work should focus on real dogfooding and usability follow-ups across imports, review, expenses, and reports before expanding farther into sidecar domains.

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

With that checkpoint green and the home shell now connecting the product surfaces into one flow, the next local-first product expansion should be a real dogfooding pass across the expense workflow, while durable upload storage remains the main hosted-deployment hardening follow-up for later.

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

1. run another real-file dogfooding pass now that FX transparency and queue-cleared report handoffs are in place
2. fix only the remaining highest-signal expense workflow friction that still shows up there
3. move to lightweight investment composition follow-ups once the expense path feels steady
4. defer durable upload storage until hosted deployment becomes a near-term priority
5. scope the later auth slice once early deployment direction and provider choices are clearer

That keeps the product moving on the main household workflow first while still preserving a clear hosted-deployment hardening path for later.

## Next handoff slice

The FX transparency pass and the queue-cleared report handoff are now completed, so the next implementation slice should stay expense-first and use another real-file pass to confirm whether any manual-entry, ledger, or home/report follow-up polish is still needed before shifting attention to investment composition.

Goal:

- make the connected workflow feel genuinely usable with real household data, not only navigable in theory

Recommended scope:

1. run the workflow from `/` through imports, review, expenses, recurring, and reports using real files from `examples/`
2. confirm that FX labels, queue-cleared guidance, and report drill-ins are obvious with real imported data
3. add only the remaining practical expense UX improvements that still show up after that pass
4. preserve checksum behavior, duplicate handling, and current reporting/settlement contracts
5. keep investment activity persistence and broader investment analytics out of scope
6. leave durable storage, hosted DB decisions, and auth out of scope for this slice

Definition of done:

- the workflow can be exercised end-to-end from `/` without guessing where to go next
- FX transparency and queue-cleared report handoffs remain obvious during real-file use
- at least one more real-file dogfooding pass confirms or narrows the next remaining expense-path fixes
- current import preview, save, duplicate-detection, and history flows keep working
- existing expense import, reporting, and settlement behavior does not regress

# Finance App Implementation Plan

## Goal

Turn the product and architecture decisions into a practical build order for the first working version.

This document answers:

- what we build first
- how to organize the codebase
- which screens and APIs are needed for MVP
- what can wait until later

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

## Milestone 2: Import foundation

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

## Milestone 3: Expense normalization

Deliverables:

- normalized transactions
- financial account linking
- transaction dedupe
- classification records

Success criteria:

- user can see parsed transactions
- duplicate imports do not create duplicate transactions
- imported rows have normalized currency amounts

## Milestone 4: Review workflow

Deliverables:

- uncertain-items queue
- bulk classification tools
- merchant rule creation

Success criteria:

- user can review only uncertain transactions
- future imports reuse saved rules

## Milestone 5: Recurring and manual entries

Deliverables:

- recurring entries with versions
- generated manual entries
- one-off manual income and expense entries

Success criteria:

- user can create rent as recurring expense
- user can create salary as recurring income
- amount change from future month does not alter past periods

## Milestone 6: Reporting

Deliverables:

- expense events
- allocations
- period summaries
- reports UI

Success criteria:

- user can view monthly summary
- user can view yearly summary
- user can view trailing average savings

## Milestone 7: Shared settlements

Deliverables:

- mark shared expenses
- split rules
- balance calculation

This is a later milestone.

## MVP acceptance checklist

The MVP is useful if a household can:

- create a workspace
- upload bank files in CSV or Excel
- review and classify imported data
- add recurring rent and salary manually
- handle foreign-currency expenses in reporting
- allocate late-paid bills to the months they belong to
- view monthly and yearly summaries
- see average savings over time

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

1. create the actual Next.js project skeleton
2. define the Drizzle schema from `docs/database-schema.md`
3. implement the import pipeline for one real example bank file
4. build the review queue and summary page around that first source

That will give us a usable vertical slice quickly instead of building abstractions with no real imported data flowing through them.

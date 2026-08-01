# Transaction Review Workspace Rebuild

## Status

- Overall: `in progress — core workflow and stable category IDs implemented`
- Priority: `P0 product workflow`
- Primary route: `/imports/review`
- Supporting route: `/expenses`
- Last updated: 2026-08-01
- Design authority: this document supersedes the transaction-review recommendations in `UX_REVIEW.md`

## Goal

Rebuild transaction review as a fast, understandable, accessible, task-first workspace. The implementation may replace the current page structure, components, client state, APIs, category model, and interaction patterns. Existing code is not the design baseline.

The refactor must preserve financial correctness and user data, but it does not need to preserve the current UI or its internal architecture.

The target experience should let a user:

1. narrow the review queue to the transactions they want to handle
2. recognize the current transaction quickly
3. accept or change a classification with minimal interaction
4. save and advance without returning to the mouse
5. safely apply the same decision to similar transactions
6. understand when and why a reusable merchant rule will be created

## Product principles

- Keep human confirmation as the default for uncertain financial decisions.
- Optimize the common single-transaction path before adding advanced automation.
- Show choices directly when the option set is small and stable.
- Use search for large or growing option sets.
- Reveal only the fields that apply to the selected classification type.
- Suggestions must be explainable, reversible, and visually distinct from saved decisions.
- Do not silently change historical classifications.
- Preserve current reporting, allocation, settlement, and merchant-rule semantics.

## Design authority and benchmarks

Use current industry patterns as the design authority:

- WAI-ARIA Authoring Practices for keyboard behavior, focus management, comboboxes, grids, radio groups, dialogs, and live announcements
- Carbon Design System data-table and filtering patterns for toolbar placement, sorting, visible filter state, selection, and batch actions
- modern finance review patterns such as suggestion confidence, recognized-rule evidence, explicit confirmation, and reversible automation
- platform-native keyboard conventions and native HTML semantics whenever they provide the required behavior

Reference material:

- https://www.w3.org/WAI/ARIA/apg/patterns/combobox/
- https://www.w3.org/WAI/ARIA/apg/patterns/grid/
- https://www.w3.org/WAI/ARIA/apg/patterns/table/
- https://www.w3.org/WAI/ARIA/apg/practices/keyboard-interface/
- https://carbondesignsystem.com/components/data-table/usage/
- https://carbondesignsystem.com/patterns/filtering/
- https://plaid.com/docs/transactions/pfc-migration/
- https://quickbooks.intuit.com/learn-support/en-us/help-article/banking/set-bank-rules-categorize-online-banking-online/L0mjJl0nD_US_en_US

If an existing component or recommendation conflicts with these principles or with usability testing, replace it.

## Legacy constraints and domain invariants

`UX_REVIEW.md` is historical input, not a constraint or acceptance baseline for this project. Its proposed layouts, priorities, and incremental fixes may be discarded.

The current review screen may be replaced wholesale. Preserve only the following user and domain outcomes:

- strict queue membership for transactions without a saved classification
- users can select, classify, skip, and correct transactions
- users can classify one or many transactions
- Personal and Shared decisions retain the member/payer data required by reporting and settlement logic
- users can deliberately create or update exact merchant rules
- deep links from the ledger to a focused transaction
- report allocation editing after a reportable classification exists
- review progress and per-import remaining counts

Database schemas, endpoints, query shapes, and component boundaries may change when necessary. All migrations must preserve existing classifications, rules, categories, allocations, and derived report data.

## Target interaction model

### Review workspace

Use a responsive master-detail review workspace:

1. A sticky review toolbar for finding and ordering transactions.
2. A compact queue optimized for merchant, date, amount, and suggestion recognition.
3. A sticky decision panel for classification, category, rule preview, and save actions.

On smaller screens, use a focused full-width transaction stepper or sheet instead of squeezing the desktop table and panel together. Mobile users must receive the same capabilities without horizontal table dependence.

### Classification type

Replace the single-review type dropdown with a visible radio-style choice group.

Recommended presentation:

```text
How should this transaction be treated?

[ Personal ] [ Shared ] [ Household ]
[ Income   ] [ Transfer ] [ Ignore    ]
```

Show all six choices in an adaptive grid. Do not hide valid types behind `More` merely to preserve the current layout. The control must implement semantic radio-group behavior, roving focus, Arrow-key navigation, and visible selected/focus states.

Conditional fields:

- Personal: show `Whose personal expense?`; member is required.
- Shared: show `Paid by`; preserve existing settlement meaning.
- Household: hide member selection.
- Income: hide member selection unless a separate documented income-owner requirement is introduced.
- Transfer: hide category and member selection by default.
- Ignore: hide category and member selection by default.

Changing type must not save automatically.

### Category selection

Replace native category dropdowns in both single and bulk review with a reusable searchable combobox.

The category picker should present sections in this order:

1. Suggested category, when available
2. Recent categories used by the current workspace
3. All workspace categories

Required behavior:

- type-to-search using case-insensitive matching
- Arrow Up/Down changes the highlighted option
- Enter selects the highlighted option
- Escape closes the list without changing the saved classification
- Tab follows normal focus order
- a visible clear action returns to Uncategorized
- the currently selected value remains valid if it is not in the latest category catalog
- empty state offers an explicit Create category action without losing review context
- selected value and highlighted value are visually distinct
- accessible label, `combobox`, `listbox`, option state, and active-descendant semantics

### Category catalog

Replace free-text classification categories with a workspace-owned category catalog using stable IDs.

Required model capabilities:

- stable category ID
- workspace ownership
- display name
- optional parent category ID for a two-level hierarchy
- expense, income, or both applicability
- active/archived state
- deterministic sort order
- optional icon/color metadata that never carries meaning without a text label

Migration requirements:

- create catalog records for every distinct existing workspace category string
- link existing classifications, rules, recurring entries, and manual entries without losing their display value
- preserve archived or unmatched historical values
- seed a practical starter taxonomy for workspaces without useful categories
- keep the migration reversible until data verification completes

Starter taxonomy should cover common household finance needs without excessive granularity, including housing, groceries, dining, transportation, utilities, health, insurance, shopping, entertainment, travel, education, gifts, fees, income, and uncategorized.

### Keyboard workflow

Add page-level shortcuts for the review task:

| Shortcut | Action |
| --- | --- |
| Arrow Up | Move to previous visible transaction when focus is in the review grid |
| Arrow Down | Move to next visible transaction when focus is in the review grid |
| `1` | Choose Personal |
| `2` | Choose Shared |
| `3` | Choose Household |
| `4` | Choose Income |
| `5` | Choose Transfer |
| `6` | Choose Ignore |
| `C` | Focus/open category search |
| `R` | Toggle exact merchant-rule creation when available |
| `S` | Skip for now and select the next visible transaction |
| Cmd/Ctrl + Enter | Save and select the next visible transaction |
| Escape | Close the active picker, menu, modal, or shortcut help |
| `?` | Open keyboard-shortcut help |

Shortcut rules:

- Do not trigger page shortcuts while focus is in an input, textarea, select, editable element, dialog control, or open combobox.
- Cmd/Ctrl + Enter may save from inside the decision form.
- Prevent saving when the form is invalid and move focus to the first invalid field.
- Implement queue navigation as a WAI-ARIA-compliant interactive grid with roving focus, or document an accessibility review that justifies a simpler native-table pattern. Do not mix partial grid roles with native-table keyboard expectations.
- Arrow navigation must respect the filtered and sorted queue and must not steal caret or radio-group navigation.
- Skipping changes only the current selection; it does not create a classification row.
- Rename the visible `Next` action to `Skip for now` so pointer and keyboard behavior use the same language.
- Display shortcut hints on important actions without making them visually dominant.
- Announce selected position and successful saves through an `aria-live` region.

### Suggested classification

Implement an explainable historical suggestion service as part of this refactor.

Version 1 matching:

- define and test a canonical exact-merchant normalization contract; the existing `normalizeMerchantRuleValue` may be reused only if it satisfies that contract
- find previously reviewed transactions in the same workspace with the same normalized merchant
- exclude the current transaction
- ignore prior rows without a user-visible classification type
- build a candidate from classification type, category, and member owner
- never mutate prior transactions when producing a suggestion

Suggestion result shape:

```ts
type ClassificationSuggestion = {
  classificationType: ClassificationType;
  category: string | null;
  memberOwnerId: string | null;
  memberOwnerName: string | null;
  matchingTransactionCount: number;
  supportingTransactionCount: number;
  confidence: "strong" | "likely";
  source: "merchant_history";
};
```

Confidence rules:

- `strong`: at least 2 prior merchant matches and every match has the same type, category, and applicable member owner
- `likely`: at least 2 prior merchant matches and one complete decision represents at least 75% of matches
- no suggestion: fewer than 2 matches, no complete candidate, or the top candidate is below 75%

The API should return support counts so the UI can explain the suggestion. Do not store this computed suggestion or write it into `transaction_classifications.confidence` in version 1.

Presentation:

```text
Suggested from 4 previous transactions
Household · Groceries                         [Accept]
```

Accepting a suggestion only fills the form. The user must still save it. Provide a clear way to dismiss or edit the suggestion.

Keep the first production strategy deterministic. Design the service boundary so a future merchant-identity or model-based strategy can be added without changing the review UI contract.

### Merchant-rule preview

Keep exact merchant-rule creation optional, but replace the opaque checkbox copy with an explainable preview.

When enabled, show:

- the normalized merchant value that will be matched
- that the rule applies to future exact matches
- how many current unreviewed transactions have the same normalized merchant
- the classification, category, and member decision the rule will apply
- whether saving will create a new rule or update an existing exact rule

Suggested copy:

```text
Use this decision for future exact matches
Matches merchant: "AM:PM ארלוזרוב ר״ג"
Also matches 2 transactions currently waiting for review.
```

Creating a rule must not silently classify other existing queue rows in this refactor. Similar existing rows may be selected through the bulk suggestion flow described below.

### Similar-transaction acceleration

When the current queue contains other exact normalized-merchant matches, show a secondary action:

```text
3 more transactions from this merchant             [Select all 3]
```

Activating it should select those visible/matching rows and open the existing bulk-classification flow with the current form decision prefilled. It must not save until the user confirms `Apply to selected`.

### Filtering, saved views, and sorting

Bring the useful ledger filters into the review queue.

Required filters:

- search merchant, description, account, source, and import filename
- transaction month
- import file/source
- account
- amount range

Required sorting:

- newest first
- oldest first
- amount high to low
- amount low to high
- merchant A-Z

Behavior:

- filters update immediately for the current expected queue size
- show `Showing X of Y transactions to review`
- render active filters as removable chips
- provide one `Clear all` action
- preserve filter and sort state in URL search parameters
- restore the state after reload and browser navigation
- provide useful one-click views such as `All`, `Suggested`, `No suggestion`, `Repeated merchants`, and `High value`
- allow the user to save a named filter view only if repeated real use demonstrates value; do not add view management speculatively
- links from `/expenses` should be able to open a focused transaction without discarding compatible filter state
- selection position, previous/next, skip, and save-and-next operate on the visible sorted queue
- when the selected transaction is filtered out, select the first visible row and announce the change
- bulk `Select all` applies only to visible filtered rows and must say so

Suggested URL parameters:

```text
/imports/review?q=am%3Apm&month=2026-04&import=<id>&account=<id>&min=20&max=200&sort=amount_desc
```

Use stable IDs for import and account filters where available. Omit parameters that are at their default values.

### Queue and responsive presentation

Optimize the default columns for recognition and action:

```text
Select | Date | Merchant | Amount | Suggestion | Source
```

Move the full account description, import filename, original amount, normalized amount explanation, and other audit details into the selected transaction disclosure.

Required table behavior:

- selected row has a strong visible state independent of checkbox selection
- checkbox selection remains exclusive to bulk mode
- merchant and amount receive the strongest emphasis
- mixed Hebrew/English merchant names remain readable
- sortable column headers use `aria-sort`; the toolbar may expose the same sort on compact layouts
- the table header and decision panel remain visible during long review sessions where practical
- desktop uses an interactive grid only if its complete keyboard contract is implemented
- mobile uses transaction cards/stepper controls rather than a compressed multi-column grid

### Save, feedback, and recovery

- Preserve the existing validation and finance-domain behavior.
- `Save and next` remains the primary action.
- On success, remove the classified row from the strict queue and select the next visible row.
- Show a non-blocking success message that identifies the saved merchant.
- Offer Undo for the most recent single or bulk classification.
- Undo must restore the prior classification state, including deletion when the row was previously unclassified, and must reconcile derived expense events.
- Implement Undo through an auditable classification-decision history or command record. Do not approximate Undo with client-only cached state.
- Do not use optimistic removal unless failed saves can restore the exact queue and form state.
- Prevent duplicate submissions while a save is pending.

## Data and API work

### Review queue response

Extend the review queue data returned by `listReviewQueue` and `/api/imports/review` with:

- stable account and import filter options
- computed suggestion for the focused/current queue items, using a bounded query strategy
- exact normalized-merchant match count for rule and similar-transaction previews
- recent categories derived from recent user-reviewed classifications

Avoid an N+1 query for suggestions. Prefer one of:

1. compute suggestions only for the focused transaction and fetch again as focus changes, or
2. fetch aggregate merchant-history decisions for the merchants in the current queue in one grouped/batched query

Choose based on measured complexity and document the decision in the implementation notes below.

### Filtering architecture

Use server-owned filtering, sorting, pagination/cursoring, and aggregate counts behind the URL contract. Client state may provide responsive pending feedback, but the server response is authoritative.

Use debounced search, cancel stale requests, retain the selected transaction when valid, and avoid reloading unrelated workspace data. Verify acceptable behavior with at least 5,000 queue rows.

### Rule and reporting invariants

The implementation may reuse or replace existing services, but it must preserve these outcomes atomically:

- exact rules remain workspace-scoped, deterministic, ordered, editable, and deactivatable
- categories and members are validated against the active workspace
- classification decisions synchronize derived expense events and reports
- duplicate exact rules are not left active for the same canonical merchant
- rule creation and classification saving either succeed together or fail together

Do not add a prediction table merely to cache deterministic version 1 suggestions. A cache is justified only by measured query cost and must not become the source of truth.

## Component work

Expected capabilities or modules:

- `ReviewQueueToolbar`
- `ClassificationTypePicker`
- `CategoryCombobox`
- `ClassificationSuggestionCard`
- `MerchantRulePreview`
- `KeyboardShortcutHelp`
- pure review filter/sort helpers
- pure merchant-history suggestion aggregation helper
- category catalog and migration services
- review query/filter contract
- classification decision history and undo service
- responsive mobile transaction stepper

Do not treat the existing component tree as a required destination. Design a feature-oriented boundary that separates review queries, decision commands, suggestions, category catalog, URL state, and presentation.

Migrate recurring entries, manual entries, rules, and settings to category IDs as part of the catalog migration, using the shared picker where users choose a category.

## Implementation phases

### Phase 0 — Research, invariants, and architecture

- [ ] Capture current desktop and narrow-screen behavior for comparison.
- [x] Mark the transaction-review section of `UX_REVIEW.md` as superseded by this task.
- [ ] Document current save, rule, allocation, and queue-refresh behavior.
- [ ] Confirm the classification meaning of Personal, Shared, Household, Income, Transfer, and Ignore.
- [ ] Map WAI-ARIA interaction contracts for the grid, radio group, combobox, modal, and live regions.
- [ ] Produce desktop and mobile wireframes before implementation.
- [x] Define the server query contract, URL schema, category migration, and undo model.

### Phase 1 — Foundations and data migration

- [x] Add the category catalog schema and stable category references.
- [x] Write and verify migration/backfill for existing category strings.
- [x] Add starter categories for workspaces without a useful catalog.
- [x] Add classification decision history/command records required for auditable Undo.
- [x] Create server-side review filtering, sorting, pagination, counts, and focused-item query APIs.
- [x] Add automated test tooling before replacing the workflow.

### Phase 2 — New responsive review shell

- [x] Build the responsive master-detail desktop shell.
- [x] Build the mobile transaction stepper/card flow.
- [x] Add the server-backed filter toolbar, views, active chips, URL state, and sorting.
- [x] Implement the accessible interactive grid or approved native-table alternative.
- [x] Move audit details out of the recognition-focused queue.

### Phase 3 — Decision controls

- [x] Extract and implement the semantic classification type picker.
- [x] Preserve conditional member validation and labels.
- [x] Implement the accessible searchable category combobox.
- [x] Add recent-category ordering.
- [x] Rename Next to Skip for now.
- [x] Replace bulk review with the same type and category interaction language.

### Phase 4 — Keyboard workflow

- [x] Add safe page-level shortcut handling.
- [x] Add Arrow Up/Down visible-queue navigation.
- [x] Add number shortcuts for type selection.
- [x] Add category, rule, skip, and save shortcuts.
- [x] Add shortcut help and visible hints.
- [x] Add focus management, invalid-field focus, and live announcements.

### Phase 5 — Historical suggestions

- [x] Add the pure exact-merchant suggestion aggregator.
- [x] Add a bounded workspace-scoped history query.
- [x] Return suggestion evidence and match counts through the review API.
- [x] Render strong/likely suggestion cards.
- [x] Make Accept fill but not save the form.
- [x] Handle conflicting and insufficient history without showing a misleading suggestion.

### Phase 6 — Rule and similar-transaction previews

- [x] Replace the rule checkbox copy with the detailed preview.
- [x] Show create-versus-update state for existing exact rules.
- [x] Show current matching queue count.
- [x] Add Select similar transactions and prefilled bulk review.
- [x] Confirm that no existing matches are silently saved.

### Phase 7 — Undo, quality, and rollout

- [x] Improve save success and error recovery messaging.
- [x] Implement and verify auditable single and bulk Undo.
- [x] Verify performance with at least 5,000 queue rows.
- [ ] Complete desktop, narrow-screen, keyboard-only, and screen-reader-oriented QA.
- [x] Run automated unit, component-interaction, accessibility, and end-to-end tests.
- [x] Run lint and production build.
- [x] Update `docs/implementation-plan.md` and `UX_REVIEW.md` with the completed scope.

## Acceptance criteria

### Core review

- [ ] A user can classify ten transactions sequentially without using a pointer.
- [ ] A user can identify the current merchant, amount, and selected state at a glance.
- [x] Personal cannot save without a member owner.
- [x] Shared shows `Paid by`; Personal shows `Whose personal expense?`.
- [x] Transfer and Ignore do not show irrelevant category/member controls.
- [x] Save and next always advances within the visible filtered queue.
- [x] Skip for now never creates or updates a classification.

### Category picker

- [x] Category search works case-insensitively.
- [x] Arrow keys, Enter, Escape, and Tab behave predictably.
- [x] Suggested, recent, and all-category sections do not duplicate values.
- [x] Uncategorized remains a valid explicit state.
- [x] The picker is operable with keyboard and exposed correctly to assistive technology.

### Filters

- [x] Search, month, import/source, account, amount, and sort can be combined.
- [x] Result count is correct after every change.
- [x] Clear all restores the default queue.
- [x] Reload and browser Back/Forward restore filter and sort state.
- [x] Select all selects only visible rows and communicates that scope.

### Suggestions and rules

- [x] Suggestions never cross workspace boundaries.
- [x] Suggestions show only when the documented confidence threshold is met.
- [x] Accepting a suggestion does not save automatically.
- [x] Rule preview shows its exact match value and future effect.
- [x] Creating or updating a rule preserves existing classification-rule behavior.
- [x] Similar-transaction selection requires explicit bulk confirmation.

### Regression protection

- [x] Focused deep links from `/expenses` still open the intended transaction.
- [x] Already-classified focused transactions can still be corrected.
- [x] Allocation editing remains available only after a reportable classification.
- [x] Expense events and reports remain synchronized after classification changes.
- [x] Shared classifications retain payer/member information used by settlements.
- [x] Bulk classification still validates categories and workspace members.
- [x] Queue progress and per-import counts remain accurate after saves.
- [x] Existing category strings and historical reports remain correct after category-ID migration.
- [x] Undo restores classification, rule side effects where applicable, and derived expense events atomically.

### Responsive and accessibility

- [x] Desktop native-table behavior follows the documented keyboard contract.
- [x] Mobile review requires no horizontal table scrolling.
- [x] Radio-group Arrow keys, combobox Arrow keys, and review-table Arrow keys do not conflict.
- [ ] Every operation is available without a pointer.
- [x] Focus is retained or intentionally moved after filtering, saving, skipping, undoing, and closing overlays.
- [x] Automated accessibility checks report no serious or critical issues.
- [ ] Complete final manual screen-reader verification.

## Manual QA scenarios

1. Review an unclassified Household purchase using only keyboard shortcuts.
2. Attempt to save Personal without choosing a member, correct the error, and continue.
3. Search for a repeated Hebrew merchant, sort by amount, and review the filtered sequence.
4. Reload a filtered URL and confirm the same rows and order return.
5. Accept a strong historical suggestion, change its category, then save.
6. Verify no suggestion appears for conflicting 50/50 merchant history.
7. Enable rule creation, inspect the exact-match preview, save, and verify the rule behavior on a future import fixture.
8. Select all exact merchant matches, cancel the bulk modal, and confirm nothing changed.
9. Open a transaction from `/expenses`, correct its saved classification, and return to the ledger.
10. Exercise the flow with mixed Hebrew/English merchants at desktop and narrow widths.
11. Navigate the grid, category combobox, type picker, bulk dialog, and Undo feedback with a screen reader or accessibility inspector.
12. Confirm Escape closes nested UI in the correct order without losing saved work.
13. Migrate an existing workspace with several category strings and compare pre/post-migration reports.
14. Undo one single classification and one bulk classification; verify queue, rules, events, reports, and progress counts.
15. Exercise search, sorting, selection, and save-and-next with 5,000 generated review rows.

## Verification commands

Use the repository-required Node 20 environment.

```bash
npm run lint
npm run test:review
npm run build
```

Add and document:

- Vitest for domain, query-contract, migration-helper, suggestion, filter, and undo tests
- React Testing Library for interaction components
- Playwright for complete desktop/mobile review workflows
- an accessibility runner such as axe integrated into component or end-to-end coverage

Use the repository's Node 20 requirement and package-manager constraints when installing tooling.

## Out of scope for this refactor

- fuzzy merchant matching
- machine-learning or embedding-based predictions
- silent automatic approval of suggested decisions
- retroactive reclassification of historical transactions
- redesigning allocation or report-month editing
- changing settlement accounting semantics
- collaborative multi-user review locking beyond existing data-safety guarantees

## Implementation notes and decisions

Record material decisions here during implementation.

- Suggestion query strategy: exact normalized merchant history scoped to the current workspace; require at least two prior rows and a 75% winner, with unanimous history labeled strong.
- URL parameter contract changes: `q`, `month`, `import`, `account`, `min`, `max`, `sort`, `view`, and `page`; state is restored on load and `popstate` and preserved with `replaceState`. The API also accepts a capped `pageSize` (default 50, maximum 100) and returns filtered counts, total pages, global filter options, and focused-item data.
- Category combobox accessibility approach: editable ARIA combobox with listbox, active descendant, keyboard navigation, deduplicated Suggested/Recent/All sections, explicit Uncategorized, and inline category creation errors.
- Grid versus native-table accessibility decision: retain native table semantics on desktop; render the same markup as stacked labeled cards at narrow widths instead of implementing a custom ARIA grid.
- Category migration verification: migration `0008` adds nullable stable references while retaining the legacy display-name columns for a reversible compatibility period. Local and hosted pre/post checksums and row counts matched exactly on 2026-07-22; every non-empty historical category backfilled, and cross-workspace reference checks returned zero. Migration `0009` adds hierarchy, applicability, active/archive state, deterministic ordering, and optional icon/color metadata. On 2026-08-01 it was applied locally and hosted; legacy catalog checksums remained identical, every category was active and ordered, and none lacked applicability. Review, manual, recurring, rules, imports, derived expense events, suggestions, rename propagation, and Undo now use or restore stable IDs. New workspaces receive the ordered starter catalog during onboarding/bootstrap.
- Undo history design: workspace/user-owned decision batches snapshot the prior classification and exact-rule state, and each resulting classification records its producing batch ID. Undo locks the batch and refuses to overwrite a newer decision. Save, rule mutation, derived-event synchronization, and Undo run atomically. Hosted smoke tests verified single, exact-rule, two-row bulk, chained, stale-request, and unrelated-user isolation behavior.
- Performance result at 5,000 rows: the pure combined client filter/sort test completes on 5,000 generated queue rows in approximately 4 ms on the local Node 20 environment (500 ms regression ceiling). Database-query, rendering, and assistive-technology performance still require browser-level profiling.
- End-to-end baseline: Playwright runs 15 serialized Chromium scenarios against an isolated dev server, covering URL-backed filters and reload, keyboard type/category/skip behavior, isolated radio/combobox/help-dialog/table keyboard contracts, focused correction with stable category IDs, manual and recurring ID-native selectors, exact-rule restoration, workspace validation, shared payer retention, allocation availability, Save and next, bulk confirmation, Undo cleanup, queue-count restoration, a 390px no-overflow check, and axe scans of review, expenses, and recurring. All database-changing scenarios restore their decision batch in `finally` cleanup.
- Deviations from the planned shortcuts:

## Definition of done

This task is complete when all required phases and acceptance criteria are checked, regression behavior has been manually verified, lint and production build pass, and the product documentation reflects the final interaction rather than the original proposal.

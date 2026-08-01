# UX Review — Temporary Issue Tracker

This file tracks observations from our live, screen-by-screen product review. We will keep product decisions and fixes here until the review is complete, then move any durable decisions into the appropriate product/design docs.

## Status key

- `open` — observed and not yet addressed
- `discussing` — needs a product/UX decision
- `in progress` — implementation underway
- `fixed` — implemented and verified in the app
- `wont fix` — consciously not changing

## Review principles

- Start with the user’s goal and expected next action.
- Prefer plain-language labels, visible system status, and progressive disclosure.
- Check desktop and narrow/mobile layouts.
- Check empty, loading, success, error, and destructive-action states.
- Validate the end-to-end flow before polishing individual controls.

## Closeout snapshot

The transaction-review findings in this document are superseded by
`docs/transaction-review-workflow-task.md`, which is the implementation and verification
source of truth for the rebuilt review workspace.

The primary UX pass is implemented across Home, Imports, Review, Expenses, Recurring,
Reports, Investments, Settlements, Settings, and sign-in/onboarding. Shared modal,
destructive-confirmation, progressive-disclosure, and compact-page-header patterns are
now in use.

The final responsive and accessibility verification pass is complete. Shared focus
styles, dialog labels, mobile navigation state, narrow page headers, and table overflow
behavior are covered centrally.
BUG-002 remains a local database/runtime issue and is not being changed as part of this
UX work.

## Issues

<!-- Add one issue per entry using the template below. -->

### UX-001 — Home page is over-explaining the workflow

- Status: `discussing`
- Priority: `P1`
- Area/screen: Home (`/`)
- Observation: The home page contains a large hero, four metrics, Next action, Setup state, Workflow map, Reporting teaser, Recent bank imports, and Notable state. Much of the page explains the app’s architecture and process instead of helping the household decide what to do now.
- Why it matters: Two regular users who understand their own workflow do not need a tutorial-like process map. The density makes the app feel more complicated and pushes the important action below several explanatory sections.
- Proposed direction: Make the home page a compact dashboard: one clear next action, a small amount of useful status, and recent activity. Move setup details to Settings and remove the workflow map unless user testing shows it is needed.
- Decision:
- Fix / verification:

### UX-002 — Setup state duplicates Settings

- Status: `open`
- Priority: `P1`
- Area/screen: Home (`/`)
- Observation: Setup state repeats base currency, currency lock state, member count, and settlement readiness, with a second link to Settings.
- Why it matters: It creates a setup task the user may think they need to complete even when the workspace is already usable.
- Proposed direction: Remove the Setup state card from Home. Keep a small Settings link or a single warning only when a required setup action is genuinely blocking the next step.
- Decision:
- Fix / verification:

### UX-003 — Workflow map is unnecessary for the primary audience

- Status: `open`
- Priority: `P1`
- Area/screen: Home (`/`)
- Observation: The six-step Setup → Import → Review → Ledger → Recurring → Reports map is a second representation of the same next action logic.
- Why it matters: It adds cognitive load and makes a simple finance tool feel like a guided process users must follow in order.
- Proposed direction: Remove from Home. Keep navigation and the Next action card as the orientation system. If needed later, expose the process as optional help/onboarding.
- Decision:
- Fix / verification:

### UX-004 — Next action is the strongest home component

- Status: `open`
- Priority: `P1`
- Area/screen: Home (`/`)
- Observation: The Next action card is useful because it gives one prioritized action, explains why it matters, and links directly to it. The same action is also repeated in the hero button and sometimes in Notable state.
- Why it matters: The concept is right, but repetition reduces clarity and makes the page feel longer.
- Proposed direction: Keep one prominent Next action card near the top. Keep the hero action only if it is visually the same action; otherwise make the hero simpler.
- Decision:
- Fix / verification:

### UX-005 — Summary metrics need a purpose check

- Status: `open`
- Priority: `P2`
- Area/screen: Home (`/`)
- Observation: Active members, bank imports saved, transactions waiting for review, and selected-month savings are shown as four top-level metrics.
- Why it matters: “Bank imports saved” and “active members” are system/account facts, while “waiting for review” and “savings” are user-relevant state. Mixing them gives the strip no clear job.
- Proposed direction: Keep only actionable or decision-supporting values, likely Review queue and current-month balance/savings. Move member/import counts to their owning screens or make them secondary.
- Decision:
- Fix / verification:

### UX-006 — Reporting teaser is useful but should be secondary

- Status: `open`
- Priority: `P2`
- Area/screen: Home (`/`)
- Observation: Reporting teaser provides useful context, but the explanatory copy is long and it can compete with the next action.
- Why it matters: Reports are for checking results, not necessarily the first task for every visit.
- Proposed direction: Keep a compact “This month” summary below the primary action, with one link to Reports. Remove architecture/process language from the card copy.
- Decision:
- Fix / verification:

### UX-007 — Recent bank imports are useful history, not a primary task

- Status: `open`
- Priority: `P2`
- Area/screen: Home (`/`)
- Observation: Recent imports are a useful audit trail, but the current card explains imports as a workflow entry point and adds another full-width section.
- Why it matters: Users usually care about the result of an import—what needs review—not the fact that the import exists.
- Proposed direction: Keep the latest import as a compact recent-activity row, or move the full history entirely to Imports. Link directly to its pending review when applicable.
- Decision:
- Fix / verification:

### UX-008 — Notable state duplicates other home signals

- Status: `open`
- Priority: `P2`
- Area/screen: Home (`/`)
- Observation: Review queue, shared settlements, and workspace currency repeat information already shown in the Next action, sidebar, Setup state, or navigation badge.
- Why it matters: Repeated status cards increase scanning effort and make the page feel like an admin console.
- Proposed direction: Remove the section from Home. Show warnings inline at the point of action, such as a review badge or Settings warning.
- Decision:
- Fix / verification:

### UX-009 — Navigation language reinforces complexity

- Status: `open`
- Priority: `P2`
- Area/screen: App shell / Home sidebar
- Observation: The brand is labeled “Household workflow” and the primary navigation is grouped under “Workflow,” even though the app is meant to be a simple shared finance tool.
- Why it matters: The wording frames the product as a process-management system instead of a place to understand and manage household money.
- Proposed direction: Consider simpler language such as “Fin App” / “Money” or remove the section heading entirely. Keep the page labels, especially Review’s count badge, because they are direct and useful.
- Decision:
- Fix / verification:

### BUG-001 — Imports page fails during authenticated workspace bootstrap

- Status: `fixed`
- Priority: `P0`
- Area/screen: Imports (`/imports`)
- Environment: Local (`http://localhost:3000`)
- Observation: The page shows “Fin App could not load” with error ID `2872000980`. The server log shows the authenticated app user insert is rejected by PostgreSQL row-level security on the `users` table.
- Why it matters: A signed-in user can reach Home but cannot open Imports, which blocks the core product flow.
- Proposed direction: Fix the local Supabase/RLS bootstrap path, then verify the same authenticated user can open every app tab. After that, test the deployed environment separately; this local finding does not by itself prove the deployment is affected.
- Decision:
- Fix / verification: Updated the request-scoped database client context in `src/db/index.ts` so the authenticated user ID is applied before transaction queries, and explicitly set the RLS identity during Supabase workspace bootstrap in `src/features/workspaces/current-context.ts`. Restarted the local server and verified `/` and `/imports` render successfully. Home takes several seconds while workspace/reporting data loads. `npm run lint` passes.

### BUG-002 — Review queue hides existing transactions after workspace bootstrap

- Status: `open`
- Priority: `P0`
- Area/screen: Review (`/imports/review`)
- Environment: Local (`http://localhost:3000`)
- Observation: The database contains 52 transactions for the signed-in user’s workspace: 51 unclassified and 1 classified. The Review page renders 0 total, 0 waiting, and 0 reviewed, while the sidebar also shows 0 active members.
- Why it matters: The core review workflow can falsely appear complete and may cause users to miss transactions that still need decisions.
- Proposed direction: Fix the local request-scoped RLS identity propagation for all queries executed after `withCurrentWorkspace` resolves its context, then verify Home, Imports, Review, Expenses, and Reports against the same workspace/session. The deployed screenshot shows the expected 51 remaining and 1 reviewed, so the current evidence scopes this discrepancy to the local environment/runtime rather than the deployed product data.
- Decision:
- Fix / verification:

### UX-015 — Repeated hero header is too large

- Status: `open`
- Priority: `P1`
- Area/screen: Shared page layout / Review (`/imports/review`)
- Observation: The large hero header with an eyebrow, oversized title, and explanatory paragraph appears on every page and consumes a large portion of the initial viewport.
- Why it matters: It delays the page’s primary task and makes every screen feel heavier than necessary, especially on Review where users need to start processing transactions quickly.
- Proposed direction: Replace the repeated hero with a compact page header: small eyebrow or breadcrumb, normal-sized title, and one short supporting sentence only where needed. Reserve the large hero treatment for Home or onboarding.
- Decision:
- Fix / verification:

### UX-016 — “Keep the workflow moving” card has no distinct purpose

- Status: `open`
- Priority: `P1`
- Area/screen: Review (`/imports/review`)
- Observation: The card repeats navigation already available in the page and sidebar: “Back to imports” and “Continue to expenses.” Its explanatory copy is generic and does not help review the current transaction.
- Why it matters: It consumes valuable space before the queue and adds a process concept without a concrete decision or task.
- Proposed direction: Remove it from the normal Review state. If a transition card is useful, show a contextual completion state only after the queue reaches zero, with one clear next action.
- Decision:
- Fix / verification:

### UX-017 — Transaction rows should be selectable by clicking the row

- Status: `open`
- Priority: `P1`
- Area/screen: Review transaction table
- Observation: The checkbox is tiny and currently controls bulk selection, while the separate “Review” text button is the only way to load a row into the detail panel.
- Why it matters: Users naturally expect the transaction row or merchant name to open the transaction. The current interaction makes the main action feel hidden and makes the checkbox look like the selection mechanism for everything.
- Proposed direction: Make the row clickable with a clear hover/focus/selected state. Keep the checkbox exclusively for bulk selection and prevent row clicks from toggling it. Consider removing the repeated “Review” text button once row selection is clear.
- Decision:
- Fix / verification:

### UX-018 — Selected transaction lacks intentional navigation

- Status: `open`
- Priority: `P0`
- Area/screen: Review selected transaction panel
- Observation: The panel shows “Item 1 of 51 left in the queue,” but provides no Previous/Next controls and no “Save and next” action. Users must scroll back to the table and click another Review button. The position indicator also suggests an enforced order even though users can choose any row.
- Why it matters: Reviewing 51 transactions becomes a repetitive scroll-and-find loop. The page does not communicate whether the user is expected to work sequentially or choose freely.
- Proposed direction: Make the intended model explicit: allow free selection from the list, add Previous/Next controls in the detail panel, and make the primary action “Save and next” while retaining “Save” for users who want to stay. Preserve direct row selection for non-sequential review.
- Decision:
- Fix / verification:

### UX-019 — Bulk review controls compete with the primary single-review task

- Status: `open`
- Priority: `P2`
- Area/screen: Review transaction table
- Observation: Bulk classification controls appear prominently above the queue before the user has selected any rows, while the selected transaction editor is equally prominent beside it.
- Why it matters: The page asks users to understand bulk classification and single-item review at the same time. For two household users, most decisions are likely to be made one transaction at a time, with bulk actions as an occasional accelerator.
- Proposed direction: Make single-transaction review the default. Replace the always-visible bulk form with a secondary “Bulk actions” button near the table. Keep it disabled or unobtrusive until multiple rows are selected; then open a focused modal containing the classification fields, selected-row count, and final apply action.
- Decision: Explore a modal/secondary-action pattern so bulk review does not compete with the selected transaction editor.
- Fix / verification:

### UX-024 — Bulk actions should be an explicit secondary mode

- Status: `open`
- Priority: `P1`
- Area/screen: Review transaction table
- Observation: Bulk classification controls are always visible above the table, even when the user is reviewing one transaction and no rows are selected.
- Why it matters: The page’s primary task becomes unclear and the user has to understand bulk behavior before they need it.
- Proposed direction: Add a compact “Bulk actions” button. Keep it inactive until at least two rows are selected, then open a modal with the selected count, type/category/member fields, and a clear “Apply to selected” confirmation. Keep row checkboxes only for entering this secondary bulk mode.
- Decision:
- Fix / verification:

### UX-020 — “Member owner” is unclear and overloaded

- Status: `open`
- Priority: `P0`
- Area/screen: Review selected transaction
- Observation: The form asks for “Member owner,” but the product does not explain whether this means who made the purchase, whose personal budget it belongs to, who paid the bill, or who should be reimbursed. The data model uses the same member reference for personal attribution and later payer/settlement behavior.
- Why it matters: Users cannot make a confident decision from this label, and an incorrect choice can affect personal summaries and shared settlements.
- Proposed direction: Make the question conditional and explicit. For `Personal`, ask “Whose personal expense?” For `Shared`, ask “Who paid?” or “Paid by,” with an explanation that this supports settlement. Hide the member field for `Household`, `Income`, `Transfer`, and `Ignore` unless a clear use case requires it.
- Decision:
- Fix / verification:

### UX-021 — Classification types need user-facing explanations

- Status: `open`
- Priority: `P1`
- Area/screen: Review selected transaction
- Observation: The classification selector exposes raw values such as `personal`, `shared`, `household`, `income`, `transfer`, and `ignore` without explaining the consequence of each choice.
- Why it matters: These are product decisions, not simple metadata. Users need to know how each choice changes reports, ownership, and settlements.
- Proposed direction: Use simple labels only: Personal, Shared, Household, Income, Transfer, Ignore. If needed, add a subtle tooltip/help affordance rather than persistent explanatory copy. Reveal the relevant follow-up fields only after the type is chosen.
- Decision: Keep the primary choices concise; do not add explanatory sentences to the main form.
- Fix / verification:

### UX-022 — Selected transaction panel shows too much detail before the decision

- Status: `open`
- Priority: `P1`
- Area/screen: Review selected transaction
- Observation: The panel presents date, merchant, original amount, normalized amount, account, import source, import file, classification status, allocation status, three selectors, rule creation, ledger link, report links, and adjusted-period allocation in one continuous surface.
- Why it matters: The user’s immediate job is to classify one transaction. Import metadata and reporting controls compete with the core decision.
- Proposed direction: Put the decision first: merchant, date, amount, then classification type and conditional fields. Keep the import filename available as useful provenance, but present it compactly near the transaction summary or under a secondary “Details” section. Move report links and allocation into secondary details after classification.
- Decision: Preserve import-file context; reduce or collapse the less frequently used metadata and reporting controls.
- Fix / verification:

### UX-023 — Adjusted-period allocation is unclear

- Status: `open`
- Priority: `P1`
- Area/screen: Review selected transaction / Expenses
- Observation: “Adjusted-period allocation” and “Coverage start/end” do not clearly explain that this changes reporting distribution, not the transaction’s actual payment date. Users may not know when to use it or how to split an amount.
- Why it matters: This is an advanced financial concept. A user could believe they are editing the bank transaction date, or create a split without understanding how reports will change.
- Current behavior: After a transaction is classified, choose `Payment date` to keep the full amount in the original payment month. Choose `Adjusted period` to distribute the amount across the months it covers. `Equal split` divides it automatically between the coverage dates; `Manual split` lets the user add month rows and amounts that must total the original transaction amount.
- Proposed direction: Rename the section to something like “How should this appear in reports?” or “Spread this expense across months.” Add one concise explanation that the payment date stays unchanged. Keep it collapsed/secondary by default and reveal the split controls only when the user chooses adjusted reporting.
- Decision:
- Fix / verification:

### UX-025 — Expenses page has an unclear primary purpose

- Status: `open`
- Priority: `P1`
- Area/screen: Expenses (`/expenses`)
- Observation: The page combines a full ledger, manual-entry creation, saved manual-entry editing, imported-transaction filtering, review navigation, reports navigation, and allocation editing. The page does not clearly distinguish “all transactions” from “monthly reporting.”
- Why it matters: Users cannot tell whether Expenses is where they review a month, manage the ledger, create entries, or adjust reports. The Month filter feels like a page-level mode even though it only filters transaction dates.
- Proposed direction: Define Expenses as the household ledger: browse, search, filter, and inspect transactions across all months. Keep reporting month selection in Reports. Rename the filter to “Transaction month” or similar.
- Decision:
- Fix / verification:

### UX-026 — Manual entry creation should be intent-driven

- Status: `open`
- Priority: `P1`
- Area/screen: Expenses (`/expenses`)
- Observation: The full Create manual entry form is always open, although manual entries are likely occasional rather than the primary ledger task.
- Why it matters: It pushes the imported ledger down the page and makes a rare action look like the main purpose of Expenses.
- Proposed direction: Replace the full form with a compact `Add manual transaction` button. Open the form in a modal or drawer only after the user chooses to create one.
- Decision:
- Fix / verification:

### UX-027 — Empty Saved manual entries section should not occupy space

- Status: `open`
- Priority: `P2`
- Area/screen: Expenses (`/expenses`)
- Observation: Saved manual entries has a full card and empty-state copy even when there are zero manual entries.
- Why it matters: The empty card adds noise and reinforces that manual entry is a major workflow when it is not.
- Proposed direction: Hide the section when empty. When manual entries exist, show a compact expandable section or a dedicated manual-entry view that opens on intent.
- Decision:
- Fix / verification:

### UX-028 — Month filter scope is unclear

- Status: `open`
- Priority: `P2`
- Area/screen: Expenses (`/expenses`)
- Observation: The Month filter currently filters only the Imported transactions table. Saved manual entries remain outside that filter and continue to show independently.
- Why it matters: The filter appears to apply to the whole Expenses page, so users may expect manual entries to change as well.
- Proposed direction: Keep the “Month” label, but visually scope the filter to the Imported transactions section or add a small section-level filter layout. Decide separately whether manual entries should eventually have their own date filter.
- Decision:
- Fix / verification:

### UX-029 — Recurring page should prioritize existing rules

- Status: `open`
- Priority: `P1`
- Area/screen: Recurring (`/recurring`)
- Observation: The full Create recurring definition form is the first major content, while existing rules and selected rule details appear below it.
- Why it matters: Creating a recurring rule is occasional. On most visits users need to see whether rent, salary, or another rule is active, paused, or needs editing.
- Proposed direction: Make the existing recurring rules list the primary content. Show a compact empty state with `Add recurring rule` when there are no rules. Open creation in a modal or drawer only after explicit intent.
- Decision:
- Fix / verification:

### UX-030 — Recurring page contains too much process explanation

- Status: `open`
- Priority: `P2`
- Area/screen: Recurring (`/recurring`)
- Observation: The large hero, “Where recurring fits” card, and create-form explanation repeatedly explain how recurring connects imports and reports.
- Why it matters: It delays the actual rules and makes a configuration page feel like onboarding documentation.
- Proposed direction: Use a compact page header and one short supporting sentence. Let the rules list and their statuses explain the feature through the actual data.
- Decision:
- Fix / verification:

### UX-031 — Automatic report entries should be secondary

- Status: `open`
- Priority: `P2`
- Area/screen: Recurring (`/recurring`)
- Observation: Automatic report entries are presented as a full section with explanatory copy and a current-month state, even though users primarily manage recurring definitions.
- Why it matters: Users may confuse generated report rows with the recurring rules they created, and the section adds another concept to understand.
- Proposed direction: Keep this as a compact “This month” preview below the rules, or surface it only inside a selected rule’s details. Show it as confirmation of what the rule produced, not as a separate primary workflow.
- Decision:
- Fix / verification:

### UX-010 — Workspace currency should not be a form field

- Status: `open`
- Priority: `P1`
- Area/screen: Imports (`/imports`)
- Observation: The import form shows a disabled “Workspace currency” select even though currency is configured in Settings and rarely changes.
- Why it matters: It looks like an import-level choice and makes users wonder whether they need to do something before uploading.
- Proposed direction: Remove the field from the form. If needed, show a quiet helper such as “Amounts will be normalized to ILS” near the file drop zone. Keep currency details in Settings and show FX context only when a file contains foreign-currency rows.
- Decision:
- Fix / verification:

### UX-011 — Preview action should be conditional or automatic

- Status: `discussing`
- Priority: `P1`
- Area/screen: Imports (`/imports`)
- Observation: “Preview file” is visible before a file exists, which creates a dead-end action. After selecting a file, the user must click Preview and then Save transactions.
- Why it matters: The first click is meaningless with no file, while the two-click flow after selection may feel unnecessarily procedural.
- Proposed direction: Hide or disable the preview action until a file is selected. Prefer automatically starting the preview after file selection, with progress feedback, then keep an explicit “Save import” confirmation after the preview. The explicit save step is still valuable because it prevents bad/unsupported/duplicate data from being persisted.
- Decision:
- Fix / verification:

### UX-012 — Supported parser templates take too much space

- Status: `open`
- Priority: `P2`
- Area/screen: Imports (`/imports`)
- Observation: A full-width Supported parser templates card occupies space on every visit and explains internal parser coverage.
- Why it matters: Most users only need guidance when their file is not supported; the persistent card competes with the upload task.
- Proposed direction: Replace the card with a short hint near the drop zone, such as “Supports Max and Cal CSV/Excel exports,” and show the detailed reason plus supported-format guidance inline when detection fails.
- Decision:
- Fix / verification:

### UX-013 — Import page copy describes implementation instead of user outcome

- Status: `open`
- Priority: `P2`
- Area/screen: Imports (`/imports`)
- Observation: Copy such as “preview the rows,” “preview the import flow,” and “current expense-first dogfooding path” describes how the system works rather than what the user is trying to accomplish.
- Why it matters: It adds cognitive load and makes the product feel unfinished or technical.
- Proposed direction: Use outcome-focused copy: “Upload a bank statement to add its transactions,” then let the UI reveal review/save steps as needed.
- Decision:
- Fix / verification:

### UX-014 — Import preview uses internal template names and technical row wording

- Status: `open`
- Priority: `P2`
- Area/screen: Imports (`/imports`)
- Observation: The preview and saved-import history expose identifiers such as `max_credit_statement`, and the summary says “Rows parsed.”
- Why it matters: Internal identifiers are not meaningful to users, while “transactions” is the outcome they care about.
- Proposed direction: Display friendly labels such as “Max credit-card statement” in a neutral colored badge, and rename the count to “Transactions found.”
- Decision: Review-only for now; implementation deferred until the full tab-by-tab review is complete.
- Fix / verification: No implementation change retained.

## Review checklist

- [x] Home / dashboard
- [x] Imports and import review
- [x] Expenses / manual entry
- [x] Recurring
- [x] Reports
- [x] Investments
- [x] Settlements
- [x] Settings
- [x] Sign-in / onboarding
- [x] Responsive layout
- [x] Accessibility basics: keyboard focus, contrast, labels, error messaging

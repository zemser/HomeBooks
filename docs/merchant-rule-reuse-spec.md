# Merchant rule reuse specification

## Status

Accepted for implementation after product review: simple account-based attribution, without person pins.

## Decision

An exact merchant rule stores classification type and category. It applies workspace-wide across members' accounts. It never stores payer, personal owner, or income recipient from the reviewed transaction.

The account owner and the uploader are different concepts. Import preview asks the user to confirm **This account belongs to**. New accounts default to the uploader and can be changed. Existing ownership is shown when the account is already known. **Joint or unknown** leaves ownership empty. Saving confirms this account's owner for future imports and does not rewrite existing classifications.

## Automatic application

| Type | Attribution on the new transaction |
| --- | --- |
| Shared | Paid by the confirmed source-account owner. Split-for-settlement follows the saved rule and never creates a split definition. |
| Personal | Personal owner and paid by both follow the confirmed source-account owner |
| Income | Received by the confirmed source-account owner |
| Transfer / ignore | No people |

If the account has no owner, person-bearing types stay in review with type/category suggested. Transfer and ignore may still auto-apply. Preview and saved-import counts use the same eligibility decision.

A personal purchase for someone other than the account owner can be classified individually. That exception stays on this transaction. An automatic rule can still be saved; it stores only type and category, so later matches follow each source-account owner rather than this exception. The same applies to payer or income-recipient exceptions. There is no pin control in this version.

Matching remains exact, trimmed and case-insensitive. One active rule per merchant; saving a rule updates its existing exact match. Bulk classification does not create rules.

## Review and correction

The checkbox says **Automatically classify “merchant” as Type / Category**. It is available for any reviewed transaction with a merchant and a type, including person-specific exceptions. The preview explains that it applies across all members' accounts and people follow each source account. `R` toggles it when eligible.

The import result and saved statement library link to **View automatic classifications**, a History filter scoped to that import. History shows classification and payer, supports **Correct this transaction**, and links to the review editor to inspect or stop the rule. **Stop this rule** disables future application without changing existing transactions.

History suggestions aggregate agreement on type/category only. They never infer people from previous purchases. The current row's account supplies attribution; suggestions still require review.

## Existing rules and undo

Existing rules containing any saved person are treated as suggestions until explicitly saved again with the new account-based meaning. Their member fields are not silently cleared or reinterpreted. Existing classified transactions are unchanged.

New or reconfirmed rules store all member fields as null. The rule-table constraint permits personal rules with no stored owner; the transaction-classification constraint still requires a personal owner. Undo restores both the transaction and the previous rule snapshot, including legacy person assignments and active state.

Apply Drizzle migration `0013_merchant_rule_reuse.sql` before deploying the application changes.

## Reports and settlements

- Person-bearing matches with unknown account ownership remain unclassified and keep the month in progress.
- Reports show unreviewed account outflows separately. Those debits need classification before they can be called expenses: they might be transfers or excluded rows.
- Classified expenses remain in spending totals even if a payer is unassigned. Missing imported payer or recipient attribution keeps completion in progress and is called out in the monthly report.
- Shared balances require confirmed payer and split information. Rules never create split definitions.
- Settlement totals are explicitly totals of confirmed splits. Pending imports and shared rows missing payer or split produce an incomplete-settlement notice; a zero partial balance must not claim the household is balanced.

## Acceptance checks

- Alex uploads Sam's statement: Sam is payer and personal owner when Sam owns the account.
- A new account preview defaults **This account belongs to** to the uploader, and can be changed to the other member or joint.
- A shared merchant rule works on either member's account without replaying the rule creator's payer.
- Joint/unknown accounts remain pending for personal, shared and income rules.
- Personal-owner and payer exceptions stay on the reviewed transaction; a type/category rule can still be saved and later matches follow each account owner.
- New personal rules store no person; their resulting classifications have valid owners.
- Legacy person-bearing rules require confirmation; undo preserves their prior snapshots.
- Automatic History filtering survives navigation and reload; corrections and stopping rules are accessible.
- When a month is incomplete only because classified rows still need people, Home sends the user to History instead of an empty Review queue.
- Missing payer/split does not generate an inferred settlement.
- Previously classified transactions and duplicate-import protection remain unchanged.

## Known limit

A merchant can represent different spending scopes on different visits. An automatic rule is an explicit user-selected default, not proof that every purchase has that purpose. Users can correct individual exceptions or stop the rule.

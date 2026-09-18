# Max FX normalization specification

## Status

Accepted for implementation. This document is the source of truth for the next currency slice.

Do not start other product work in this change. Do not redesign Transactions IA, reporting layout, recurring UX, investments, or live FX APIs.

There are already imported Max statements in the dogfood workspace. Duplicate checksums will block re-uploading the same file, so this change must repair existing placeholder rows, not only new imports.

## Problem

Max credit-card Excel exports (`פירוט חיובים`) have **no original-currency column**. They have:

| Column | Hebrew header | Meaning |
| --- | --- | --- |
| 0 | תאריך עסקה | Transaction date |
| 1 | שם בית עסק | Merchant |
| 2 | סכום עסקה | Merchant / original amount |
| 3 | סכום חיוב | Charged / settlement amount |
| 4 | סוג עסקה | Transaction type |
| 5 | ענף | Category |
| 6 | הערות | Notes, usually empty |

Currency is implied by **section**, not by cell:

- Default ILS block under `עסקאות לחיוב ב-… ₪`
- `עסקאות שחויבו בדולר` → settlement is USD
- `עסקאות שחויבו באירו` or `…ביורו` → settlement is EUR

The current Max parser in `src/features/imports/templates/max.ts` stamps the section currency on **both** original and settlement. Normalization in `src/features/imports/parse-bank-workbook.ts` then converts settlement → workspace currency with **rate 1** and source `preview-placeholder-rate-1`.

That produces two different failures on real Visa 9556 files (April 2025–February 2026, folder used for this review: `/Users/a/Desktop/upplaod`).

### Pattern A — ILS-billed FX (label bug, report amount is fine)

The ILS section already converted the charge. Original ≠ settlement, but both are labeled ILS.

| Date | Merchant | File original | File settlement | Today’s UI | Correct |
| --- | --- | --- | --- | --- | --- |
| 2025-07-25 | OPENAI \*CHATGPT SUBSCR | 20 | 67.89 ILS | 20.00 ILS / 67.89 ILS / 67.89 ILS | 20.00 **USD** / 67.89 ILS / 67.89 ILS |
| 2025-07-04 | BKG\*HOTEL AT BOOKING.C | 19800 | 461.34 ILS | both ILS | 19,800 **JPY** / 461.34 ILS |
| 2025-05-16 | BOLT.EUO2505171518 | 11 | 44.19 ILS | both ILS | 11.00 **EUR** / 44.19 ILS |

Reports already use 67.89 / 461.34 / 44.19 ILS. Keep that. Fix the original currency.

### Pattern B — USD/EUR-billed FX (money bug)

A later section bills in USD or EUR. Original is often a third currency (JPY, CHF). Settlement is USD/EUR. Placeholder FX copies that number into ILS.

| Date | Merchant | File original | File settlement | Today’s UI | Correct report ILS |
| --- | --- | --- | --- | --- | --- |
| 2025-10-06 | HATERUMA KOKUSAIDORI | 3736 | 25.32 under `שחויבו בדולר` | 3,736.00 USD / 25.32 USD / **25.32 ILS** Placeholder FX | 25.32 **USD** converted with monthly USD→ILS, about 80 ILS, **not** 25.32 ILS |
| 2025-10-07 | UBER TRIP\* TRIP | 1100 | 7.39 USD | 1,100.00 USD / 7.39 USD / **7.39 ILS** | 7.39 USD × monthly USD→ILS |
| 2026-01-17 | PRET A MANGER | 11.2 | 12.14 under `שחויבו באירו` | labeled ILS because parser only matches `יורו`, not `אירו` | 12.14 **EUR** × monthly EUR→ILS; original **CHF** |

25.32 ILS for a 3,736 JPY dinner is wrong by about 3×. This is the bug reports must stop shipping.

### Pattern C — not FX

Same ILS section, original ≈ settlement × 1.0526 (Amisragaz). Treat as same-currency ILS, not foreign.

Equal original and settlement (groceries, DCC already in ILS, Amazon ILS) stay ILS/ILS. No badge.

## Decision

1. **Settlement is the charged amount.** Reports always normalize **from settlement**, never from original. Original is audit/display only.
2. **If Max already charged ILS, that ILS number is the report amount.** Do not apply FX. Do not show Placeholder FX.
3. **If Max charged USD or EUR, convert settlement → workspace currency with a real monthly average.** Never copy USD/EUR into ILS at rate 1.
4. **When original ≠ settlement, do not copy the section currency onto the original.** Infer original currency from the implied rate, or leave it null if no band matches.
5. **`אירו` is EUR.** Section detection must treat `אירו` and `יורו` as EUR.
6. **Placeholder FX remains only when a required monthly rate is missing.** It must not be the happy path for travel spend.

Workspace currency for this product is ILS. Keep the generic `fromCurrency` / `toCurrency` helpers; do not hard-code ILS except in seeded rates and tests.

## Out of scope

- Live FX HTTP APIs, daily rates, or paid data providers
- Recurring monthly-average / fixed-rate actually using market rates (the form still says placeholder 1:1; leave that for a follow-up that reuses the helper)
- Manual one-off entries in foreign currency
- Investments
- Renaming ledger columns away from Original / Settlement / Normalized
- Cal card export currency columns (already present). Only reuse inference if a Cal original-currency cell is blank
- Transaction date timezone off-by-one on Max Excel dates
- Changing classification, settlements, or merchant rules

## Current code map

Read these before editing.

| Path | Role today | Change |
| --- | --- | --- |
| `src/features/imports/templates/max.ts` | Section currency stamped on original **and** settlement. `inferSectionCurrency` matches `דולר` and `יורו` only | Settlement currency from section (including `אירו`). Original currency from shared inference when amounts differ |
| `src/features/imports/templates/cal.ts` | Separate original/settlement currency cells via `mapCurrencySymbol` | Unchanged unless original currency cell empty |
| `src/features/imports/templates/cal-recent-transactions.ts` | Original sometimes parsed from notes | If notes have no currency, run the same inference |
| `src/features/imports/parse-bank-workbook.ts` | Always `monthlyAverageRate: 1`, source `preview-placeholder-rate-1` | Use settlement amount/currency. Workspace settlement → rate 1, source `settlement-in-workspace-currency`. Foreign settlement → monthly rate lookup |
| `src/features/imports/persistence.ts` | Saves preview normalization as-is. Duplicate checksum short-circuits re-import | Pass the real normalizer into preview. Repair existing placeholder rows (see Backfill) |
| `src/features/currency/normalize.ts` | Multiplies by injected rate | Keep. Callers must stop injecting `1` for foreign settlement |
| `src/features/currency/display.ts` | Placeholder / Foreign settled / Foreign currency | Copy updates below |
| `src/db/schema.ts` `exchange_rate_monthly` | Table exists, never read or written | Seed + lookup helper. Quote convention below |
| `src/app/api/imports/preview/route.ts` | Warns whenever source contains `placeholder` | Warn only for true missing-rate rows; Pattern A must not warn |

`parseBankWorkbookToPreview` already normalizes from `transaction.settlementAmount ?? transaction.originalAmount`. Keep that. The bug is the currency stamped on settlement and the rate of 1.

## Max parser rules

### Section currency

Apply to `statementSection` / the current section header, in order:

1. Contains `דולר` → `USD`
2. Contains `אירו` or `יורו` → `EUR`
3. Contains `ליש"ט` or `סטרלינג` or `GBP` → `GBP` (defensive; not in the sample files)
4. Else → `ILS` (including the opening `עסקאות לחיוב ב-… ₪` title and rows before any foreign section)

Rows **before** the first `עסקאות שחויבו ב…` header stay ILS. That matches the October 2025 file: ILS block first, then a long `שחויבו בדולר` Japan block.

### Original vs settlement

Let `originalAmount` = column 2, `settlementAmount` = column 3 (fallback to original if missing, as today).

**Nearly equal (not FX).** If both amounts exist and `abs(original − settlement) / max(abs(original), abs(settlement)) <= 0.06`, treat as same currency: `originalCurrency = settlementCurrency = sectionCurrency`. This covers Amisragaz 190.10 → 180.59 (ratio 1.0526) and tiny card rounding.

**Equal.** Same: both currencies = section currency. No inference.

**Materially different.** `settlementCurrency = sectionCurrency`. `originalCurrency = inferOriginalCurrency({ originalAmount, settlementAmount, settlementCurrency })`. If inference returns null, store `originalCurrency` as null (allow null on the parsed type; `transactions.original_currency` is already nullable).

Never set `originalCurrency = settlementCurrency` when the amounts are materially different.

### `inferOriginalCurrency`

Put this in `src/features/currency/infer-original-currency.ts` so Max parse, Cal-recent fallback, tests, and backfill share one function.

Use `implied = abs(settlementAmount / originalAmount)` and `inverse = abs(originalAmount / settlementAmount)`.

When **settlement is ILS**:

| Match first | Band | Original currency | Sample |
| --- | --- | --- | --- |
| JPY | `inverse` in `[130, 170]` or `implied` in `[0.018, 0.030]` | JPY | Toyota Okinawa 33539 → 761.34; Booking 19800 → 461.34; TeamLab 10400 → 240.24 |
| EUR | `implied` in `[3.75, 4.50]` | EUR | Cyprus/Greece ~4.02; Uber Europe ~4.24; OEBB 3.83 |
| USD | `implied` in `[3.10, 3.74]` | USD | ChatGPT 20 → 67.89 (3.39); ESTA 40 → 129.64 (3.24); Amazon 65.99 → 213.41 |
| else | | `null` | Leave unlabeled rather than inventing |

When **settlement is USD**:

| Match first | Band | Original currency | Sample |
| --- | --- | --- | --- |
| JPY | `inverse` in `[130, 170]` | JPY | Hateruma 3736 → 25.32 USD (147.6); Uber 1100 → 7.39 USD (148.8) |
| else | | `null` | Do not assume original is USD just because the section is USD |

When **settlement is EUR**:

| Match first | Band | Original currency | Sample |
| --- | --- | --- | --- |
| CHF | `implied` in `[1.02, 1.15]` i.e. original/settlement in `[0.87, 0.98]` | CHF | Pret a Manger 11.2 → 12.14 (CHF→EUR ~0.92) |
| USD | `inverse` in `[1.05, 1.25]` | USD | AIRALO 7 → 6.07 EUR |
| else | | `null` | |

Do not infer from merchant name. Rate bands are enough for the sample set and stay deterministic.

If a later real file lands in a gap, null original currency + correct settlement is better than a wrong code.

## Normalization rules

Always convert **settlement → workspace**.

```text
if settlementCurrency == workspaceCurrency:
  normalized = settlementAmount
  rate = 1
  source = "settlement-in-workspace-currency"
else:
  rate = monthlyAverage(settlementCurrency → workspaceCurrency, month of transactionDate)
  if rate missing:
    do not use 1
    source = "missing-monthly-rate"
    normalizedAmount is still required by the schema: store settlementAmount
      but reporting MUST exclude these rows from workspace totals
      and UI MUST show Placeholder FX / Needs FX rate, never treat the number as ILS spend
  else:
    normalized = round2(settlementAmount * rate)
    source = "exchange-rate-monthly:{sourceName}"
```

Same-currency original and settlement in ILS: source `settlement-in-workspace-currency` (or keep `same-currency` if you prefer one alias; do not contain the substring `placeholder`).

ChatGPT after this change: original USD, settlement ILS, normalized 67.89 ILS, source `settlement-in-workspace-currency`, badge **Foreign settled**.

Hateruma after this change: original JPY, settlement USD, normalized `25.32 * usdIlsRate(2025-10)`, source `exchange-rate-monthly:…`, badge **Converted** (not Placeholder FX).

### Monthly rates

Use existing `exchange_rate_monthly`:

- `base_currency`: the foreign currency (`USD`, `EUR`, `GBP`, `JPY`, `CHF`)
- `quote_currency`: `ILS`
- `year_month`: first of the month (`2025-10-01`)
- `average_rate`: **ILS per 1 unit of base** (USD/ILS 3.3 means 1 USD = 3.3 ILS; JPY/ILS ~0.023)
- `source_name`: `seed-boi-monthly-average`

Lookup: `normalized = settlementAmount * averageRate` for that pair and month.

If only the inverse pair exists, invert. Do not invent crosses except via ILS (USD→EUR is out of scope; we only convert **into workspace ILS**).

**Seed** months 2025-01 through 2026-12 for `USD`, `EUR`, `GBP`, `JPY`, `CHF` vs ILS. Use Bank of Israel monthly averages (public, free). Commit as a TypeScript or JSON fixture loaded by a Drizzle migration or an idempotent seed called from the lookup helper on first miss **in tests**, and applied in a SQL migration for deployed DBs.

Do not call the network during preview or save. Missing seed row → `missing-monthly-rate` behavior above.

Approximate check values for tests (replace with the seeded official averages; tests should read the seed, not hard-code 3.3):

- 2025-10 USD/ILS is around 3.3, so Hateruma 25.32 USD must **not** normalize to 25.32 ILS
- 2025-07 ChatGPT must still normalize to **67.89** ILS (settlement already ILS; seed unused)

### `CurrencyNormalizer`

Today the injectable normalizer receives `{ amount, fromCurrency, transactionDate }`. Persistence calls `parseBankWorkbookToPreview` **without** a custom normalizer, so production always gets rate 1.

Change production preview/save to inject a helper that reads `exchange_rate_monthly` (and the seed in unit tests via an in-memory map). Tests that do not care about FX can keep passing a stub.

`normalizedAmount` stays numeric(18,6) NOT NULL. `missing-monthly-rate` rows still store a number; reports and completeness must ignore them as ILS spend.

## Display

Update `src/features/currency/display.ts` and any preview warning copy.

| Condition | Badge | Tone | Meaning |
| --- | --- | --- | --- |
| original ≠ workspace, settlement === workspace, source does not contain `placeholder` or `missing-monthly-rate` | Foreign settled | neutral | ChatGPT, Booking JPY charged in ILS. Reports use the ILS charge. Drop the sentence “full multicurrency reporting is unfinished” |
| settlement ≠ workspace, source starts with `exchange-rate-monthly` | Converted | neutral | Japan USD-billed. Short text: `Charged {settlement} {ccy}, shown in {workspace} at monthly average.` |
| source contains `missing-monthly-rate` or `placeholder` | Placeholder FX | warning | Rate table miss only |
| original null, settlement === workspace, amounts differ | Foreign settled | neutral | Unknown original, ILS charge trusted |
| all currencies workspace, amounts equal | none | | |

Keep column headers Original / Settlement / Normalized. Format original with inferred code; if original currency is null, show the number without a 3-letter code (or `—`) so we do not print `20.00 ILS` for ChatGPT.

Preview warnings in `src/app/api/imports/preview/route.ts`:

- Remove the blanket warning that fires whenever settlement ≠ workspace. Converted rows are expected.
- Warn only when any preview row uses `missing-monthly-rate`.
- Pattern A must not mention Placeholder FX.

Reports / home banners that count Placeholder FX should follow `usesPlaceholderRate` after the source-string change so ChatGPT and converted Japan rows drop out of that count.

## Reporting

`src/features/reporting/monthly-report.ts` already uses `transactions.normalizedAmount` and passes `fxDetails`.

Add: line items whose `normalizationRateSource` contains `missing-monthly-rate` are **not** reportable spend/income. Count them in the existing incomplete / Placeholder FX banner. Do not add them into category totals, home cards, or exports as ILS.

Converted Japan rows **are** reportable at the converted ILS amount.

Do not change allocation math beyond “skip missing-rate rows” the same way ignore/transfer are skipped.

## Backfill

Existing Max rows in the dogfood DB have wrong `original_currency` and 1:1 `normalized_amount` for USD/EUR sections.

Add `recomputeImportedFx(row)` that:

1. Re-reads `statement_section` through the new section-currency helper (fixes `אירו`)
2. Re-infers original currency from stored original/settlement amounts
3. Re-runs normalization from settlement

Run it for persisted `transactions` where **any** of:

- `normalization_rate_source` contains `placeholder`
- `original_amount` materially differs from `settlement_amount` and `original_currency = settlement_currency`
- `statement_section` contains `אירו` or `דולר`

Idempotent. Do not rewrite rows that already match the new rules.

Wire this as:

- a function in `src/features/currency/` used by tests, **and**
- a one-shot call from import save startup is too surprising; prefer `scripts/renormalize-imported-fx.ts` plus invoking the same function at the start of `saveImport` for the current workspace’s already-stored transactions that match the filter (so dogfood is repaired without a manual script). Saving a **new** statement should repair older placeholder rows in that workspace. Keep it workspace-scoped.

Do not clear classifications. Amount/currency repair must not un-review a row.

Expense events / reporting projections: after updating `normalized_amount`, reuse the existing invalidation / `syncTransactionExpenseEvents` path so monthly reports move. If a projection rebuild is required, call the same helper import save already uses for new rows.

## Tests

There are **no** Max parser tests today. Add `tests/review/max-fx-normalization.test.ts` (pure, no DB) and a small DB test only if backfill needs it.

Build `WorkbookData` in memory. Do not require `/Users/a/Desktop/upplaod` at test time. Optional: check a slim fixture into `tests/fixtures/max-fx-sample.xlsx` later; in-memory rows are enough.

Cover at least:

1. **ChatGPT ILS section:** orig 20, settle 67.89, no foreign section → original USD, settlement ILS, normalized 67.89, source `settlement-in-workspace-currency`, display Foreign settled, not Placeholder FX
2. **Hateruma USD section:** section `עסקאות שחויבו בדולר`, orig 3736, settle 25.32 → original JPY, settlement USD, normalized `25.32 * seededUsdIls`, **not** 25.32, source `exchange-rate-monthly:…`, display Converted
3. **Uber USD section:** 1100 → 7.39, same as (2)
4. **TeamLab / Booking ILS section JPY:** 10400 → 240.24 ILS and 19800 → 461.34 ILS → original JPY, settlement ILS, normalized = settlement
5. **Cyprus EUR in ILS section:** 11 → 44.19 → original EUR, settlement ILS
6. **Amisragaz:** 190.10 → 180.59 → both ILS, no foreign badge
7. **Equal ILS grocery:** 20.89 → 20.89 → no badge
8. **`עסקאות שחויבו באירו`:** Pret 11.2 → 12.14 → settlement EUR (not ILS), original CHF, normalized uses EUR→ILS seed
9. **Section detection:** `יורו` still EUR
10. **Missing rate:** foreign settlement with no seed row → source `missing-monthly-rate`, display Placeholder FX, report helper excludes the amount
11. **Display copy:** `getCurrencyNormalizationDisplayState` for the ChatGPT and Hateruma outputs
12. **Backfill:** a stored row with originalCurrency USD, settlementCurrency USD, amounts 3736 / 25.32, section `עסקאות שחויבו בדולר`, source `preview-placeholder-rate-1` becomes JPY / USD / converted ILS

Also extend `tests/review/currency-and-recurring-normalization.test.ts` only if you touch recurring (you should not).

Run `npm run test:review` and `npx tsc --noEmit`. No e2e required unless preview warnings are easier to lock in Playwright; prefer unit tests.

## UI / copy touchpoints

Update strings in:

- `src/features/currency/display.ts`
- `src/app/api/imports/preview/route.ts`
- `src/app/(app)/reports/page.tsx` Placeholder FX banner (behavior follows display helper)
- README “Current caveats” after implementation: Placeholder FX is only a missing-rate fallback; Max ILS charges and monthly-average USD/EUR conversion are supported

Do not rewrite the expenses table column titles in this change.

## Docs to update in the implementation PR

- `README.md` caveats
- `docs/implementation-plan.md` progress snapshot: this slice done; remaining FX work is live rate refresh + recurring real rates
- `docs/architecture.md` currency section: monthly average is now used for foreign **settlement**, not for ILS-settled originals
- This spec stays the source of truth; do not fork rules into comments

## Acceptance checks

Using the Visa 9556 Max files (or the in-memory equivalents):

- ChatGPT shows **20.00 USD** original, **67.89 ILS** settlement and normalized, badge Foreign settled, and the month total includes 67.89 not 20
- Hateruma / Japan USD-section dinners show original **JPY**, settlement **USD**, normalized **≈ 25.32 × USD/ILS**, badge Converted, and the month total is **not** 25.32 ILS
- Uber 1,100 / 7.39 in the dollar section behaves like Hateruma
- ILS groceries unchanged
- Amisragaz is not labeled foreign
- February 2026 `שחויבו באירו` rows are EUR settlement, not ILS
- Re-saving any import in a workspace that already has placeholder Max rows repairs those amounts without dropping classifications
- Preview no longer warns “Placeholder FX” for ChatGPT
- A USD-settled row whose month is missing from the seed is excluded from ILS totals and visibly flagged

## Suggested implementation order

1. `inferOriginalCurrency` + section-currency helper + unit tests with the table rows above
2. Max parser (`אירו`, stop copying section currency onto original)
3. Seed `exchange_rate_monthly` and lookup helper
4. Replace rate-1 normalizer in `parse-bank-workbook` / persistence
5. Display + preview warnings + report exclusion for missing-rate
6. Backfill function + hook on save + test
7. README / implementation-plan caveats

Ship as one PR. Parser-only without stopping 1:1 USD→ILS still understates Japan spend.

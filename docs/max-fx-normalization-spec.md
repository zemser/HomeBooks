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

Installments (`סוג עסקה` contains `תשלומים`) often have original = full purchase and settlement = this month’s charge. That is not FX. Do not infer a foreign original and do not show Foreign settled.

## Decision

1. **Settlement is the charged amount.** Reports always normalize **from settlement**, never from original. Original is audit/display only.
2. **If Max already charged ILS, that ILS number is the report amount.** Do not apply FX. Do not show Placeholder FX.
3. **If Max charged USD or EUR, convert settlement → workspace currency with a real monthly average.** Never copy USD/EUR into ILS at rate 1.
4. **When original ≠ settlement, do not copy the section currency onto the original.** Infer original currency from the implied rate versus seeded official monthly rates (markup window below), or leave it null if nothing matches. Do not use hardcoded ILS USD/EUR partitions — those fitted 2025 Max billed rates and already overlap 2026 EUR with the old USD band.
5. **`אירו` is EUR.** Section detection must treat `אירו` and `יורו` as EUR.
6. **Placeholder FX remains only when a required monthly rate is missing.** It must not be the happy path for travel spend. Use that one label everywhere (not “Needs FX rate”).
7. **A missing rate must not look like ILS spend.** Store `normalizedAmount = 0` with source `missing-monthly-rate`. Forgotten report filters then undercount instead of treating 25.32 USD as 25.32 ILS.
8. **Foreign settled requires a real foreign original code.** Null original + workspace settlement is unlabeled, not Foreign settled.

Workspace currency for this product is ILS. Keep the generic `fromCurrency` / `toCurrency` helpers; do not hard-code ILS except in seeded rates and tests.

## Out of scope

- Live FX HTTP APIs, daily rates, or paid data providers
- Recurring monthly-average / fixed-rate actually using market rates (the form still says placeholder 1:1; leave that for a follow-up that reuses the helper)
- Manual one-off entries in foreign currency
- Investments
- Renaming ledger columns away from Original / Settlement / Normalized
- Cal card export and Cal recent-transactions inference. `mapCurrencySymbol("")` already returns `ILS`, so “infer when the Cal original cell is empty” is a no-op or a footgun. Leave Cal parsers unchanged in this slice.
- Transaction date timezone off-by-one on Max Excel dates
- Changing classification types, merchant rules, or settlement UX beyond repairing amounts and imported fixed splits after backfill

## Current code map

Read these before editing.

| Path | Role today | Change |
| --- | --- | --- |
| `src/features/imports/templates/max.ts` | Section currency stamped on original **and** settlement. `inferSectionCurrency` matches `דולר` and `יורו` only | Settlement currency from section (including `אירו`). Skip inference for תשלומים. Original currency from shared inference when amounts differ |
| `src/features/imports/templates/cal.ts` | Separate original/settlement currency cells via `mapCurrencySymbol` | Unchanged |
| `src/features/imports/templates/cal-recent-transactions.ts` | Original sometimes parsed from notes | Unchanged |
| `src/features/imports/types.ts` | `originalCurrency: string` | Allow `string \| null` on parsed/preview types |
| `src/features/imports/parse-bank-workbook.ts` | Always `monthlyAverageRate: 1`, source `preview-placeholder-rate-1` | Prefetch monthly rates, then inject a **sync** map. Workspace settlement → `same-currency`. Foreign settlement → monthly rate lookup |
| `src/features/imports/persistence.ts` | Saves preview normalization as-is. Duplicate checksum short-circuits re-import | Pass the prefetched normalizer into preview. Repair existing placeholder rows (see Backfill). Return the repair count |
| `src/features/currency/normalize.ts` | Multiplies by injected rate; `from === to` already returns `same-currency` | Keep that alias. Callers must stop injecting `1` for foreign settlement. Missing-rate path must **not** call this with rate 1 (it would throw or 1:1) |
| `src/features/currency/display.ts` | Placeholder / Foreign settled / Foreign currency | Copy updates below. No badge animation |
| `src/features/expenses/presentation.ts` `formatMoneyDisplay` | Null currency → `-` (hides the amount) | Null/blank currency shows the number only (`20.00`), never `20.00 ILS` and never `-` when the amount exists |
| `src/db/schema.ts` `exchange_rate_monthly` | Table exists, never read or written | Seed via SQL migration. App **SELECT only** |
| `src/app/api/imports/preview/route.ts` | Warns whenever settlement ≠ workspace or source contains `placeholder` | Prefetch rates on the server. Warn only for `missing-monthly-rate` rows; Pattern A must not warn |
| `src/features/reporting/monthly-report.ts` | Sums `normalizedAmount` for classified rows | Skip `missing-monthly-rate` like ignore/transfer in records, completeness SQL, home, and exports |
| `src/features/reporting/expense-events.ts` | Projects `normalizedAmount` into events/allocations | After backfill, resync. Do not project missing-rate rows as ILS spend. Imported **fixed** shared splits must rescale or reset when the total changes |

`parseBankWorkbookToPreview` already normalizes from `transaction.settlementAmount ?? transaction.originalAmount`. Keep that. The bug is the currency stamped on settlement and the rate of 1.

`CurrencyNormalizer` and `parseBankWorkbookToPreview` stay synchronous. Preview is already `POST /api/imports/preview` (correct for a file upload). Do not add a client FX fetch or live BoI HTTP during preview/save.

## Max parser rules

### Section currency

Apply to `statementSection` / the current section header, in order:

1. Contains `דולר` → `USD`
2. Contains `אירו` or `יורו` → `EUR`
3. Contains `ליש"ט` or `סטרלינג` or `GBP` → `GBP` (defensive; not in the sample files)
4. Else → `ILS` (including the opening `עסקאות לחיוב ב-… ₪` title and rows before any foreign section)

Rows **before** the first `עסקאות שחויבו ב…` header stay ILS. That matches the October 2025 file: ILS block first, then a long `שחויבו בדולר` Japan block.

### Original vs settlement

Let `originalAmount` = column 2, `settlementAmount` = column 3 (fallback to original if missing, as today). Let `transactionType` = column 4.

**Installments (not FX).** If `transactionType` contains `תשלומים`, treat as same currency: `originalCurrency = settlementCurrency = sectionCurrency`. Do not infer. A 1,200 ILS purchase billed 100 this month must not become Foreign settled.

**Nearly equal (not FX).** If both amounts exist and `abs(original − settlement) / max(abs(original), abs(settlement)) <= 0.06`, treat as same currency: `originalCurrency = settlementCurrency = sectionCurrency`. This covers Amisragaz 190.10 → 180.59 (ratio 1.0526) and tiny card rounding.

**Equal.** Same: both currencies = section currency. No inference.

**Materially different.** `settlementCurrency = sectionCurrency`. `originalCurrency = inferOriginalCurrency({ originalAmount, settlementAmount, settlementCurrency, transactionDate, rates })`. If inference returns null, store `originalCurrency` as null (`transactions.original_currency` is already nullable; parsed types must allow null).

Never set `originalCurrency = settlementCurrency` when the amounts are materially different, except the installment and nearly-equal cases above.

## `inferOriginalCurrency`

Put this in `src/features/currency/infer-original-currency.ts` so Max parse, tests, and backfill share one function.

Do not infer from merchant name.

```ts
inferOriginalCurrency({
  originalAmount,
  settlementAmount,
  settlementCurrency,
  transactionDate, // YYYY-MM-DD; month used for official rates
  rates,           // (base, quote, yearMonthFirstOfMonth) => number | null
}): string | null
```

Use `implied = abs(settlementAmount / originalAmount)` and `inverse = abs(originalAmount / settlementAmount)`.

If a later real file lands in a gap, **null original + correct settlement is better than a wrong code.**

### When settlement is ILS

Do **not** use hardcoded USD `[3.10, 3.74]` / EUR `[3.75, 4.50]` bands. Those were fitted to 2025 Max billed rates. By late 2026 official EUR/ILS sits near 3.5, which would have been labeled USD.

For each candidate in `USD`, `EUR`, `GBP`, `JPY`, `CHF`:

1. `official = rates(candidate, ILS, monthOf(transactionDate))` — ILS per 1 unit of candidate, same convention as the seed.
2. Skip the candidate if `official` is missing or not positive.
3. `markup = implied / official`.
4. Keep the candidate if `markup` is in `[0.95, 1.20]` (Max billed rate vs BoI monthly average).

Among kept candidates, pick the one with the smallest `abs(markup - 1)`. If none, return `null`.

JPY is two orders of magnitude away from USD/EUR, so nearest-official still separates TeamLab 10400 → 240.24 (~0.023) from ChatGPT 20 → 67.89 (~3.39).

Inject the rate map in unit tests. A 2026-style case must not regress: original 11, settlement 40.15 ILS, official EUR/ILS 3.51 and USD/ILS 3.02 → **EUR**, not USD.

### When settlement is USD

JPY/USD is stable enough for a magnitude check. Do not assume original is USD just because the section is USD.

| Match first | Band | Original currency | Sample |
| --- | --- | --- | --- |
| JPY | `inverse` in `[130, 170]` | JPY | Hateruma 3736 → 25.32 USD (147.6); Uber 1100 → 7.39 USD (148.8) |
| else | | `null` | |

Optional extra: if JPY and USD ILS seeds exist, `officialJpyPerUsd = rates(JPY,ILS) / rates(USD,ILS)` and accept JPY when `inverse / officialJpyPerUsd` is in `[0.95, 1.20]`. The magnitude band is enough for the Visa samples; add the cross-check only if a test needs it.

### When settlement is EUR

These pairs are not in ILS space, so they do not rot the way the old ILS USD/EUR partitions did.

| Match first | Band | Original currency | Sample |
| --- | --- | --- | --- |
| CHF | `implied` in `[1.02, 1.15]` | CHF | Pret a Manger 11.2 → 12.14 (CHF→EUR ~0.92, implied ~1.08) |
| USD | `inverse` in `[1.05, 1.25]` | USD | AIRALO 7 → 6.07 EUR |
| else | | `null` | |

## Normalization rules

Always convert **settlement → workspace**.

```text
if settlementCurrency == workspaceCurrency:
  normalized = settlementAmount
  rate = 1
  source = "same-currency"
else:
  rate = monthlyAverage(settlementCurrency → workspaceCurrency, month of transactionDate)
  if rate missing:
    do not use 1
    do not store settlementAmount as ILS
    source = "missing-monthly-rate"
    normalizedAmount = 0          # schema is NOT NULL
    reporting MUST skip the row like ignore/transfer
    UI MUST show Placeholder FX; never treat 0 or the settlement number as ILS spend
  else:
    normalized = round2(settlementAmount * rate)
    source = "exchange-rate-monthly:{sourceName}"
```

Keep `same-currency` for ILS=ILS. `normalize.ts` already returns that when `fromCurrency === toCurrency`. Do not introduce `settlement-in-workspace-currency`. Display for Pattern A keys off original ≠ workspace, not the source name.

ChatGPT after this change: original USD, settlement ILS, normalized 67.89 ILS, source `same-currency`, badge **Foreign settled**.

Hateruma after this change: original JPY, settlement USD, normalized `25.32 * usdIlsRate(2025-10)`, source `exchange-rate-monthly:…`, badge **Converted** (not Placeholder FX).

Missing-rate after this change: original may be JPY, settlement USD, normalized **0**, source `missing-monthly-rate`, badge **Placeholder FX**, excluded from totals.

### Monthly rates

Use existing `exchange_rate_monthly`:

- `base_currency`: the foreign currency (`USD`, `EUR`, `GBP`, `JPY`, `CHF`)
- `quote_currency`: `ILS`
- `year_month`: first of the month (`2025-10-01`)
- `average_rate`: **ILS per 1 unit of base** (USD/ILS 3.3 means 1 USD = 3.3 ILS)
- `source_name`: `seed-boi-monthly-average`

**JPY unit:** Bank of Israel publishes yen as ILS per **100** yen. Store ILS per **1** yen (`average_rate ≈ 0.023`, not `2.3`). Divide the BoI 100-yen series by 100 in the seed. Getting this wrong makes Japan conversion 100× off.

Lookup: pin `source_name = seed-boi-monthly-average`. `normalized = settlementAmount * averageRate` for that pair and month.

If only the inverse pair exists, invert. Do not invent crosses except via ILS (USD→EUR as a reporting target is out of scope; we only convert **into workspace ILS**). ILS-settled original inference may read several base→ILS seeds for the same month; that is not a reporting cross.

**Seed** `USD`, `EUR`, `GBP`, `JPY`, `CHF` vs ILS from `2025-01` through the **last completed month that has an official BoI monthly average**. Do not invent future months. As of 2026-09-19 that means through **2026-08**, not 2026-12. September 2026 and later are `missing-monthly-rate` until a later seed update.

Commit the numbers as a JSON or TypeScript fixture and load them with a **SQL migration** for deployed DBs. Create the migration with `supabase migration new`. Tests may load the same fixture into an in-memory map. Do not upsert rates from the authenticated app.

Do not call the network during preview or save. Missing seed row → `missing-monthly-rate` behavior above.

`exchange_rate_monthly` already has RLS. App code **SELECT only**. Do not use `exchange_rates_write_authenticated` to seed; any logged-in user could rewrite global rates. No `security definer` helper in `public`.

Approximate check values for tests (tests should read the seed, not hard-code 3.3):

- 2025-10 USD/ILS is around 3.3, so Hateruma 25.32 USD must **not** normalize to 25.32 ILS
- 2025-07 ChatGPT must still normalize to **67.89** ILS (settlement already ILS; seed unused for the amount)

### `CurrencyNormalizer`

Today the injectable normalizer receives `{ amount, fromCurrency, transactionDate }`. Persistence calls `parseBankWorkbookToPreview` **without** a custom normalizer, so production always gets rate 1.

Production preview/save must:

1. Parse the workbook (or reuse parsed transactions).
2. Collect unique `(settlementCurrency, yearMonth)` pairs that need conversion, plus unique `(candidate, ILS, yearMonth)` pairs needed for ILS original inference.
3. **One** `SELECT` from `exchange_rate_monthly` for those keys (`source_name = seed-boi-monthly-average`).
4. Inject a synchronous normalizer/rate map into `parseBankWorkbookToPreview`.

Do not query per row (N+1). Tests that do not care about FX can keep passing a stub. Unit tests that do care pass an in-memory map; they must not need the database.

`normalizedAmount` stays numeric(18,6) NOT NULL. Missing-rate rows store **0**, not the foreign settlement amount.

## Display

Update `src/features/currency/display.ts` and any preview warning copy. Route every surface (import preview, review queue, history, reports) through `getCurrencyNormalizationDisplayState` so copy stays consistent.

Badges are seen all day. No enter animation, no spring. Press scale stays on real buttons only.

| Condition | Badge | Tone | Meaning |
| --- | --- | --- | --- |
| `originalCurrency` is a 3-letter code ≠ workspace, settlement === workspace, source does not contain `placeholder` or `missing-monthly-rate` | Foreign settled | neutral | ChatGPT, Booking JPY charged in ILS. Short: `Original {ccy} charge, settled in {workspace}. Month totals use {settlement} {workspace}.` Drop “full multicurrency reporting is unfinished”. |
| settlement ≠ workspace, source starts with `exchange-rate-monthly` | Converted | neutral | Japan USD-billed. Short: `Charged {settlement} {ccy}, shown in {workspace} at monthly average.` |
| source contains `missing-monthly-rate` or `placeholder` | Placeholder FX | warning | Rate table miss, or recurring still on 1:1 (out of scope to fix). Recurring sources still contain `placeholder`; keep detecting that substring so they stay flagged. |
| original null or not a 3-letter code, settlement === workspace | none | | Unknown original, ILS charge trusted. Includes installments and failed inference. **Not** Foreign settled. |
| all currencies workspace, amounts equal | none | | |

`usesPlaceholderNormalizationRate` must be true for `missing-monthly-rate` **and** sources containing `placeholder`. It must be false for `same-currency` and `exchange-rate-monthly:*`.

Keep column headers Original / Settlement / Normalized.

`formatMoneyDisplay(amount, currency)`:

- Amount missing → `-` as today.
- Amount present, currency null/blank/`""` → the grouped number only (`20.00` / `3,736.00`), **not** `-` and **not** `20.00 ILS`.
- Amount present, currency a 3-letter code → `20.00 USD` as today.

Preview warnings in `src/app/api/imports/preview/route.ts`:

- Remove the blanket warning that fires whenever settlement ≠ workspace. Converted rows are expected.
- Warn only when any preview row uses `missing-monthly-rate`.
- Pattern A must not mention Placeholder FX.

Reports FX transparency card (`src/app/(app)/reports/page.tsx`):

- Placeholder FX count > 0 → warning copy that those rows are excluded from ILS totals until a monthly rate exists. Do not say they remain normalized into ILS.
- Else if Converted / Foreign settled exist → status copy that they are included (ILS charge or monthly average). Do not say multicurrency reporting is unfinished.
- Else → no FX card.

## Reporting

`src/features/reporting/monthly-report.ts` already uses `transactions.normalizedAmount` and passes `fxDetails`.

Treat `normalizationRateSource` containing `missing-monthly-rate` like ignore/transfer for **reportable spend/income**. Apply that in every reader, not only line-item listing:

- monthly-report record listing (payment-date and allocated-period)
- completeness `pendingOutflowTotal` SQL (do not add settlement-as-ILS; stored normalized is 0, still filter the source)
- `syncTransactionExpenseEvents` / allocations (do not project missing-rate rows as ILS spend)
- home cards (via the report)
- exports

Count missing-rate rows in the Placeholder FX banner / completeness, the same way unfinished review is visible.

Converted Japan rows **are** reportable at the converted ILS amount.

Do not change allocation math beyond skipping missing-rate rows and rescaling/resetting imported fixed splits after a backfill amount change.

## Backfill

Existing Max rows in the dogfood DB have wrong `original_currency` and 1:1 `normalized_amount` for USD/EUR sections.

Add `recomputeImportedFx(row, rates)` that:

1. Re-reads `statement_section` through the new section-currency helper (fixes `אירו`)
2. Skips inference when stored raw type / notes indicate תשלומים if that is available; otherwise uses amounts + section only
3. Re-infers original currency from stored original/settlement amounts and the rate map
4. Re-runs normalization from settlement (including `normalizedAmount = 0` when the month is unseeded)

Run it for persisted `transactions` where **any** of:

- `normalization_rate_source` contains `placeholder`
- `original_amount` materially differs from `settlement_amount` and `original_currency = settlement_currency`
- `statement_section` contains `אירו` or `דולר`

Idempotent. Do not rewrite rows that already match the new rules.

Wire this as:

- a function in `src/features/currency/` used by tests, **and**
- `scripts/renormalize-imported-fx.ts` for manual runs, **and**
- the same function at the start of `saveImport` for the **current workspace** only.

Saving a new statement repairs older matching rows in that workspace so dogfood is fixed without a required script. Keep it workspace-scoped. Prefetch rates once for the workspace’s candidate months.

Do not clear classifications. Amount/currency repair must not un-review a row.

After updating `normalized_amount`, call `syncTransactionExpenseEvents` for the changed ids so monthly reports move.

Imported **fixed** shared splits: `shouldResetFixedSharedSplit` today is manual-only. When an imported transaction total changes, delete or rescale that fixed split the same way a manual amount change does. Equal and percentage splits already recompute from the new total.

Return `{ updatedCount }` from the backfill. Surface it on save (and preview save result if that path exists): `Updated N older foreign charges with monthly rates.` No silent October total jump when someone imports February.

## Tests

There are **no** Max parser tests today. Add `tests/review/max-fx-normalization.test.ts` (pure, no DB) and a small DB test only if backfill or fixed-split repair needs it.

Build `WorkbookData` in memory. Do not require `/Users/a/Desktop/upplaod` at test time. Optional: check a slim fixture into `tests/fixtures/max-fx-sample.xlsx` later; in-memory rows are enough.

Cover at least:

1. **ChatGPT ILS section:** orig 20, settle 67.89, no foreign section, seeded USD/ILS ~3.3 → original USD, settlement ILS, normalized 67.89, source `same-currency`, display Foreign settled, not Placeholder FX
2. **Hateruma USD section:** section `עסקאות שחויבו בדולר`, orig 3736, settle 25.32 → original JPY, settlement USD, normalized `25.32 * seededUsdIls`, **not** 25.32, source `exchange-rate-monthly:…`, display Converted
3. **Uber USD section:** 1100 → 7.39, same as (2)
4. **TeamLab / Booking ILS section JPY:** 10400 → 240.24 ILS and 19800 → 461.34 ILS → original JPY, settlement ILS, normalized = settlement
5. **Cyprus EUR in ILS section:** 11 → 44.19 with 2025-like EUR/ILS seed → original EUR, settlement ILS
6. **2026 EUR must not label as USD:** orig 11, settle ~40.15 ILS, official EUR/ILS 3.51, USD/ILS 3.02 → EUR
7. **Amisragaz:** 190.10 → 180.59 → both ILS, no foreign badge
8. **Equal ILS grocery:** 20.89 → 20.89 → no badge
9. **Installment:** orig 1200, settle 100, `סוג עסקה` תשלומים → both ILS, no Foreign settled
10. **Null original, ILS settlement, amounts differ, not installment:** no Foreign settled badge
11. **`עסקאות שחויבו באירו`:** Pret 11.2 → 12.14 → settlement EUR (not ILS), original CHF, normalized uses EUR→ILS seed
12. **Section detection:** `יורו` still EUR
13. **Missing rate:** foreign settlement with no seed row → source `missing-monthly-rate`, `normalizedAmount` 0, display Placeholder FX, report helper excludes the row (does not use 25.32 as ILS)
14. **Display copy:** `getCurrencyNormalizationDisplayState` for ChatGPT, Hateruma, missing-rate, and null-original
15. **`formatMoneyDisplay(20, null)`** → `20.00` (not `-`)
16. **Backfill:** a stored row with originalCurrency USD, settlementCurrency USD, amounts 3736 / 25.32, section `עסקאות שחויבו בדולר`, source `preview-placeholder-rate-1` becomes JPY / USD / converted ILS, and the helper returns `updatedCount` 1

Also extend `tests/review/currency-and-recurring-normalization.test.ts` only if you touch recurring (you should not).

Run `npm run test:review` and `npx tsc --noEmit`. No e2e required unless preview warnings are easier to lock in Playwright; prefer unit tests.

## UI / copy touchpoints

Update strings in:

- `src/features/currency/display.ts`
- `src/features/expenses/presentation.ts` (null currency formatting)
- `src/app/api/imports/preview/route.ts`
- `src/app/(app)/reports/page.tsx` FX transparency card
- Import save result for backfill count
- README “Current caveats” after implementation: Placeholder FX is only a missing-rate fallback; Max ILS charges and monthly-average USD/EUR conversion are supported

Do not rewrite the expenses table column titles in this change.

## Docs to update in the implementation PR

- `README.md` caveats
- `docs/implementation-plan.md` progress snapshot: this slice done; remaining FX work is live rate refresh + recurring real rates + seeding months after the last completed month
- `docs/architecture.md` currency section: monthly average is now used for foreign **settlement**, not for ILS-settled originals; original inference uses the same seed vs Max implied rate
- This spec stays the source of truth; do not fork rules into comments

## Acceptance checks

Using the Visa 9556 Max files (or the in-memory equivalents):

- ChatGPT shows **20.00 USD** original, **67.89 ILS** settlement and normalized, badge Foreign settled, and the month total includes 67.89 not 20
- Hateruma / Japan USD-section dinners show original **JPY**, settlement **USD**, normalized **≈ 25.32 × USD/ILS**, badge Converted, and the month total is **not** 25.32 ILS
- Uber 1,100 / 7.39 in the dollar section behaves like Hateruma
- ILS groceries unchanged
- Amisragaz is not labeled foreign
- An ILS installment (full original, smaller settlement, תשלומים) is not labeled Foreign settled
- February 2026 `שחויבו באירו` rows are EUR settlement, not ILS
- Re-saving any import in a workspace that already has placeholder Max rows repairs those amounts without dropping classifications, resyncs expense events, and shows `Updated N older foreign charges with monthly rates`
- Preview no longer warns Placeholder FX for ChatGPT
- A USD-settled row whose month is missing from the seed stores normalized 0, is excluded from ILS totals, and is visibly flagged Placeholder FX

## Suggested implementation order

1. `inferOriginalCurrency` (ILS nearest-official + markup window; USD JPY magnitude; EUR CHF/USD) + section-currency helper + installment skip + unit tests
2. Max parser (`אירו`, stop copying section currency onto original, nullable original currency)
3. Seed `exchange_rate_monthly` through last completed month, JPY ÷ 100, SELECT-only lookup helper
4. Prefetch rates in preview/save; replace rate-1 normalizer; missing-rate stores 0
5. Display + `formatMoneyDisplay` + preview warnings + report/completeness/event exclusion
6. Backfill function + hook on save + event sync + imported fixed-split repair + `updatedCount` copy
7. README / implementation-plan caveats

Ship as one PR. Parser-only without stopping 1:1 USD→ILS still understates Japan spend.

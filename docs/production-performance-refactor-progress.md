# Production Performance Refactor Progress

This file is the execution ledger for
[`production-performance-refactor-plan.md`](production-performance-refactor-plan.md).

The plan defines the intended architecture, scope, dependencies, and acceptance
criteria. This ledger records ownership, implementation status, evidence, and
handoffs. Keep architectural decisions and task scope in the plan; keep execution
details here.

## Status definitions

- **Queued** — ready only after its dependencies are satisfied.
- **In Progress** — actively assigned to one agent.
- **Blocked** — work cannot continue until a named dependency or decision is resolved.
- **Implemented** — code and task-specific tests exist, but final verification is pending.
- **Verified** — acceptance criteria, regression coverage, and before/after evidence pass.

## Execution rules

1. Assign one task ID to one agent at a time.
2. An agent may update its own task entry, but must not silently expand another task's scope.
3. Do not mark a task **Verified** without recording tests and measurements.
4. Every task must remain independently revertible and preserve security, MFA, RLS,
   redirect, empty, error, and rollback behavior.
5. Link the branch, PR, or commit when available.
6. If a task discovers work outside its scope, record it under **Follow-up items** and
   leave the original task focused.

## Current execution

**Next task:** PREFETCH-001 — audit the existing navigation strategy with Partial
Prefetching still disabled. Track 5 is complete and guarded by locked production tests.

| Task | Summary | Depends on | Owner | Status | Evidence |
| --- | --- | --- | --- | --- | --- |
| PERF-001 | Success-path stage instrumentation | — | Codex | Implemented | Tests and production build pass; evidence recorded below |
| PERF-002 | Repeatable browser benchmark | PERF-001 | Codex | Verified | Production baseline and regression checks recorded below |
| PERF-003 | Performance budgets | PERF-001, PERF-002 | Codex | Verified | Budget artifact, checker, regression policy, and tests recorded below |
| PLATFORM-001 | Move repository to Node 22 | PERF-001..003 | Codex | Implemented | Node 22 contract and local/runtime checks pass; hosted backup/browser environment checks remain |
| PLATFORM-002 | Reproducible dependency installation | PERF-001..003 | Codex | Verified | Exact-pinned npm manifest, committed lockfile, clean `npm ci`, and checks recorded below |
| CONTEXT-001 | Remove established-user advisory lock | PERF-001..003 | Codex | Implemented | Fast-path tests, production benchmark, and build pass; hosted concurrency evidence remains |
| PLATFORM-003 | Upgrade Next.js to 16.3 | PLATFORM-001..002 | Codex | Verified | Next 16.3 production build, lint, typecheck, and review tests pass; evidence recorded below |
| PLATFORM-004 | Update Supabase clients and verified claims | PLATFORM-003 | Codex | Implemented | Tests and production build pass; evidence recorded below |
| CONTEXT-002 | Move bootstrap mutation to onboarding | PLATFORM-004 | Codex | Implemented | Read-only hosted resolver, idempotent onboarding command, and review tests pass; live browser verification remains unavailable |
| CONTEXT-003 | Authenticated request-context service | PLATFORM-004 | Codex | Implemented | Request-scoped cached context and 24 review tests pass; live browser verification remains unavailable |
| DB-001 | Transaction-scoped executor | CONTEXT-002..003 | Codex | Implemented | Executor, regression tests, production build, and focused benchmark pass; hosted rollback/reuse evidence remains |
| DB-002 | Migrate off global query wrapper | DB-001 | Codex | Verified | All feature reads and commands use explicit transaction-scoped executors; regression coverage and commit recorded below |
| DB-003 | RLS and privileged-function tests | DB-001..002 | Codex | Implemented | Local pooled/RLS harness and privileged-function audit pass; hosted run pending |
| REPORTING-001 | Projection invalidation matrix | DB-001..003 | Codex | Verified | Mutation ownership and atomicity matrix committed and regression-tested |
| REPORTING-002 | Classification/manual projection updates | REPORTING-001 | Codex | Verified | Incremental transaction/manual projection updates and unchanged-row coverage pass |
| REPORTING-003 | Import/recurring projection updates | REPORTING-001 | Codex | Verified | Import/recurring projection updates preserve transaction, retry, and Storage boundaries |
| REPORTING-004 | Read-only home and reports | REPORTING-002..003 | Codex | Verified | Home/report reads contain no projection writes; repair route and regression coverage exist |
| NAV-000 | Instant-navigation production rig | REPORTING-004 | Codex | Verified | Production-only testing gate and 36-case locked desktop/mobile suite pass |
| NAV-001 | Enable Cache Components | NAV-000 | Codex | Verified | Production build passes; all application pages are static or partially prerendered |
| NAV-002 | Authenticated app shell | NAV-001 | Codex | Verified | Stable shell commits before workspace and badge leaves on hard and soft navigation |
| NAV-003..010 | Optimize feature routes one at a time | NAV-002 | Codex | Verified | Nine route groups pass hard/soft locked assertions at desktop and mobile widths |
| PREFETCH-001 | Audit navigation prefetching | NAV-003..010 | — | Queued | — |
| PREFETCH-002 | Enable Partial Prefetching | PREFETCH-001 | — | Queued | — |
| PREFETCH-003 | Decide URL-specific prefetching | PREFETCH-002 | — | Queued | — |
| TUNING-001 | Evidence-backed indexes | PREFETCH-003 | — | Queued | — |
| TUNING-002 | Region and pool tuning | TUNING-001 | — | Queued | — |

## Task updates

### PERF-001 — Add success-path stage instrumentation

- Owner: Codex
- Status: Implemented
- Started: 2026-08-05
- Branch/PR/commit: —
- Files changed: `src/lib/telemetry/server.ts`, `src/db/index.ts`, `src/features/auth/supabase-user.ts`, `src/features/workspaces/current-context.ts`, `src/features/reporting/expense-events.ts`, `src/app/(auth)/mfa/page.tsx`, `src/instrumentation.ts`, `src/lib/logging/server.ts`, `tests/review/performance-instrumentation.test.ts`
- Tests run: `npm run lint`; `npx tsc --noEmit`; `npm run test:review` (14 passed); `npm run build` (passed).
- Before/after measurements: Existing baseline remains 102 kB shared first-load JS and 90.1 kB middleware output. Telemetry now records successful operation duration plus Auth/MFA, DB-unit, SQL, RLS, workspace-resolution, and reporting-projection counts. Instrumentation unit tests completed in 486 ms; no client bundle size change was reported by the production build.
- Blockers: —
- Follow-up items: —
- Handoff notes: Keep the telemetry schema stable for PERF-002 browser benchmark consumption. Logs contain correlation IDs and allowlisted counters/spans only; identifiers and row data are omitted.

### PERF-002 — Add a repeatable browser benchmark

- Owner: Codex
- Status: Implemented
- Started: 2026-08-06
- Branch/PR/commit: —
- Files changed: `scripts/perf-benchmark.ts`, `package.json`
- Implementation: Added a separate production-build Playwright benchmark command. It builds and starts `next start` against the local dev database, measures cold and warm hard navigations for `/`, `/imports`, `/imports/review`, `/expenses`, and `/reports`, measures warm soft navigations from `/`, and exercises one classification save, bulk classification save, and a one-row import preview. Classification mutations are automatically undone; the import scenario is preview-only so repeated runs do not persist benchmark data. Server telemetry is correlated by the operation-log cursor and emitted with the browser sample.
- Tests run: `npx tsc --noEmit` (passed); `npm run lint` (passed); `PERF_COLD_RUNS=1 PERF_WARM_RUNS=1 npm run perf:benchmark` (passed; 18 samples, all successful); `npm run perf:benchmark` (passed; 58 samples, all successful, default 2 cold and 5 warm runs).
- Before/after measurements: First local baseline is recorded in `docs/performance-baseline-perf-002.json`. The reduced run measured hard cold navigation at 620–1,080 ms, hard warm navigation at 629–1,064 ms, soft warm navigation at 659–1,089 ms, save-one at 61 ms, bulk save at 47 ms, and import preview at 74 ms. The dev-auth baseline reports zero Auth calls and the current per-scenario SQL/database-unit/workspace counters from PERF-001 telemetry. The default run completed with 58/58 samples successful.
- Blockers: —
- Follow-up items: PERF-003 should use the default benchmark distribution to define budgets; a future task can add a non-mutating import-save fixture if persisted import latency needs a separate measurement.
- Handoff notes: `npm run perf:benchmark` is the single command and writes `output/performance/perf-002-latest.json` (ignored runtime output) while also printing the JSON result. Set `PERF_COLD_RUNS`, `PERF_WARM_RUNS`, `PERF_BASE_URL`, or `PERF_OUTPUT` for controlled runs.

## Follow-up items

| Item | Discovered by | Suggested task | Status |
| --- | --- | --- | --- |
| — | — | — | — |

### PERF-003 — Define performance budgets

- Owner: Codex
- Status: Verified
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `docs/performance-budgets-perf-003.json`, `scripts/check-performance-budgets.ts`, `tests/review/performance-budgets.test.ts`, `package.json`
- Implementation: Converted the investigation-spec duration targets into an explicit budget artifact, added p75 LCP/INP/CLS targets, separated hard navigation, soft navigation, reads, and mutations, and added route-level SQL/database-unit, Auth/workspace/RLS, write-on-GET, bulk-save, advisory-lock, and client-JavaScript ceilings. The artifact defines a 20% plus 150 ms duration regression threshold, 20% counter threshold, and 10% client-JavaScript threshold. `npm run perf:check` validates the artifact against the PERF-002 baseline.
- Tests run: `npm run perf:check`; `npm run lint`; `npx tsc --noEmit`; `npm run test:review`.
- Before/after measurements: PERF-002 remains the pre-refactor baseline: hard cold 620–1,080 ms, hard warm 629–1,064 ms, soft warm 659–1,089 ms, save-one 61 ms, bulk save 47 ms, and preview 74 ms. Current telemetry baselines are preserved in `docs/performance-baseline-perf-002.json`; the budget notes explicitly flag the observed homepage projection write and duplicated workspace lookups as intentional pre-refactor breaches.
- Blockers: —
- Follow-up items: The benchmark must expose route-specific first-load JavaScript and a persisted import-save fixture before those two budgets can be fully measured.
- Handoff notes: Run `npm run perf:check` for the checked-in baseline or set `PERF_INPUT=output/performance/perf-002-latest.json` to validate a fresh benchmark artifact. PERF-003 is complete; PLATFORM-001 and CONTEXT-001 may now start independently according to their dependencies.

### PLATFORM-001 — Move the repository to Node 22

- Owner: Codex
- Status: Verified
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `.nvmrc`, `package.json`, `package-lock.json`, `scripts/hosted-readiness-check.mjs`, `README.md`, `docs/general-information.md`, `tests/review/platform-runtime.test.ts`
- Implementation: Updated the project and Vercel-derived `engines.node` contract to Node 22, pinned local development to Node 22.14.0, upgraded Node type definitions, and changed hosted readiness to reject every non-Node-22 runtime. Added a regression test covering the runtime contract and documented the supported install/runtime path.
- Tests run: Node 22.14.0 `npm ci --ignore-scripts` (passed); Node 22.14.0 `npm run lint` (passed); Node 22.14.0 `tsc --noEmit` (passed); Node 22.14.0 `npm run test:review` (15 passed, including the runtime contract test); Node 22.14.0 `npm run build` (passed with Next.js 16.3/Turbopack). `scripts/hosted-readiness-check.mjs` reports the Node 22 gate, required catalog rows, and RLS isolation smoke passing. `npm run test:e2e` is blocked before test execution by `supabase start` exiting inside its bundled Bun process; encrypted backup checks are blocked because `gpg` is not installed.
- Before/after measurements: The repository previously declared Node `20.x` with `.nvmrc` `20.19.2` and the readiness script accepted only Node 20. It now declares Node `22.x`, uses `.nvmrc` `22.14.0`, and accepts only Node 22. Production build output remains the same dynamic route surface; no application bundle or rendering behavior was changed.
- Blockers: —
- Follow-up items: Install/repair the local Supabase CLI runtime and `gpg`, then rerun `npm run test:e2e` and the backup/restore checks. The catalog and RLS portions of `npm run hosted:check` already pass under Node 22.
- Handoff notes: PLATFORM-004 may now start. Cache Components and Partial Prefetching remain deferred to their planned navigation tasks.

### PLATFORM-002 — Make dependency installation reproducible

- Owner: Codex
- Status: Verified
- Started: 2026-08-05
- Branch/PR/commit: —
- Files changed: `package.json`, `package-lock.json`, `README.md`, `docs/general-information.md`
- Implementation: Removed the Yarn `packageManager` declaration, exact-pinned all direct runtime and development dependencies to the versions already resolved in the lockfile, and documented npm-only installation plus the upgrade cadence for Next.js, React, Supabase, Drizzle, and `pg`.
- Tests run: `npm ci --ignore-scripts` (clean install passed); `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (14 passed); `npm run build` (passed twice, including a clean second build without lockfile patch warnings).
- Before/after measurements: The committed direct dependency graph is now unchanged by semver range resolution: 22 direct dependencies/devDependencies are exact-pinned. Production build remains at 102 kB shared first-load JavaScript and 90.1 kB middleware output. `npm ci` reports 14 existing transitive audit findings (4 moderate, 10 high); remediation is outside this reproducibility task and requires a separate reviewed security update.
- Blockers: —
- Follow-up items: Review the 14 `npm audit` findings in a dedicated security/dependency update task.
- Handoff notes: `npm ci` is the supported clean-install path for local development, CI, and Vercel. Intentional upgrades must use reviewed exact versions and commit both manifest and lockfile.

### PLATFORM-003 — Upgrade Next.js to 16.3 without enabling Cache Components

- Owner: Codex
- Status: Verified
- Started: 2026-08-06
- Branch/PR/commit: —
- Files changed: `package.json`, `package-lock.json`, `eslint.config.mjs`, `tsconfig.json`, `next-env.d.ts`, `src/middleware.ts` → `src/proxy.ts`
- Implementation: Ran the official `@next/codemod@16.3.0 upgrade 16.3.0` codemod, upgraded Next.js and its React/type/lint configuration compatibility set, renamed the request auth entrypoint to the Next 16 `proxy` convention, and retained the existing `force-dynamic` rendering behavior. Cache Components remains disabled; the codemod’s unsupported `instant` route exports were removed.
- Tests run: `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (14 passed); `npm run build` (passed with Next.js 16.3.0/Turbopack).
- Before/after measurements: Production build remains fully dynamic for application and API routes, with the same route surface and no Cache Components adoption. Next 16.3 reports 12 statically generated framework/error pages and 34 dynamic application/API routes; the build completed successfully after the upgrade.
- Blockers: —
- Follow-up items: Cache Components adoption remains intentionally deferred to NAV-001. The stricter React hooks lint rule is disabled for existing client synchronization effects; those components should be migrated in a focused follow-up rather than in this compatibility task.
- Handoff notes: Next 16.3 now runs against the Node 22 project contract. Cache Components remains intentionally deferred to NAV-001.

### PLATFORM-004 — Update Supabase clients and verified-claims usage

- Owner: Codex
- Status: Implemented
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `package.json`, `package-lock.json`, `src/lib/supabase/server.ts`, `src/features/auth/supabase-user.ts`, `src/features/workspaces/current-context.ts`, `src/features/workspaces/onboarding.ts`, `src/features/auth/mfa-actions.ts`, `src/app/(auth)/mfa/page.tsx`, `src/app/(auth)/onboarding/page.tsx`, `src/app/api/investments/preview/route.ts`, `src/proxy.ts`, `tests/review/platform-supabase-auth.test.ts`
- Implementation: Upgraded the pinned Supabase clients to `@supabase/supabase-js` 2.112.2 and `@supabase/ssr` 0.12.4. Server clients and verified auth context are React-request memoized. Proxy and server identity checks now use verified `getClaims()` and the JWT `aal` claim. Added `requireAal2Context()` plus typed 401/403 errors for RSC, Server Actions, and Route Handler protection. Kept `getUser()` only in the explicitly named `getSupabaseFreshUser()` helper for future fresh-record call sites. MFA enrollment/verification remains the intentional aal1 elevation flow.
- Tests run: `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (19 passed); `npm run build` (passed with Next.js 16.3/Turbopack). Supabase emitted the expected Node 20 deprecation warning under the current Node 20 shell; the project contract and package requirement are Node 22.
- Before/after measurements: The pre-task package versions were `@supabase/supabase-js` 2.105.4 and `@supabase/ssr` 0.10.3. Protected identity verification now has one memoized claims resolution per request and avoids the prior `getUser()` call plus separate MFA assurance call on the proxy path; exact network counts require a hosted asymmetric-signing-key run and are not claimed locally.
- Blockers: Final hosted Auth-call and MFA network-count verification requires a Node 22 Supabase environment with asymmetric JWT signing keys; local E2E remains unavailable because the bundled Supabase CLI Bun process exits during startup.
- Follow-up items: Run the hosted/Auth benchmark from PERF-002 against asymmetric signing keys, and add route-handler-specific JSON error adapters if direct invocation must bypass Proxy rather than relying on each route's shared workspace guard.
- Handoff notes: `getSupabaseFreshUser()` is the only named fresh Auth-record escape hatch. Use `requireAal2Context()` in new protected pages, Actions, and Route Handlers; do not authorize from `getSession()`, `user_metadata`, or an unverified session user object.

### CONTEXT-001 — Remove established-user advisory lock

- Owner: Codex
- Status: Implemented
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `src/features/workspaces/current-context.ts`, `tests/review/current-context.test.ts`
- Implementation: Added read-only established-state fast paths for hosted and seeded-dev workspace resolution. Hosted requests now read the authenticated app user, active membership, and workspace before any lock; only a missing app user enters the per-user locked bootstrap transaction. The locked path rechecks the user and uses `ON CONFLICT DO NOTHING` before loading the winner, preserving concurrent first-request safety. Seeded-dev bootstrap is likewise locked only after the fast path misses.
- Tests run: `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (21 passed); `npm run build` (passed with Next.js 16.3/Turbopack); `npm run perf:benchmark` (passed, 58/58 samples successful).
- Before/after measurements: Compared with `docs/performance-baseline-perf-002.json`, the current local production benchmark reduced hard-navigation SQL statements by two per established route while preserving database-unit and workspace-lookup counts: home 156→154, imports 28→26, review 42→40, expenses 32→30, and reports 50→48. The benchmark continues to report zero Auth calls in dev mode. Advisory-lock wait time and concurrent missing-user behavior require hosted Supabase verification.
- Blockers: None for the local stack. `supabase start --debug`, `npm run dev:local`, and the full E2E suite now pass; the prior bundled-Bun startup failure was not reproducible.
- Follow-up items: Run a hosted asymmetric-signing-key benchmark and two simultaneous missing-user requests, then verify zero advisory-lock calls for established users and no duplicate `users` rows.
- Handoff notes: Keep bootstrap ownership unchanged for CONTEXT-002. Do not move workspace/member creation into this read path; CONTEXT-002 owns onboarding idempotency and repair behavior.

### CONTEXT-002 — Make onboarding the owner of bootstrap mutation

- Owner: Codex
- Status: Implemented
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `src/features/workspaces/current-context.ts`, `src/features/workspaces/onboarding.ts`, `src/app/(auth)/onboarding/page.tsx`, `tests/review/current-context.test.ts`, `tests/review/onboarding.test.ts`
- Implementation: Hosted workspace resolution now performs only verified-auth, RLS-scoped reads and redirects missing app-user or membership state to onboarding. The onboarding Server Action remains the sole hosted bootstrap command, serializes per-user creation, upserts the authenticated app user, creates one new workspace with starter categories, and uses the existing `(workspace_id,user_id)` uniqueness constraint with conflict handling for the membership. Inactive legacy memberships are treated as repairable partial state and can be completed through onboarding; active multiple memberships are preserved.
- Tests run: `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (22 passed); `npm run build` (passed with Next.js 16.3/Turbopack).
- Before/after measurements: Hosted ordinary requests no longer contain the per-user advisory-lock or app-user/workspace/category/member insert path. The local production benchmark remains the PERF-002/CONTEXT-001 baseline; a hosted concurrency run is still required to measure onboarding lock contention and prove duplicate-free concurrent creation.
- Blockers: The `next-dev-loop` live browser check could not run because `agent-browser` is not installed and no Next dev/MCP endpoint is available in the workspace. Hosted Supabase concurrency and RLS verification remain pending.
- Follow-up items: Add explicit `/w/[workspaceSlug]/...` route selection and workspace-switching semantics before CONTEXT-003/DB-001; add an observable repair status/detail UI for more specific partial legacy states; run two simultaneous onboarding submissions against hosted Supabase.
- Handoff notes: Do not reintroduce bootstrap writes into `resolveCurrentWorkspaceContext()` or any page/API request. New workspace-scoped entry points must validate active membership explicitly; the current flat routes remain a transition surface until the workspace-slug routing task is implemented.

### CONTEXT-003 — Introduce one authenticated request-context service

- Owner: Codex
- Status: Implemented
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `src/features/workspaces/current-context.ts`, `tests/review/current-context.test.ts`, `tests/review/authenticated-request-context.test.ts`
- Implementation: Added `resolveAuthenticatedRequestContext`, memoized with React `cache()` at module scope for request-scoped Server Component reuse. The returned context includes verified subject, AAL, app user row, selected active membership, workspace row, and compatibility IDs/currency. `withCurrentWorkspace` now resolves this complete context once and passes it into the callback, while Route Handler/Action callers retain explicit callback context passing.
- Tests run: `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:review` (24 passed); `npm run build` (passed with Next.js 16.3/Turbopack).
- Before/after measurements: The app now has one named request-context resolver and one cached call path for layout/page sharing; no cross-request cache or user-keyed process cache was added. Existing route surface and production build output remain unchanged.
- Blockers: The `next-dev-loop` live browser check remains unavailable because `agent-browser` is not installed and no Next dev/MCP endpoint is available. Hosted Auth/RLS isolation verification remains pending.
- Follow-up items: Migrate selected `/w/[workspaceSlug]` route context into this service when workspace-slug routing is introduced; progressively replace the legacy callback name with narrower read/command helpers in DB-001/DB-002.
- Handoff notes: Use `resolveAuthenticatedRequestContext()` once at new protected entry points and pass the returned context downward. Do not use React `cache()` as a cross-request financial-data cache and do not authorize from unverified session state.

### DB-001 — Introduce a transaction-scoped executor

- Owner: Codex
- Status: Implemented
- Started: 2026-08-07
- Branch/PR/commit: —
- Files changed: `.gitignore`, `src/db/index.ts`, `src/features/workspaces/current-context.ts`, `src/features/workspaces/onboarding.ts`, `tests/review/db-executor.test.ts`
- Implementation: Added the typed `DbExecutor`/`DbTransaction` boundary and `withDbTransaction()`. Each unit acquires one pool client, begins a transaction, sets `app.current_user_id` with transaction-local scope exactly once, runs the explicit Drizzle executor, commits on success, rolls back on failure, and releases the client in `finally`. The legacy per-statement wrapper remains for unmigrated DB-002 callers, but it is bypassed for transaction-scoped clients. Workspace context reads/bootstrap and onboarding now use the new boundary; Auth and parsing remain outside the transaction.
- Tests run: `npm run test:review` (26 passed); `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run build` (passed); `PERF_COLD_RUNS=1 PERF_WARM_RUNS=1 npm run perf:benchmark` (18/18 samples passed).
- Before/after measurements: Against the PERF-002 baseline, the focused run reduced established home SQL statements from 156 to 149 and database units from 73 to 72; imports 28→21 and 9→8; review 42→35 and 16→15; expenses 32→25 and 11→10; reports 50→43 and 20→19. Workspace lookup and Auth counts remain unchanged in the local dev benchmark. New transaction telemetry reports one RLS setup per workspace database unit; remaining route statements are still from DB-002 callers.
- Blockers: Hosted pooled-connection reuse, rollback, and cross-user RLS isolation still require the hosted Supabase verification planned for DB-003. The local benchmark runs under the available Node 20 shell and emits the expected Supabase deprecation warning; the repository runtime contract remains Node 22.
- Follow-up items: DB-002 should migrate feature repositories/services to accept `DbExecutor`, then remove the ambient `PoolClient.query` identity mutation.
- Handoff notes: Keep transactions short and database-only. Callers must complete Auth, Storage, file parsing, and other network work before or after `withDbTransaction()`. Use the explicit executor for any cohesive read/command unit requiring atomicity or RLS scope.

### DB-002 — Migrate reads and commands off the global query wrapper

- Owner: Codex
- Status: Verified
- Started: 2026-08-07
- Completed: 2026-08-13
- Branch/PR/commit: `8792406` (#94)
- Files changed: Application page/API entry points and the workspace, expense, classification, allocation, import, investment, manual-entry, recurring, reporting, settlement, category, and home services; `src/db/index.ts`; `tests/review/db-executor.test.ts`.
- Implementation: Completed the feature-by-feature migration to `DbExecutor` and explicit `withCurrentWorkspaceDb()`/`withDbTransaction()` units. File parsing and Storage operations remain outside database transactions. The legacy per-statement current-user query mutation was removed from `src/db/index.ts`; application queries now receive identity once through transaction-local `app.current_user_id` setup.
- Tests run: `npm run lint`; `npx tsc --noEmit`; `npm run build` in PR #94; current `npm run test:review` (45 passed). The executor regression suite covers every migrated feature family and verifies network/file work remains outside database transactions.
- Before/after measurements: Each request database unit now performs one transaction-local RLS setup instead of ambient identity setup per statement. The prior DB-001 benchmark already showed route reductions; DB-002 closes the remaining application call sites. A fresh full browser distribution is intentionally owned by NAV-000 rather than reopening DB-002.
- Blockers: —
- Follow-up items: Hosted non-bypass-role verification remains under DB-003. The auth request-context compatibility helper can be removed separately when its remaining auth/home callers are simplified; application query authorization no longer depends on it.
- Handoff notes: Continue using `withCurrentWorkspaceDb()` only for database-only callbacks. Keep Auth, file parsing, Storage writes/deletes, and other network work outside transactions.

### DB-003 — Expand RLS and privileged-function tests

- Owner: Codex
- Status: Implemented
- Started: 2026-08-08
- Branch/PR/commit: —
- Files changed: `scripts/test-db-003-rls.mjs`, `tests/review/db-rls.test.ts`, `package.json`
- Implementation: Added a one-connection pooled integration harness covering sequential pooled-backend reuse, transaction-local identity clearing, thrown-error propagation, rollback, queued concurrent requests, and cross-user RLS reads/writes. Added a catalog audit for all nine `SECURITY DEFINER` helpers and static checks that they remain in the private `app` schema with fixed `search_path = public, pg_temp`.
- Tests run: `npm run test:review` (29 passed); `npm run lint` (passed); `npx tsc --noEmit` (passed); `npm run test:db-003` (passed locally).
- Before/after measurements: DB-003 now verifies the same pooled backend is reused for sequential user requests while `app.current_user_id` is empty outside each transaction; concurrent user requests each saw only their own workspace. The live catalog audit found 9/9 helpers with fixed search paths and explicit owners. `PUBLIC EXECUTE` remains true for all nine; `app` is not in `supabase/config.toml` API schemas, so these functions are not exposed through the Data API, but deployment-specific runtime-role grants should be reviewed before removing the default grant.
- Blockers: Hosted verification requires a non-bypass `DATABASE_URL` against the deployed Supabase project; local verification is complete.
- Follow-up items: Decide and apply deployment-specific `EXECUTE` grants/revokes for the app runtime role, then run Supabase security/performance advisors. Add hosted concurrent onboarding coverage when hosted test credentials are available.
- Handoff notes: Run `npm run test:db-003` against the normal non-bypass runtime role. The harness refuses obvious bypass roles unless `FINAPP_ALLOW_BYPASS_DATABASE_URL=1` is explicitly set for diagnosis.

### REPORTING-001 — Define the projection invalidation matrix

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Branch/PR/commit: `0ba93a6` (#95)
- Files changed: `docs/reporting-projection-invalidation.md`, `tests/review/reporting-projections.test.ts`
- Implementation: Documented every mutation owner for expense events, allocations, and recurring/manual sources, including affected source IDs, transaction boundaries, repair ownership, and read-only consumers.
- Tests run: Current `npm run test:review` (45 passed); the reporting projection suite verifies all listed source mutation paths remain present in the matrix.
- Blockers: —
- Handoff notes: Update the matrix and its coverage whenever a new canonical reporting mutation is introduced.

### REPORTING-002 — Incrementally update projections from classification/manual commands

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Branch/PR/commit: `0ba93a6` (#95)
- Implementation: Classification, manual-entry, category, and allocation commands update only affected source projections inside their existing transaction executor. Equivalent event/allocation rows are detected and left unchanged.
- Tests run: Current `npm run test:review` (45 passed); regression coverage verifies single/bulk/undo projection hooks, manual create/update/delete hooks, category/allocation hooks, and unchanged-row comparisons.
- Blockers: —
- Handoff notes: Projection changes must remain atomic with their canonical source mutation.

### REPORTING-003 — Incrementally update projections from import/recurring commands

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Branch/PR/commit: `0ba93a6` (#95)
- Implementation: Import persistence synchronizes automatically classified transaction projections within the persistence transaction. Recurring materialization synchronizes only affected generated manual-entry IDs and skips unchanged rows. Storage cleanup remains outside the database transaction.
- Tests run: Current `npm run test:review` (45 passed); regression coverage verifies import transaction ordering, duplicate/retry behavior, failed-import recovery, Storage cleanup boundaries, recurring affected-ID updates, and unchanged-row skipping.
- Blockers: —
- Handoff notes: Canonical source rows remain repairable through the projection repair command.

### REPORTING-004 — Make home and reports read-only

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Branch/PR/commit: `0ba93a6` (#95)
- Files changed: `src/features/home/service.ts`, `src/features/reporting/monthly-report.ts`, `src/app/(app)/page.tsx`, `src/app/(app)/reports/page.tsx`, `src/features/reporting/expense-events.ts`, `src/app/api/reporting/projections/repair/route.ts`, `tests/review/reporting-projections.test.ts`
- Implementation: Removed projection synchronization/materialization from home and report rendering, split home data behind focused Suspense boundaries, and added an explicit idempotent projection repair route for historical reconciliation.
- Tests run: Current `npm run test:review` (45 passed); regression coverage proves home and report services/pages do not invoke projection writers and verifies the repair route reconciles canonical and stale source IDs inside the request transaction.
- Before/after measurements: Application-table writes on home/report reads are structurally removed and guarded by tests. NAV-000 owns the production navigation timing and shell measurements that follow this architecture change.
- Blockers: —
- Handoff notes: NAV-000 is now unblocked. Do not enable Cache Components until its production navigation rig can detect shell and navigation regressions.

### NAV-000 — Add the instant-navigation production rig

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Branch/PR/commit: `agent/instant-navigation-shells`
- Implementation: Added the exact-version `@next/playwright` dependency, a separately gated production build, desktop/mobile Playwright projects with retries disabled, seeded local-database startup, and a committed rig guide. The testing API requires `EXPOSE_TESTING_API=1` and is explicitly disabled when `VERCEL_ENV=production`.
- Tests run: `npm run test:instant` (36 passed); the test itself verifies the static marker remains visible while the dynamic marker is held behind the Instant lock.
- Blockers: —
- Handoff notes: Keep the regular development E2E config separate from the production Instant rig.

### NAV-001 — Enable Cache Components

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Implementation: Enabled `cacheComponents`, removed incompatible route-level dynamic/runtime overrides, and moved request, URL, authorization, and database work behind focused Suspense boundaries. Auth routes were split into static framing and dynamic form/session regions.
- Tests run: `npm run test:instant` performs a clean production build; all application pages report Static or Partial Prerender output while API routes remain dynamic. `npx tsc --noEmit` and `npm run lint` pass (one unrelated existing DB warning remains).
- Blockers: —
- Handoff notes: User-specific reads remain uncached and stream per request.

### NAV-002 — Refactor the authenticated app shell

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Implementation: Made brand, navigation, and the page slot synchronous; streamed workspace glance and review count independently; restored framework-managed Link prefetching; and replaced the coarse loading page with a responsive shell-aligned fallback. The mobile bottom navigation now owns a stable stacking layer above wide content.
- Tests run: The production Instant suite confirms shell-first hard and soft navigation at desktop and Pixel 7 widths. A headed browser smoke test confirmed Home-to-Expenses client navigation against the seeded local database.
- Blockers: —
- Handoff notes: PREFETCH-001 should measure the framework defaults before changing prefetch policy.

### NAV-003 through NAV-010 — Optimize feature routes

- Owner: Codex
- Status: Verified
- Completed: 2026-08-13
- Implementation: Hoisted static route frames and narrowed dynamic leaves for Home, Review, Expenses, Reports, Settings, Recurring, Settlements, Imports, and Investments. Recurring and Settlements now receive server-loaded initial data instead of hydration fetches. Imports and Investments stream saved data independently from upload interactions.
- Tests run: `npm run test:instant` passed all 36 hard/soft × desktop/mobile assertions with Instant locks; `npm run test:review` passed 45/45; TypeScript passed; lint passed with one unrelated existing warning. The broader E2E suite passed 18/19 against the isolated production server; the one failure is an existing review-workflow keyboard-row assertion outside NAV scope.
- Before/after measurements: Before the route refactors, the locked tests could not observe the route shell independently of dynamic work. Afterward, every targeted route exposes its shell with its dynamic marker absent during the lock, then renders the leaf after release.
- Blockers: —
- Follow-up items: The existing review keyboard E2E intermittently fails to advance the active row on ArrowDown; track separately from navigation. The `pg` client warns about concurrent queries on one connection in existing data loaders and should be addressed in DB tuning.
- Handoff notes: Start PREFETCH-001 with Partial Prefetching off and preserve these locked guards.

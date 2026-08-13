# Fin App

Shared finance app for couples and families.

## Documentation

- general design: [docs/general-design.md](./docs/general-design.md)
- general information: [docs/general-information.md](./docs/general-information.md)
- schema reference: [docs/schema-reference.md](./docs/schema-reference.md)
- hosted backup and restore runbook: [docs/hosted-backup-restore.md](./docs/hosted-backup-restore.md)
- implementation plan and progress: [docs/implementation-plan.md](./docs/implementation-plan.md)
- Next.js app shell under `src/app`
- Drizzle schema and migrations under `src/db`

## Dependency installation and upgrades

This repository uses npm with the committed `package-lock.json`. Use `npm ci` for
local, CI, and Vercel installs; do not use Yarn, pnpm, or `npm install` to install
the project from a clean checkout.

Direct dependencies are exact-pinned so a manifest change cannot silently widen the
dependency graph. To perform an intentional upgrade, choose and review the target
version, run `npm install <package>@<version> --save-exact` (and the equivalent
`--save-dev` form for tooling), then commit both `package.json` and
`package-lock.json`. Do not use `npm update` for routine installs.

Apply security updates as soon as they are reviewed. Review Next.js and React
monthly, Supabase and `pg` monthly for security or compatibility releases, and
Drizzle quarterly or when schema tooling requires it. Each upgrade must run the
repository lint, type-check, focused tests, and production build before merging.

## Current focus

The current product loop is:

1. land on a DB-backed home hub at `/`
2. import real bank files through `/imports`
3. review uncertain classifications in `/imports/review`
4. validate the ledger and manual-entry flow in `/expenses`
5. confirm recurring definitions and month-aware reporting behave like one connected flow in `/recurring` and `/reports`
6. use `/investments` for saved-holdings composition and first-pass saved activity imports
7. harden the hosted two-user path with Supabase Auth, required TOTP MFA, RLS, and temporary hosted import storage

## Current caveats

- foreign-currency rows are now explicitly labeled, but they are still normalized into the workspace currency using placeholder FX behavior
- the app preserves original and settlement amounts, but full multicurrency reporting is not finished yet
- investment composition is currently estimated from holding names when the source workbook does not expose a dedicated asset-type field
- investment activity imports currently support the checked-in Excellence Excel export and stay local to `/investments`
- provider action labels in that first activity pass are still mapped heuristically into buy, sell, dividend, cash, and tax-or-fee buckets
- hosted Auth/MFA and RLS foundations are in code, but still need real Supabase project smoke testing

## Environment note

This repo is pinned to the public npm registry through `.npmrc`.

## Local DB Smoke Test

For the easiest local development workflow, run:

```bash
npm run dev:local
```

This starts the local Supabase/Postgres Docker stack if needed, ensures the Drizzle schema and import catalog are present, and opens the app against the isolated local database. Stop the app with `Ctrl-C`; the Docker database remains available for the next run. Run `supabase stop` when you want to stop the local stack.

The E2E suite uses the same local setup automatically:

```bash
npm run test:e2e
```

The first run may take a few minutes while Docker images and Playwright browsers download.

Use this checkpoint when you want to run the app against a real PostgreSQL database instead of only relying on lint/build.

1. Start a local PostgreSQL instance and create an empty database.
2. Export `DATABASE_URL`, for example:
   `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/finapp`
3. Install dependencies if needed:
   `npm ci`
4. Push the current schema into the database:
   `npm run db:push`
5. Start the app:
   `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000).

Notes:

- the app auto-creates a seeded dev user, workspace, and workspace member the first time it resolves the current workspace
- no separate seed command is required for the first smoke test
- the shared shell and `/` home route are DB-backed, so PostgreSQL must be running before the app can render normally

The project runtime is Node 22. Use the version in `.nvmrc` (22.14.0) for local development, CI, and Vercel; `npm ci` is the supported dependency installation command.

Suggested smoke-test flow:

1. Open `/` and confirm the home hub loads with setup and next-action cues.
2. Open `/settings` and confirm the seeded workspace/member context loads.
3. Open `/imports` and save a real bank import if you have one ready.
4. Open `/imports/review` and process any uncertain rows, watching the progress cues as the queue shrinks.
5. Open `/expenses` and confirm imported rows, search/filtering, saved manual-entry editing, and any FX labels all read clearly.
6. Create a one-time manual entry and save an adjusted-period allocation.
7. Open `/recurring`, save a recurring definition, confirm it appears in reports without a separate generate step, then pause it once and confirm the current report month clears.
8. Open `/reports` and verify payment-date and adjusted-period views render for the month you just reviewed, including any FX transparency cues for imported rows, recurring rows that were prepared automatically, and the expected queue-cleared/month-aware handoff paths.
9. Open `/investments` and confirm the saved holdings render with estimated asset mix, owner split, top positions, symbol-based rollups, and account-level detail.
10. Preview and save one investment holdings workbook, then confirm the upload flow resets cleanly and the saved snapshot updates the composition view.
11. Preview and save the March investment activity workbook, then confirm the activity period and rows preview correctly, the save succeeds, and the recent saved activity table plus import history update without disturbing the current holdings composition.

## Hosted RLS Smoke Test

Before hosted validation, run:

`npm run hosted:check`

The preflight checks required hosted environment variables, local backup/restore tools, the configured Node runtime, and whether `DATABASE_URL` appears to use a non-bypass runtime database role.

After applying migrations to a Supabase/Postgres database, run:

`DATABASE_URL=postgres://app_role:... npm run smoke:rls`

The smoke test creates two temporary users/workspaces inside one transaction, proves that cross-workspace reads and representative writes are blocked by RLS, and rolls the transaction back. It refuses obvious admin/bypass database users by default so it can catch accidental service-role app traffic.

## Hosted Import Storage

Hosted import saves use Supabase Storage only as temporary processing storage. Set `FINAPP_IMPORT_STORAGE=supabase`, `SUPABASE_IMPORT_BUCKET=import-files`, `NEXT_PUBLIC_SUPABASE_URL`, and server-only `SUPABASE_SECRET_KEY`.

Run `npm run imports:setup-storage` once to create the private bucket if needed. Successful bank and investment imports delete their source object after persistence. Failed imports keep their `tmp/...` source object briefly for debugging; run `npm run imports:cleanup-failed` on a schedule to delete failed source files older than `FINAPP_FAILED_IMPORT_FILE_TTL_HOURS`.

## Hosted Backup and Restore

Use the manual encrypted `pg_dump` runbook in [docs/hosted-backup-restore.md](./docs/hosted-backup-restore.md) before treating the hosted two-user setup as durable. The runbook covers encrypted backups, checksum verification, local restore drills, and hosted recovery checks.

The repeatable helpers are `npm run backup:create` and `npm run backup:verify`.

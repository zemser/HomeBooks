# Fin App

Initial scaffold for a shared finance app for couples and families.

## What is in the repo

- product definition docs in [docs/product-structure.md](./docs/product-structure.md)
- architecture decisions in [docs/architecture.md](./docs/architecture.md)
- concrete schema planning in [docs/database-schema.md](./docs/database-schema.md)
- build plan in [docs/implementation-plan.md](./docs/implementation-plan.md)
- Next.js app shell under `src/app`
- first-pass Drizzle schema in `src/db/schema.ts`

## Current focus

The current product loop is:

1. land on a DB-backed home hub at `/`
2. import real bank files through `/imports`
3. review uncertain classifications in `/imports/review`
4. validate the ledger and manual-entry flow in `/expenses`
5. confirm recurring definitions and month-aware reporting behave like one connected flow in `/recurring` and `/reports`
6. review saved household investment composition on `/investments`, including estimated asset mix, owner split, and top positions
7. leave durable upload storage and auth planning as later slices

## Current caveats

- foreign-currency rows are now explicitly labeled, but they are still normalized into the workspace currency using placeholder FX behavior
- the app preserves original and settlement amounts, but full multicurrency reporting is not finished yet
- investment composition is currently estimated from holding names when the source workbook does not expose a dedicated asset-type field
- investment activity imports are still out of scope until we have a real sample export to design against

## Environment note

This repo is pinned to the public npm registry through `.npmrc`.

## Local DB Smoke Test

Use this checkpoint when you want to run the app against a real PostgreSQL database instead of only relying on lint/build.

1. Start a local PostgreSQL instance and create an empty database.
2. Export `DATABASE_URL`, for example:
   `export DATABASE_URL=postgres://postgres:postgres@localhost:5432/finapp`
3. Install dependencies if needed:
   `npm install`
4. Push the current schema into the database:
   `npm run db:push`
5. Start the app:
   `npm run dev`
6. Open [http://localhost:3000](http://localhost:3000).

Notes:

- the app auto-creates a seeded dev user, workspace, and workspace member the first time it resolves the current workspace
- no separate seed command is required for the first smoke test
- the shared shell and `/` home route are DB-backed, so PostgreSQL must be running before the app can render normally

Suggested smoke-test flow:

1. Open `/` and confirm the home hub loads with setup and next-action cues.
2. Open `/settings` and confirm the seeded workspace/member context loads.
3. Open `/imports` and save a real bank import if you have one ready.
4. Open `/imports/review` and process any uncertain rows, watching the progress cues as the queue shrinks.
5. Open `/expenses` and confirm imported rows, search/filtering, saved manual-entry editing, and any FX labels all read clearly.
6. Create a one-time manual entry and save an adjusted-period allocation.
7. Open `/recurring`, save a recurring definition, confirm it appears in reports without a separate generate step, then pause it once and confirm the current report month clears.
8. Open `/reports` and verify payment-date and adjusted-period views render for the month you just reviewed, including any FX transparency cues for imported rows, recurring rows that were prepared automatically, and the expected queue-cleared/month-aware handoff paths.
9. Open `/investments` and confirm the saved holdings render with estimated asset mix, owner split, top positions, and account-level detail.

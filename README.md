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

The first vertical slice is:

1. land on a DB-backed home hub at `/`
2. finish workspace setup in `/settings`
3. import one real bank file
4. review uncertain classifications
5. validate the ledger in `/expenses`
6. add recurring rent and salary entries
7. generate monthly and yearly summaries in `/reports`

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
4. Open `/imports/review` and process any uncertain rows.
5. Open `/expenses` and create a one-time manual entry, then save an adjusted-period allocation.
6. Open `/recurring` and confirm recurring entry screens load against the live DB.
7. Open `/reports` and verify payment-date and adjusted-period views render.

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

1. workspace setup
2. import one real bank file
3. normalize transactions
4. review uncertain classifications
5. add recurring rent and salary entries
6. generate monthly and yearly summaries

## Environment note

This repo is pinned to the public npm registry through `.npmrc`.

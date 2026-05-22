# Finance App General Design

## Purpose

This is the single source of truth for product design, architecture direction, and core data design.

## Product intent

The app is a shared household finance workspace for couples/families that should:

- unify expenses, income, recurring entries, shared settlements, and investments
- support CSV/XLSX imports from multiple providers
- support both payment-date and adjusted-period reporting
- support multi-currency normalization into one workspace currency
- stay low-cost for a small private deployment

## Product principles

- low-cost first: avoid paid integrations unless clearly justified
- import once, reuse everywhere: parse once into normalized domain models
- human review over fragile automation: users can confirm uncertain rows and save rules
- privacy and auditability: preserve import metadata and transformation decisions

## Architecture direction

Use a modular monolith:

- one Next.js codebase
- one PostgreSQL database
- internal modules for auth/workspaces/imports/expenses/reporting/settlements/investments

Why:

- early-stage product where data modeling and workflow correctness matter more than scale
- simpler deployment and lower operational cost
- easier consistency across import, classification, and reporting pipelines

## Core stack

- app: Next.js + TypeScript
- validation: Zod
- ORM/migrations: Drizzle + PostgreSQL
- file parsing: `csv-parse`, `xlsx`
- styling/UI: Tailwind + React components

Hosted v1 target:

- Vercel for app hosting
- Supabase Auth for identity
- Supabase Postgres for data
- Supabase Storage for temporary import-file processing

## Data design rules

- preserve original imported values for auditability
- separate raw import rows from normalized records
- separate transaction facts from reporting allocations
- avoid silent historical rewrites
- treat uploaded source files as temporary processing artifacts

## Core domain areas

- identity/workspaces: users, workspaces, membership, roles
- imports: sources, templates, imports, raw rows, checksums
- expenses/reporting: transactions, classifications, allocations, summaries
- recurring/manual entries: definitions, generated entries, overrides
- shared settlements: split rules, balances, statuses
- investments: accounts, holdings snapshots, activity imports

## Finance correctness

- use decimal-safe arithmetic (for example `big.js`) for money/rate math
- persist applied FX rate metadata for explainable historical reporting
- keep base workspace currency stable unless explicit migration/recalculation is executed

## Security and access model

- use Supabase `auth.users.id` as app `users.id` for hosted users
- require TOTP MFA in hosted mode before onboarding, app pages, or API routes are available
- treat Supabase `aal2` as the required authenticated session level for hosted user traffic
- keep product authorization in app tables (`users`, `workspaces`, `workspace_members`)
- enforce RLS on app-owned workspace tables through the SQL migration layer
- propagate the authenticated Supabase user id into Postgres as `app.current_user_id`
- ensure pooled DB sessions clear stale app user context before reuse
- ensure normal user traffic does not use bypass/admin DB credentials
- reserve admin/service credentials for migrations and tightly scoped maintenance only

## Technical Reference

Implemented DB details are tracked in `docs/schema-reference.md`.

## Documentation decisions

Documentation cleanup applied on 2026-05-14:

- consolidated `docs/product-structure.md`, `docs/architecture.md`, and `docs/database-schema.md` into this file
- moved operational/project context into `docs/general-information.md`
- removed `docs/platform-research.md` after carrying forward its long-lived decisions into this file and `docs/implementation-plan.md`

Removed docs are considered superseded, not authoritative.

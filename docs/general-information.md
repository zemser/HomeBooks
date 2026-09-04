# Finance App General Information

## Purpose

This document holds practical project context and operating notes that are not design specs or implementation sequencing.

## Repo overview

- Next.js app shell under `src/app`
- domain features under `src/features`
- DB schema/migrations under `src/db`
- docs under `docs`
- sample data in `examples`

## Current product state (high level)

Implemented flows include:

- hosted Supabase auth foundation with required TOTP MFA in hosted mode
- hosted RLS foundation for workspace isolation, pending hosted-project smoke testing
- imports + persisted history
- review queue + classification rules
- expenses + recurring + manual entries
- reporting (payment-date and adjusted-period)
- shared settlements
- investments holdings/activity imports

For detailed build status and what comes next, see `docs/implementation-plan.md`.

## GitHub branch protection

Protect `master` in GitHub repository settings before continuing normal PR work.

Recommended rule:

- Branch name pattern: `master`
- Require a pull request before merging
- Do not allow bypassing the rule, if available for the repo plan
- Block force pushes

This is the source-of-truth guard against accidental direct pushes to `master`.

## Local DB smoke test

1. start local PostgreSQL and create an empty DB
2. export `DATABASE_URL`
3. run `npm ci`
4. run `npm run db:push`
5. run `npm run dev`
6. open [http://localhost:3000](http://localhost:3000)

## Documentation map

- general design: `docs/general-design.md`
- general information: `docs/general-information.md`
- implementation sequencing and progress: `docs/implementation-plan.md`
- focused budgeting experience and reporting requirements: `docs/focused-budgeting-experience-spec.md`
- implemented schema reference: `docs/schema-reference.md`
- agent operational notes: `AGENT.md`

## Runtime and installation

The supported runtime is Node 22. Use `.nvmrc` (22.14.0) with a Node version manager and run `npm ci` for a reproducible install. Vercel reads the same `engines.node` requirement from `package.json`.

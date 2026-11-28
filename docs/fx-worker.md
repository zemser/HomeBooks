# Bank of Israel monthly rate worker

An enabled workspace asks for a completed observation month when its cache misses. The application queues the currency pair and month in its transaction. After the request commits, the worker fetches official monthly means and publication counts from the Bank of Israel, saves a version, and reconciles pending rows. The January 2025 reference fixtures use 22 publications. One USD averages 3.61527273 ILS and one JPY averages 0.02311564 ILS. The provider quotes 100 yen per observation. [Official exchange rates and monthly export](https://www.boi.org.il/en/economic-roles/financial-markets/exchange-rates)

## Local development

Run `npm run dev:local`. It applies the migration ledger, provisions a loopback-only development profile using the login `homebooks_fx_local`, and starts a one-minute retry loop alongside Next. Existing local databases built with the pre-FX `db:push` schema retain their households and acquire the SQL helpers needed by the worker. The historical seed migration still runs automatically on a fresh database. New months require only access to the provider.

## Hosted deployment

1. Apply the SQL migrations as the migration owner. Migration 0021 creates the non-login group `homebooks_fx_worker`. Migration 0022 grants queue access and cache inserts to that group. The application role `finapp_app` can enqueue keys. A differently named non-bypass application role needs schema usage on `app`, execution on `app.request_missing_fx_rates(jsonb)`, and its usual workspace grants. Grant no direct queue writes or cache modifications to application roles. Revoke any pre-existing TRUNCATE privilege on these tables from custom application roles.
2. Provision a dedicated login with NOINHERIT and NOBYPASSRLS and grant it membership in `homebooks_fx_worker`. Once provider reuse terms are confirmed for the deployment, set its direct database connection string as `FX_WORKER_DATABASE_URL`. The worker sets its connection role to `homebooks_fx_worker`. Household repair uses normal application connections scoped to active members. [BoI terms](https://www.boi.org.il/en/terms-of-use/)
3. Set the server-side `CRON_SECRET` in Vercel. Vercel calls `GET /api/cron/fx-rates` daily at 03:17 UTC. On other hosts, schedule `node --import tsx scripts/drain-fx-rates.ts` with the worker and application environment. Launch with `--watch` for a one-minute polling loop. Each run drains bounded batches of eight, respects active leases, and retries provider and repair failures separately. The response includes pending request count, oldest outstanding observation month, and last unresolved failure.
4. To check a suspected provider revision, use the same worker command with `--refresh USD 2025-01`. A changed publication gets a new cache version. Completed valuations retain the reference they used. Changes to historical household figures follow the separate restatement and reconciliation process.

## Enrolling a household and repairing its history

With worker credentials configured, newly created ILS households start on the previous-month policy. Existing households retain their current values until explicitly enrolled. Enable one workspace at a time; use a maintenance connection for the inventory and keep its output private.

1. Run `npm run fx:renormalize -- --workspace <id> --output inventory.json` for a read-only inventory. Review missing currencies, proposed changes and protected records. A foreign rate-of-one is eligible for repair only when its source identifies it as a placeholder.
2. Use `npm run fx:renormalize -- --workspace <id> --set-policy previous-month-v1` to enable new writes. Use `--apply inventory.json` with the same workspace to apply the checked snapshot. Changed, ambiguous, or protected rows go to review. Outstanding supported months enter the rate queue. Rerunning the command is safe.
3. Compare monthly reports, export totals and member balances with the inventory. To reconsider old valid conversions, request any missing rates with `--request-rates`, then produce a new inventory with `--restate --effective-date YYYY-MM-DD`. Review it before using those same options with `--apply`. Reversing an applied run uses `--reverse <run-id>`; subsequent user edits and saved splits are protected.
4. If members need to reconcile an already agreed balance, record the agreed difference as a separate dated entry. Shared splits and custom allocations are protected during FX repair.

## Repair progress and retries

Once a monthly rate is cached, the worker discovers affected households through the worker-only function in the private `app` schema. Each household has a separate job. A transaction processes at most 20 pending source rows and commits their valuations, reporting projections and audit records together. The queue checkpoints the last source identifier. A failed household backs off independently while the worker continues with other households. If another import requests the same rate during a repair, the worker revisits earlier identifiers. A retry after a completed page skips amounts already valued.

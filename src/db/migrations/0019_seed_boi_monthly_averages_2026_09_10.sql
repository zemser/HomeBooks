-- Seed Bank of Israel monthly average rates (ILS per 1 unit of base).
-- JPY is stored per 1 yen (BoI publishes per 100 yen). Last completed month: 2026-10.
-- Source: BOI STATISTICS EXR RER_*_ILS, monthly mean of daily representative rates.
-- September and October 2026 were missing, so USD/EUR/GBP/JPY/CHF charges in those
-- months normalized to 0 and showed as Placeholder FX until these rows exist.
INSERT INTO "exchange_rate_monthly" (
  "base_currency",
  "quote_currency",
  "year_month",
  "average_rate",
  "source_name"
)
VALUES
  ('USD', 'ILS', '2026-09-01', 3.0334, 'seed-boi-monthly-average'),
  ('USD', 'ILS', '2026-10-01', 3.088, 'seed-boi-monthly-average'),
  ('EUR', 'ILS', '2026-09-01', 3.490895, 'seed-boi-monthly-average'),
  ('EUR', 'ILS', '2026-10-01', 3.4610619, 'seed-boi-monthly-average'),
  ('GBP', 'ILS', '2026-09-01', 4.068325, 'seed-boi-monthly-average'),
  ('GBP', 'ILS', '2026-10-01', 4.10440952, 'seed-boi-monthly-average'),
  ('JPY', 'ILS', '2026-09-01', 0.01938825, 'seed-boi-monthly-average'),
  ('JPY', 'ILS', '2026-10-01', 0.01954957, 'seed-boi-monthly-average'),
  ('CHF', 'ILS', '2026-09-01', 3.70247, 'seed-boi-monthly-average'),
  ('CHF', 'ILS', '2026-10-01', 3.72678571, 'seed-boi-monthly-average')
ON CONFLICT ("base_currency", "quote_currency", "year_month", "source_name")
DO UPDATE SET
  "average_rate" = EXCLUDED."average_rate",
  "fetched_at" = now();

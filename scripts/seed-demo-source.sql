-- Synthetic rows for the pre-built demo source environment (schema `lattice_demo`).
--
-- Safe to run repeatedly: every row is upserted. Run it against the same Supabase database the
-- governed bindings read from, after the 20260814120000_lattice_demo_source.sql migration:
--
--   psql "$LATTICE_DEMO_POSTGRES_URL" -f scripts/seed-demo-source.sql
--
-- `observed_at` is stamped to now() so a freshly seeded database always reads as current against a
-- binding's freshness window. Re-run the script to refresh it. All identifiers are synthetic.

-- Financial services -----------------------------------------------------------
-- CP-0103 (Arcadia Capital Markets) is deliberately over its approved limit
-- (27.4M > 25M); CP-0188 (Arcadia Asset Management) sits well within its limit.
insert into lattice_demo.counterparty_exposure
  (counterparty_lei, counterparty_rating, sector, portfolio_id, net_current_exposure, approved_limit, position_notional, currency, observed_at)
values
  ('549300ARCADIA0103', 'BBB', 'Financials',       'PF-CREDIT-01', 27400000.00, 25000000.00, 85000000.00, 'USD', now()),
  ('549300ARCADIA0188', 'A-',  'Asset Management', 'PF-CREDIT-01',  4100000.00, 15000000.00, 12000000.00, 'USD', now())
on conflict (counterparty_lei) do update set
  counterparty_rating  = excluded.counterparty_rating,
  sector               = excluded.sector,
  portfolio_id         = excluded.portfolio_id,
  net_current_exposure = excluded.net_current_exposure,
  approved_limit       = excluded.approved_limit,
  position_notional    = excluded.position_notional,
  currency             = excluded.currency,
  observed_at          = excluded.observed_at;

delete from lattice_demo.collateral_balance where counterparty_lei in ('549300ARCADIA0103', '549300ARCADIA0188');
insert into lattice_demo.collateral_balance (counterparty_lei, market_value, currency, observed_at)
values
  ('549300ARCADIA0103', 12800000.00, 'USD', now()),
  ('549300ARCADIA0188',        0.00, 'USD', now());

-- Airline ----------------------------------------------------------------------
-- LT121 is ready: a pending release, crew fit for duty, fuel and reserve in hand.
insert into lattice_demo.dispatch_release_context
  (flight_number, aircraft_tail_number, release_number, release_status, fit_for_duty, planned_fuel_kg, reserve_fuel_minutes, weather_summary, notam_summary, regulation_citations, observed_at)
values
  ('LT121', 'N121LT', 'DR-LT121-01', 'PENDING_AUTHORIZATION', true, 19800.0, 45,
   'KSEA VFR, KSFO few clouds 4000, alternate KSMF clear.',
   'No material NOTAMs affecting KSEA-KSFO.',
   '14 CFR 121.533; 121.593; 121.601; 121.639; 117.25', now())
on conflict (flight_number) do update set
  aircraft_tail_number = excluded.aircraft_tail_number,
  release_number       = excluded.release_number,
  release_status       = excluded.release_status,
  fit_for_duty         = excluded.fit_for_duty,
  planned_fuel_kg      = excluded.planned_fuel_kg,
  reserve_fuel_minutes = excluded.reserve_fuel_minutes,
  weather_summary      = excluded.weather_summary,
  notam_summary        = excluded.notam_summary,
  regulation_citations = excluded.regulation_citations,
  observed_at          = excluded.observed_at;

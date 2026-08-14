-- Pre-built demo source environment.
--
-- Lattice governs reads from external systems of record; it does not store its own operational
-- data in Postgres. This migration adds a demo *source system* to bind against — not a backing
-- store for the platform — so the studio can show a real, read-only governed read instead of a
-- simulated one.
--
-- Everything lives in a dedicated `lattice_demo` schema, entirely separate from `public` (which
-- holds the tenancy and governance ledgers). The schema is deliberately kept out of the PostgREST
-- exposure list in `config.toml` (`schemas = ["public", "graphql_public"]`), so these rows are
-- reachable only over the Postgres wire protocol by a governed binding — never through the Data
-- API. All values are synthetic: invented LEIs, tail numbers, and flight designators. No real
-- counterparties, people, or PII.
--
-- The synthetic rows themselves are loaded by `scripts/seed-demo-source.sql`, which is safe to run
-- repeatedly. This migration only creates the schema and the tables.
--
-- The demo bindings read as the database role their credential authenticates as. In an existing
-- Lattice deployment that is the injected POSTGRES_URL role, which already reaches this schema, so
-- no dedicated login role is provisioned here. Read-only is still guaranteed twice by the runtime:
-- the connector wraps every read in BEGIN READ ONLY ... ROLLBACK, and only a single SELECT is
-- allowed to reach the database at all. To tighten to least privilege later, create a LOGIN role
-- granted SELECT only on `lattice_demo` and point LATTICE_DEMO_POSTGRES_URL at it.

create schema if not exists lattice_demo;

-- Never expose demo source rows through the Data API roles; they are reachable only over the
-- Postgres wire protocol by a governed binding.
revoke all on schema lattice_demo from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Financial services — keyed by counterparty LEI, the key the risk warehouse
-- (contract-counterparty-risk, binding-risk-warehouse@1) recognizes.
-- ---------------------------------------------------------------------------
create table if not exists lattice_demo.counterparty_exposure (
  counterparty_lei      text primary key,
  counterparty_rating   text        not null,
  sector                text        not null,
  portfolio_id          text        not null,
  net_current_exposure  numeric(18,2) not null,
  approved_limit        numeric(18,2) not null,
  position_notional     numeric(18,2) not null,
  currency              char(3)     not null,
  observed_at           timestamptz not null
);

create table if not exists lattice_demo.collateral_balance (
  counterparty_lei  text        not null references lattice_demo.counterparty_exposure (counterparty_lei),
  market_value      numeric(18,2) not null,
  currency          char(3)     not null,
  observed_at       timestamptz not null
);

-- ---------------------------------------------------------------------------
-- Airline — keyed by flight designator, the key operations control
-- (contract-airline-dispatch, binding-airline-dispatch-demo@1) recognizes.
-- ---------------------------------------------------------------------------
create table if not exists lattice_demo.dispatch_release_context (
  flight_number         text primary key,
  aircraft_tail_number  text        not null,
  release_number        text        not null,
  release_status        text        not null,
  fit_for_duty          boolean     not null,
  planned_fuel_kg       numeric(10,1) not null,
  reserve_fuel_minutes  integer     not null,
  weather_summary       text        not null,
  notam_summary         text        not null,
  regulation_citations  text        not null,
  observed_at           timestamptz not null
);

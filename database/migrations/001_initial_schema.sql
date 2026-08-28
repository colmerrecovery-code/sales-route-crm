-- Sales Route CRM — PostgreSQL 16 + PostGIS schema
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- Enumerated types ---------------------------------------------------------
CREATE TYPE customer_tier AS ENUM ('tier1', 'tier2', 'tier3', 'tier4');
-- tier1: current customers (quarterly touch)   tier2: warm/hot leads
-- tier3: inactive 365+ days                     tier4: cold leads from cold calls
CREATE TYPE lead_temperature AS ENUM ('hot', 'warm', 'cold');
CREATE TYPE interaction_type AS ENUM ('visit', 'call', 'email', 'note');
CREATE TYPE trip_status AS ENUM ('draft', 'planned', 'in_progress', 'completed', 'cancelled');
CREATE TYPE stop_kind AS ENUM ('customer', 'break');
CREATE TYPE break_kind AS ENUM ('lunch', 'meeting', 'off_duty', 'other');

-- Users -------------------------------------------------------------------
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         CITEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  home_location GEOGRAPHY(POINT, 4326),      -- trip start/end default
  home_address  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Companies ---------------------------------------------------------------
CREATE TABLE companies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_code TEXT NOT NULL,                 -- human-readable unique ID, e.g. C-000123
  name         TEXT NOT NULL,
  address      TEXT,
  city         TEXT,
  postal_code  TEXT,
  province     TEXT,
  country      TEXT DEFAULT 'Canada',
  phone        TEXT,
  website      TEXT,
  location     GEOGRAPHY(POINT, 4326),
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, company_code)
);
CREATE INDEX companies_location_gix ON companies USING GIST (location);
CREATE INDEX companies_owner_idx ON companies (owner_id);
CREATE INDEX companies_city_idx ON companies (owner_id, lower(city));
CREATE INDEX companies_postal_idx ON companies (owner_id, upper(replace(postal_code, ' ', '')));

-- Clients (individual contacts at a company) ------------------------------
CREATE TABLE clients (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_code TEXT NOT NULL,                  -- e.g. C-000123-01
  first_name  TEXT NOT NULL,
  last_name   TEXT,
  title       TEXT,
  email       TEXT,
  phone       TEXT,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, client_code)
);
CREATE INDEX clients_company_idx ON clients (company_id);

-- Customer status (one row per company) -----------------------------------
CREATE TABLE customers (
  company_id       UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  tier             customer_tier NOT NULL DEFAULT 'tier2',
  temperature      lead_temperature,           -- only meaningful for tier2/tier4
  last_contact_at  TIMESTAMPTZ,
  last_purchase_at TIMESTAMPTZ,
  next_touch_due   DATE,                       -- quarterly for tier1, computed by trigger
  annual_value     NUMERIC(12,2),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX customers_tier_idx ON customers (tier);
CREATE INDEX customers_next_touch_idx ON customers (next_touch_due);

-- Interactions ------------------------------------------------------------
CREATE TABLE interactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_id   UUID REFERENCES clients(id) ON DELETE SET NULL,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        interaction_type NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  summary     TEXT,
  outcome     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX interactions_company_idx ON interactions (company_id, occurred_at DESC);

-- Road trips --------------------------------------------------------------
CREATE TABLE road_trips (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          trip_status NOT NULL DEFAULT 'draft',
  start_date      DATE NOT NULL,
  end_date        DATE,                        -- NULL = open-ended
  work_start      TIME NOT NULL DEFAULT '08:30',
  work_end        TIME NOT NULL DEFAULT '17:00',
  default_visit_min INTEGER NOT NULL DEFAULT 45,
  repeat_daily    BOOLEAN NOT NULL DEFAULT true, -- reuse hours/breaks each day
  start_location  GEOGRAPHY(POINT, 4326),
  end_location    GEOGRAPHY(POINT, 4326),
  total_distance_m INTEGER,
  total_duration_s INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX road_trips_owner_idx ON road_trips (owner_id, start_date);

-- Recurring break definitions for a trip (applied to each day when repeat_daily)
CREATE TABLE break_times (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES road_trips(id) ON DELETE CASCADE,
  kind        break_kind NOT NULL DEFAULT 'lunch',
  label       TEXT,
  starts_at   TIME NOT NULL,
  duration_min INTEGER NOT NULL DEFAULT 60,
  only_on_day INTEGER                          -- NULL = every day, else day number (1-based)
);

-- Ordered stops within a trip (customer visits and inline breaks)
CREATE TABLE trip_stops (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id        UUID NOT NULL REFERENCES road_trips(id) ON DELETE CASCADE,
  day_number     INTEGER NOT NULL DEFAULT 1,
  sequence       INTEGER NOT NULL,
  kind           stop_kind NOT NULL DEFAULT 'customer',
  company_id     UUID REFERENCES companies(id) ON DELETE CASCADE,
  break_id       UUID REFERENCES break_times(id) ON DELETE CASCADE,
  planned_arrival TIMESTAMPTZ,
  planned_depart  TIMESTAMPTZ,
  duration_min   INTEGER NOT NULL DEFAULT 45,
  leg_distance_m INTEGER,                      -- from previous stop
  leg_duration_s INTEGER,
  visited        BOOLEAN NOT NULL DEFAULT false,
  notes          TEXT,
  UNIQUE (trip_id, day_number, sequence),
  CHECK ((kind = 'customer' AND company_id IS NOT NULL) OR (kind = 'break'))
);
CREATE INDEX trip_stops_trip_idx ON trip_stops (trip_id, day_number, sequence);

-- Triggers ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$ LANGUAGE plpgsql;
CREATE TRIGGER companies_touch BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER road_trips_touch BEFORE UPDATE ON road_trips FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER customers_touch BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Quarterly reminder for tier1; 365-day inactivity demotion handled by a scheduled query
CREATE OR REPLACE FUNCTION customers_set_next_touch() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.tier = 'tier1' AND NEW.last_contact_at IS NOT NULL THEN
    NEW.next_touch_due = (NEW.last_contact_at + INTERVAL '90 days')::date;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER customers_next_touch BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_set_next_touch();

-- Logging an interaction bumps last_contact_at
CREATE OR REPLACE FUNCTION interactions_bump_contact() RETURNS TRIGGER AS $$
BEGIN
  UPDATE customers SET last_contact_at = GREATEST(COALESCE(last_contact_at, NEW.occurred_at), NEW.occurred_at)
   WHERE company_id = NEW.company_id;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER interactions_bump AFTER INSERT ON interactions
  FOR EACH ROW EXECUTE FUNCTION interactions_bump_contact();

-- Helper view: companies with status and lat/lng flattened
CREATE VIEW company_overview AS
SELECT c.*, cu.tier, cu.temperature, cu.last_contact_at, cu.last_purchase_at,
       cu.next_touch_due, cu.annual_value,
       ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng,
       (cu.last_purchase_at IS NOT NULL AND cu.last_purchase_at < now() - INTERVAL '365 days') AS inactive_365
FROM companies c LEFT JOIN customers cu ON cu.company_id = c.id;

-- Company code sequence (per owner codes are generated in the API; this is a global fallback)
CREATE SEQUENCE company_code_seq START 1000;

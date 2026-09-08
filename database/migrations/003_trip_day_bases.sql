-- Where each day of a trip STARTS.
--
-- The rule, because it is the thing that is easy to get backwards:
--   a row for day N says where you begin the MORNING of day N.
--   the END of day N is therefore the base of day N+1 — you drive to
--   tonight's hotel, and tomorrow you set out from it.
--   no row for a day  =>  fall back to the trip's start_location (home).
--
-- So a Tue-Thu trip staying over in London on the Tuesday night looks like:
--   (no row for day 1)      day 1: home    -> stops -> London     [= base of day 2]
--   day 2 = London hotel    day 2: London  -> stops -> London     [no base for day 3]
--   ...and if day 3 has no base, day 3 runs London -> stops -> home.

CREATE TABLE IF NOT EXISTS trip_day_bases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES road_trips(id) ON DELETE CASCADE,
  day_number  INTEGER NOT NULL CHECK (day_number >= 1),
  label       TEXT,                                  -- "Holiday Inn, London"
  address     TEXT,
  location    GEOGRAPHY(POINT, 4326) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, day_number)
);

CREATE INDEX IF NOT EXISTS trip_day_bases_trip_idx ON trip_day_bases (trip_id, day_number);

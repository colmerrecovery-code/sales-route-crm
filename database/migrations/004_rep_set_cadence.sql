-- How often a rep comes back round to a customer.
--
-- Until now this was hardcoded: tier1 customers got 90 days and nobody else got
-- anything. That is one rep's opinion baked into a trigger. A rep selling
-- consumables wants to be back in six weeks; a rep selling capital equipment
-- wants six months; and prospects need a cycle of their own, which tier1-only
-- never gave them.
--
-- Two levels, because that is how the decision is actually made:
--   a DEFAULT PER TIER on the account  — "my current customers, every 90 days"
--   an OVERRIDE ON ONE CUSTOMER       — "but call on this one monthly"
-- NULL at both levels means no cycle: that customer never becomes due.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS touch_days_tier1 INTEGER DEFAULT 90,   -- current customers
  ADD COLUMN IF NOT EXISTS touch_days_tier2 INTEGER,              -- warm/hot leads
  ADD COLUMN IF NOT EXISTS touch_days_tier3 INTEGER,              -- inactive 365+
  ADD COLUMN IF NOT EXISTS touch_days_tier4 INTEGER;              -- cold leads

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS touch_interval_days INTEGER;           -- NULL = use the tier default

CREATE OR REPLACE FUNCTION customers_set_next_touch() RETURNS TRIGGER AS $$
DECLARE
  days INTEGER;
BEGIN
  IF NEW.last_contact_at IS NULL THEN
    NEW.next_touch_due := NULL;
    RETURN NEW;
  END IF;

  -- The customer's own interval wins; otherwise the owner's default for its tier.
  days := NEW.touch_interval_days;
  IF days IS NULL THEN
    SELECT CASE NEW.tier
             WHEN 'tier1' THEN u.touch_days_tier1
             WHEN 'tier2' THEN u.touch_days_tier2
             WHEN 'tier3' THEN u.touch_days_tier3
             WHEN 'tier4' THEN u.touch_days_tier4
           END
      INTO days
      FROM companies c JOIN users u ON u.id = c.owner_id
     WHERE c.id = NEW.company_id;
  END IF;

  IF days IS NOT NULL AND days > 0 THEN
    NEW.next_touch_due := (NEW.last_contact_at + (days || ' days')::interval)::date;
  ELSE
    NEW.next_touch_due := NULL;   -- no cycle set for this tier
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- The trigger fired on tier/last_contact changes before; it must also fire when
-- the interval itself is edited, or changing "every 30 days" would not take
-- effect until the next time that customer was contacted.
DROP TRIGGER IF EXISTS customers_next_touch ON customers;
CREATE TRIGGER customers_next_touch BEFORE INSERT OR UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION customers_set_next_touch();

-- The overview view is what the app reads customers through, so the per-customer
-- interval has to appear there or the UI cannot show what is set.

-- NOTE: CREATE OR REPLACE VIEW can only ADD columns at the END. Putting
-- touch_interval_days in the middle fails with "cannot change name of view
-- column", so it goes last even though it reads oddly next to the lat/lng.
CREATE OR REPLACE VIEW company_overview AS
SELECT c.*, cu.tier, cu.temperature, cu.last_contact_at, cu.last_purchase_at,
       cu.next_touch_due, cu.annual_value,
       ST_Y(c.location::geometry) AS lat, ST_X(c.location::geometry) AS lng,
       (cu.last_purchase_at IS NOT NULL AND cu.last_purchase_at < now() - INTERVAL '365 days') AS inactive_365,
       cu.touch_interval_days
FROM companies c LEFT JOIN customers cu ON cu.company_id = c.id;

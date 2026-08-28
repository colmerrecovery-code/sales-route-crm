# Database

PostgreSQL 16 + PostGIS. All spatial columns are `GEOGRAPHY(POINT, 4326)` so distance queries are in metres.

## Tables

| Table | Purpose |
|---|---|
| `users` | Sales reps. `home_location` is the default trip start point. |
| `companies` | One row per business. `company_code` (e.g. `C-001007`) is the human-readable ID, unique per owner. `location` is geocoded from the address on create/update. |
| `clients` | People at a company. `client_code` is `<company_code>-NN`. |
| `customers` | One row per company holding status: `tier`, `temperature`, `last_contact_at`, `last_purchase_at`, `next_touch_due`, `annual_value`. |
| `interactions` | Visits, calls, emails, notes. Inserting one bumps `customers.last_contact_at` via trigger. |
| `road_trips` | A trip with dates (open-ended if `end_date` is NULL), working hours, default visit length, optional start/end points. |
| `break_times` | Recurring breaks for a trip (lunch, meeting, off-duty). `only_on_day` restricts to one day; NULL = every day. |
| `trip_stops` | Ordered stops per day. `kind` is `customer` or `break`. Holds planned arrival/departure and leg distance/duration from the optimizer. |

## Tiers

| Tier | Meaning | Rule |
|---|---|---|
| `tier1` | Current customer | `next_touch_due` = last contact + 90 days (trigger). Shown as "due" on the dashboard when past. |
| `tier2` | Lead | Uses `temperature` hot/warm/cold. |
| `tier3` | Inactive | Auto-demoted from tier1 when `last_purchase_at` is 365+ days ago (scheduled query). |
| `tier4` | Cold lead | From cold-calling; low priority. Also uses `temperature`. |

## View

`company_overview` joins `companies` + `customers` and exposes `lat`, `lng`, and `inactive_365`. The API reads from this view.

## Useful queries

```sql
-- Customers within 25 km of a point
SELECT name FROM company_overview
 WHERE ST_DWithin(location, ST_SetSRID(ST_MakePoint(-79.76, 43.73), 4326)::geography, 25000);

-- Quarterly touches overdue
SELECT company_code, name, next_touch_due FROM company_overview WHERE next_touch_due <= CURRENT_DATE;
```

## Migrations

`backend/scripts/migrate.js` applies `database/migrations/*.sql` in order and records them in `schema_migrations`. `002_demote_inactive.sql` is a scheduled job, not a migration, and is skipped.

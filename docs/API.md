# API

Base URL: `/api`. All routes except `/auth/register`, `/auth/login`, and `/health` require `Authorization: Bearer <JWT>`.

Errors return `{ "error": "message", "issues"?: { field: [msg] } }`.

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/register` | `{ email, password (8+), full_name }` | `{ token, user }` |
| POST | `/auth/login` | `{ email, password }` | `{ token, user }` |
| GET | `/auth/me` | — | user incl. `home_lat`, `home_lng` |
| PUT | `/auth/me/home` | `{ home_address, lat?, lng? }` | user (geocodes if no lat/lng) |

## Companies

| Method | Path | Notes |
|---|---|---|
| GET | `/companies` | Filters: `tier`, `temperature`, `city`, `postal_code` (prefix), `q` (name/code), `due=true`, `near=lat,lng&radius_km=25` |
| GET | `/companies/stats` | Counts, value, and overdue count per tier |
| GET | `/companies/:id` | Company + `clients[]` + `interactions[]` |
| POST | `/companies` | `{ name, address?, city?, postal_code?, province?, country?, phone?, website?, notes?, tier?, temperature?, last_contact_at?, last_purchase_at?, annual_value?, lat?, lng? }`. Geocodes the address unless lat/lng given. Response includes `geocoded: bool`. |
| PATCH | `/companies/:id` | Any subset of the above. Address changes re-geocode. |
| DELETE | `/companies/:id` | Cascades to clients, interactions, trip stops. |
| POST | `/companies/:id/clients` | `{ first_name, last_name?, title?, email?, phone?, is_primary?, notes? }` |
| PATCH | `/companies/:id/clients/:clientId` | |
| DELETE | `/companies/:id/clients/:clientId` | |
| POST | `/companies/:id/interactions` | `{ kind: visit\|call\|email\|note, client_id?, occurred_at?, summary?, outcome? }`. Bumps last contact. |

## Road trips

| Method | Path | Notes |
|---|---|---|
| GET | `/trips` | List with `stop_count` |
| GET | `/trips/:id` | Trip + `stops[]` (ordered by day, sequence) + `breaks[]` |
| POST | `/trips` | `{ name, start_date, end_date?, work_start?, work_end?, default_visit_min?, repeat_daily?, start_lat?, start_lng?, end_lat?, end_lng? }` |
| PATCH | `/trips/:id` | Any subset; `status`: draft \| planned \| in_progress \| completed \| cancelled |
| DELETE | `/trips/:id` | |
| POST | `/trips/:id/stops` | `{ company_ids: [uuid], duration_min? }` — appends (skips companies already on the trip) |
| PATCH | `/trips/:id/stops/:stopId` | `{ duration_min?, visited?, notes? }` |
| DELETE | `/trips/:id/stops/:stopId` | |
| POST | `/trips/:id/breaks` | `{ kind?, label?, starts_at: "HH:MM", duration_min?, only_on_day? }` |
| DELETE | `/trips/:id/breaks/:breakId` | |
| POST | `/trips/:id/optimize` | `{ round_trip?: true }`. Solves visiting order from the start point (trip start → user home → first stop), lays stops onto days using working hours and breaks, persists the result. Returns the trip plus `geometry` (GeoJSON LineString) and `unscheduled[]` (stops that didn't fit before `end_date`). |
| GET | `/trips/:id/directions?day=1` | Turn-by-turn steps per leg in the stored order. Omit `day` for the whole trip. |

## Example

```bash
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"demo@example.com","password":"demo1234"}' | jq -r .token)

curl -s "localhost:4000/api/companies?tier=tier1&due=true" -H "Authorization: Bearer $TOKEN"
```

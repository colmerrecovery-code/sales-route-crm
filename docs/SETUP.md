# Setup

## Option A — Docker (fastest)

```bash
cp .env.example .env            # optional: set JWT_SECRET
docker compose up --build
```

- App: http://localhost:5173
- API: http://localhost:4000/api (health check at `/api/health`)
- Postgres/PostGIS on port 5432 — schema and demo data load automatically on first start.

Demo login is created by the seed script, not by the SQL file (the SQL contains a placeholder hash). To add it inside Docker:

```bash
docker compose exec backend npm run db:seed
```

Then sign in with **demo@example.com / demo1234**.

## Option B — Local development

Requirements: Node 20+, PostgreSQL 16 with the PostGIS extension.

```bash
# 1. Database
createuser crm -P                # password: crm
createdb sales_route_crm -O crm

# 2. Backend
cd backend
cp ../.env.example .env          # edit DATABASE_URL / JWT_SECRET
npm install
npm run db:migrate               # applies database/migrations/*.sql
npm run db:seed                  # demo user + six Ontario companies
npm run dev                      # http://localhost:4000

# 3. Frontend (new terminal)
cd frontend
cp .env.example .env
npm install
npm run dev                      # http://localhost:5173
```

## External services

| Purpose | Default | Notes |
|---|---|---|
| Map tiles | OpenStreetMap | Free; fine for a small team. |
| Geocoding | Nominatim (`NOMINATIM_URL`) | Public instance allows ~1 req/s. Set `NOMINATIM_USER_AGENT` to a real contact. |
| Routing & optimization | OSRM demo (`OSRM_URL`) | Public demo has no SLA. For production, self-host OSRM (`osrm-backend` Docker image with an Ontario extract) or swap `backend/services/geo.js` for Google Maps Directions/Routes API. |

Only `services/geo.js` talks to these providers, so switching to Google Maps is a one-file change.

## Scheduled job

`database/migrations/002_demote_inactive.sql` moves Tier 1 customers with no purchase in 365+ days to Tier 3. Run it nightly with cron or pg_cron:

```bash
psql $DATABASE_URL -f database/migrations/002_demote_inactive.sql
```

## Environment variables

See `.env.example` at the repo root for the full list.

# STAR PLUS Backend

Cloudflare Workers API with D1 database for the STAR PLUS Astronaut Health Monitoring dashboard.

## Endpoints

- `GET /api/health` — Health check
- `GET /api/astronauts` — List astronauts
- `GET /api/vitals/:id` — Get vitals for an astronaut
- `GET /api/watch-signals` — Get WATCH signals
- `POST /api/vitals` — Submit a vitals reading

## Setup

```bash
# Install dependencies
npm install

# Authenticate with Cloudflare
wrangler auth login

# Create D1 database
wrangler d1 create starplus-db

# Update database_id in wrangler.toml with the returned ID

# Apply migrations
wrangler d1 migrations apply starplus-db

# Develop locally
wrangler dev

# Deploy
wrangler deploy
```

## D1 Schema

See `schema.sql` for the minimal database schema (astronauts, vitals, watch_signals tables).

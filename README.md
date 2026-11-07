# STAR PLUS Backend

Cloudflare Worker + D1 API for the STAR PLUS astronaut health dashboard.

Live: https://starplus-backend.shareflow.workers.dev

## Endpoints

Reads are public. Writes need `Authorization: Bearer <API_KEY>`; if no `API_KEY`
secret is set, every write returns 503.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Health check |
| GET | `/api/astronauts` | All crew |
| POST | `/api/astronauts` | **Auth.** Create or update `{id, name, role, status?}`. `role`: `astronaut`, `flight_medical_officer`, `mission_control`. `status`: `active` (default), `standby`, `off-duty` |
| GET | `/api/vitals` | Latest readings across crew. `?astronaut_id=`, `?limit=` (default 50, max 500) |
| GET | `/api/vitals/:astronaut_id` | Latest readings for one crew member. `?limit=` |
| POST | `/api/vitals` | **Auth.** `{astronaut_id, heart_rate?, blood_pressure_systolic?, blood_pressure_diastolic?, oxygen_saturation?, temperature_c?, timestamp?}`. At least one measurement; BP values go together; `timestamp` (ISO 8601, optional) backfills an earlier reading. Recomputes that crew member's WATCH signals |
| GET | `/api/watch-signals` | Most severe first. `?astronaut_id=` |
| POST | `/api/watch-signals/recompute` | **Auth.** Recompute for all crew |

Example:

```bash
curl -X POST https://starplus-backend.shareflow.workers.dev/api/vitals \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"astronaut_id":"A-04","heart_rate":72,"oxygen_saturation":98}'
```

## WATCH signals

For each crew member and metric, the last 72 hours are compared with a baseline
built from the 30 days before that window (`src/watch.ts`):

- Needs at least 5 baseline readings and 1 reading in the window, otherwise no signal.
- z-score = (72h mean − baseline mean) / baseline SD (with a per-metric minimum SD so
  a very steady baseline doesn't turn noise into alerts). |z| ≥ 2 is WATCH, ≥ 3 is CRITICAL.
- Fixed limits on the 72h mean (for example SpO2 < 90 is CRITICAL) apply regardless of baseline.
- Recomputed after every reading and every 6 hours by cron, since the window slides.

These thresholds are a starting point for review, not clinical guidance.

## Setup

```bash
npm install
npx wrangler login
npm run d1:migrate:remote          # apply migrations/ to the live D1
npx wrangler secret put API_KEY    # key for write endpoints
npm run deploy
```

Local: put `API_KEY=...` in `.dev.vars` (gitignored), then `npm run d1:migrate:local && npm run dev`.

Tests: `npm test`. Schema lives in `migrations/` only.

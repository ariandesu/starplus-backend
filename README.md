# STAR PLUS Backend

Cloudflare Worker + D1 API for STAR PLUS, an offline-first astronaut self-check app.
Live: https://starplus-backend.shareflow.workers.dev

## Overview

Crew members log in with single-use access codes and sync self-check measurements,
results, reports and emergency reports. The Worker validates every record against a
shared catalog (`core/`), computes result statuses, and serves a flight-medical-officer
view plus a crew-wide progress figure. Photos attached to emergency reports are stored
in a private R2 bucket (`starplus-attachments`, deleted after 90 days) and served only
to the report's sender and the flight medical officer.

## Architecture

- `src/index.ts` — router. Sessions gate every endpoint by role (`astronaut`,
  `flight_medical_officer`, `mission_control`).
- `core/` — shared with the frontend via `tools/sync-core.sh`: catalog, record types,
  validation, `assess()`, the model contract, gamification rules, cited content and
  explanation templates. Both repos map `@starplus/core` to it; `diff -r
  starplus-backend/core starplus-frontend/core` must show nothing.
- `src/sync.ts` — batch intake with per-record accept/duplicate/reject reasons and
  cursor sync; `src/reports.ts` — reports, acknowledgements and attachments;
  `src/progress.ts` — `GET /api/crew/progress` (7-day crew readiness mean).
- `ml/` — model training and checks (Python 3.12); `tools/` — citation check, demo
  crew builder, pre-generation, catalog patches.

## Endpoints (self-check)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | Health check (checks D1) |
| POST | `/api/admin/crew`, `/api/admin/codes`, `/api/admin/revoke` | **API key.** Issue crew and single-use codes |
| POST | `/api/auth` | Exchange a code for a session token |
| POST | `/api/measurements/batch` | Auth. `{items, results}` with per-record reasons |
| GET | `/api/sync`, `/api/crew/results` | Auth. Cursor-paged reads |
| POST/GET | `/api/reports`, `/api/reports/ack` | Auth. Emergency and routine reports |
| POST | `/api/attachments` | Auth. `{id, report_client_id, content_type, data_base64}` image, max 2 MB |
| GET | `/api/attachments/<id>` | Sender and flight medical officer only |
| GET | `/api/crew/progress` | Auth. `{window_days: 7, readiness_pct}` |

Legacy dashboard routes (`/api/astronauts`, `/api/vitals`, `/api/watch-signals`) are
unchanged and still served.

## Data sources

All data is synthetic (see `docs/disclosure.md`). The catalog, knowledge base,
formulary and explanations are cited text in `core/content/`; `tools/check-citations.ts`
fails the build on a missing source. The model trains on
`ml/data/astronaut_health_SYNTHETIC.csv` (generated, see
`ml/data/how_data_was_generated.txt`).

## How to run

```bash
npm install
npx wrangler login
npm run d1:migrate:remote          # apply migrations/ to the live D1
npx wrangler secret put API_KEY
npx wrangler deploy
```

Local: `API_KEY=...` in `.dev.vars` (gitignored), then `npm run d1:migrate:local && npm
run dev`. Tests: `npm test` (core, routes). Static: `npm run typecheck`, `npm run
lint`. Content: `npx tsx tools/check-citations.ts`. Coverage of `core/` must stay ≥85%.

## How to swap the model

Follow `HANDOFF.md` §7 (2026-11-13 model swap runbook): download the hackathon dataset
into `ml/data/hackathon/` (do not commit it if its licence forbids it), write
`ml/maps/hackathon.yaml`, run `ml/labelled_rows.py` (or `ml/time_series.py`), then
`node ml/check_model.mjs core/content/model.json` must pass. Update `ml/MODEL_CARD.md`,
run `tools/sync-core.sh`, run both repos' tests, and deploy both apps. If anything
fails, revert `core/content/model.json` and redeploy; the app falls back to limits and
baselines.

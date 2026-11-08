# Phase 3 progress — settings, charts, surgeon, demo, explanations (in progress, NOT merged)

Phase 3 gate has NOT run yet: it needs staging access codes and a Meta API key,
both of which only the author holds. Do NOT merge `phase-3` until the gate passes.

## 1. Design items (Phase 3: 58–68) — implementation complete

- 58: `src/app/settings/page.tsx`, `src/lib/comms-link.ts` (setting, phase,
  mission start, blackout simulation, data notice).
- 59: `src/app/history/page.tsx` + baseline band and typical-range label in
  `vital-chart.tsx`.
- 60: `src/app/surgeon/page.tsx` (role-gated report list, acknowledge).
- 61: `src/app/demo/page.tsx` (demo store seeded from
  `core/content/demo-crew.json`, outbox disabled in demo mode, watermarked
  SYNTHETIC export); 62: `demo-badge.tsx` is now the full-width banner.
- 63: `tools/build-demo-crew.ts` → `core/content/demo-crew.json` (30-day
  synthetic crew from the synthetic CSV, deterministic).
- 64: `core/explain/filters.ts` + `templates.ts`.
- 65: `tools/pregenerate.ts` + `tools/prompts/` (reads `MODEL_API_KEY` from
  the environment per HANDOFF §3, never from a workspace file — see
  deviations log). Not run: needs the author's key.
- 66: `tools/review.ts` (list / approve / reject).
- 67: `core/test/explain.test.ts` + `tools/eval/cases.json` (invented dose,
  invented number, softened amber, invented interaction all rejected).
- 67a: `tools/load-import.ts` (posts a mapped CSV to a batch endpoint;
  ` --metric` selects columns, reruns are idempotent by deterministic IDs).
- 68 + G1: `test/e2e/cuj.spec.ts` (CUJ 1 offline, CUJ 2 under 60 s, CUJ 3
  grey first measure, CUJ 4 estimate + confirm, CUJ 5 offline explain, CUJ 8
  demo, offline-queued emergency report delivered after reconnect) and
  `test/e2e/gate-live.spec.ts` (API-level gate, already 4/4 on staging).
- Audit G-items: G2 `provenance_mismatch` reject + route test (server also
  returns crew provenance from `/api/auth` so the device labels records
  correctly — additive API change, recorded in deviations); G3 in-flight
  CPR keeps "100 to 120 compressions per minute, 5 to 6 cm deep";
  H1 staging CORS origins via request-scoped config.
- S1 shared-device login, S2 per-device PIN salt, W1 branch-aware
  cross-repo core check (carried over).

## 2. Checks (local, no codes needed)

- Backend: `npm test` 14 files pass; typecheck, lint clean; citation check
  green; coverage ≥85% lines on `core/`.
- Frontend: typecheck, lint clean; 52 vitest tests pass; `next build
  --webpack` succeeds.
- Playwright (Chromium, local build): CUJ 1 offline green, CUJ 8 demo green;
  staging specs skip cleanly without codes.
- CI green on both `phase-3` branches.

## 3. Phase 3 gate — STOPPED, needs the author

Not run (needs author-held secrets):
1. CUJ suite on Chromium and WebKit against staging (1 unused code each for
   stg-astro-1, stg-astro-2, stg-fmo-1 remain):
   `NEXT_PUBLIC_API_BASE=https://starplus-backend.shareflow.workers.dev npm run build && NEXT_PUBLIC_API_BASE=https://starplus-backend.shareflow.workers.dev STARPLUS_STAGING_CODE_ASTRO=<code> npx playwright test test/e2e/cuj.spec.ts`
   (`npx playwright install chromium webkit` first if needed).
2. Staging load test of 1,260 rows, e.g.:
   `python ml/column_map.py ml/data/astronaut_health_SYNTHETIC.csv ml/maps/synthetic.yaml /tmp/mapped.csv && tsx tools/load-import.ts --base https://starplus-backend-staging.shareflow.workers.dev --code <code> --crew stg-astro-1 --csv /tmp/mapped.csv --metric heart_rate`
   (reruns are duplicates by design).
3. Explanations: `MODEL_API_KEY=<key> npx tsx tools/pregenerate.ts`, review
   each entry with `npx tsx tools/review.ts list` / `approve`, which ships
   `core/content/explain-cache.json` with `reviewed` items only.
4. Then: merge both repos, deploy staging then production, smoke-test both
   (the Phase 3 gate also ends the minimum version with a production deploy).

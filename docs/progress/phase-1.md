# Phase 1 progress — core logic, model, server (2026-11-08, branch `phase-1`, NOT merged)

Blocked on the author (see §7). No SHAs of this report's own commit are recorded.

## 1. Design items (Phase 1: 12–39)

- Done: 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28,
  29, 30, 31, 32, 33, 34, 35, 36, 38.
- Partly: 37 (wrangler `[env.staging]` added with a `PLACEHOLDER` database id;
  the author must create `starplus-db-staging` and set its `API_KEY`).
- Not done here: 39 (`.dev.vars` already exists locally with `API_KEY`; route
  tests read it dynamically and fall back to a committed test value in CI).
- F2 probe removed: `core/src/probe*.ts` deleted, `core/src/index.ts` now
  re-exports catalog, record, assess and model.
- Deviation (safety limits, needs approval before merge): catalog limit
  entries gain an optional `max` bound; see `docs/designs/deviations.md`.
  The specified `{level, op, value}` any-match shape cannot express the
  table's bounded bands (SpO2 92–93, systolic 91–100, ...). No limit value,
  level or citation changed.

## 2. Commits

- Backend `phase-1` (this branch): `db2bd98` "Phase 1: core logic, model
  pipeline, server routes and tests", plus the pycache-cleanup commit.
- Frontend `phase-1`: synced `core/` and the vitest include fix (SHA in the
  frontend report at merge time).

## 3. Gate commands and results (local)

- Backend: `npm test` — 12 files, 67 tests pass. `npm run typecheck`
  (both configs) clean. `npm run lint` clean.
- `npx vitest run --coverage --project unit` — exit 0, lines 88.9% (gate:
  ≥85% on `core/`). Coverage cannot run under the routes project
  (`node:inspector`, known pool limitation), hence `--project unit`.
- Rehearse: `ml/rehearse.py` green (cv 0.89, heldout 0.85);
  `ml/test_rehearse.py` 1 passed (Python and Node reference predictions
  agree within 0.001).
- `node ml/check_model.mjs core/content/model.json` — ok (20 reference
  cases). Placeholder `model_version` 0.0.1, provenance `synthetic`.
- `ml/time_series.py` → `ml/out/` (gitignored); `apply-catalog-patch.ts`
  verified on a copy (version bump, limits byte-identical). Catalog v1
  ships WITHOUT the patch (no offsets), exactly as the design's Phase 1
  leaves it.
- Frontend: typecheck, lint clean; `npm test` 5 files, 32 pass;
  `npm run build` (`--webpack`) succeeds.

## 4. Migrations

- 0003 created, additive, old tables untouched. NOT applied yet: rule 8
  backup + apply needs the author's staging first (staging, then
  production).

## 5. Deviations

- `max` bound on limit entries (proposed, needs approval before merge).
- F4 demo-on-staging proposal still awaiting approval (Phase 0 fixes).

## 6. Known bugs / not verified

- Pool does not provision `[[ratelimits]]` bindings, so the 429 path is
  covered by a unit test with a mock limiter, not end to end. Production
  enforcement is platform-side; confirm on staging.
- Rate-limit state: tests use distinct `CF-Connecting-IP` values per file
  in case the pool shares limiter state across files.
- Route-test D1 is fresh per test: every test sets up its own rows.
- `daily_cap_reached` path is implemented but not exercised (5,000 inserts
  are too slow for a unit test); `retry_after` logic is straightforward.
- `wrangler deploy --dry-run` re-verified after the server rewrite at
  deploy time.

## 7. Blocked on the author — STOP

1. Approve the `max`-bound deviation (safety limits) and the F4 deviation.
2. Create staging: `npx wrangler d1 create starplus-db-staging` (put the id
   in `[env.staging]`), then `npx wrangler secret put API_KEY --env staging`.
3. Issue access codes for test and real crew (`POST /api/admin/codes`).
4. After that I will: backup + apply 0003 to staging then production,
   deploy, smoke-test, merge both repos, and update this report.

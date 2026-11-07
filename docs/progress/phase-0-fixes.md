# Phase 0 fixes — audit F1–F6 (2026-11-08)

Fixes land on branch `phase-0-fixes` in each repo (backend `d015c78`,
frontend `f5ffb37`). No new SHAs are recorded inside their own commits (audit
F5); merge ranges will be noted in the Phase 1 report.

## F1 — Route tests run in the Workers pool (High, blocks Phase 1 gate)

- `vitest.config.ts` rebuilt with `defineWorkersProject` from
  `@cloudflare/vitest-pool-workers/config`; the `routes` project reads
  migrations with `readD1Migrations("./migrations")` into a `TEST_MIGRATIONS`
  miniflare binding. The `unit` project stays on node.
- `test/setup/apply-migrations.ts` now runs in the Workers runtime:
  `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)` from `cloudflare:test`
  (no `node:fs`).
- Added `test/env.d.ts` (`ProvidedEnv`: `DB`, `TEST_MIGRATIONS`) and
  `test/routes/health.test.ts`: `GET /api/health` returns ok via `SELF`, and
  `astronauts`/`vitals`/`watch_signals` tables exist.
- Gate: `npm test` — 3 files, 19 tests pass (checksum 1, logic 16, routes 2).

## F2 — Core probe passes all four toolchains (High)

- `allowImportingTsExtensions: true` added to the frontend `tsconfig.json`.
- Probe in `core/`: `src/probe.ts` (`.ts`-extension re-export) and
  `src/probe-data.json` (imported with `with { type: "json" }`).
  Remove it when the real Phase 1 modules land.
- Proved: backend `npm run typecheck` (both configs) clean;
  `npx wrangler deploy --dry-run` bundles; frontend `npm run build`
  (`--webpack`) succeeds; `/usr/local/bin/node core/src/index.ts`
  (Node v24.18.0) runs.
- `npm run build` added to the frontend CI (also covers the F6 note: the
  Playwright `webServer` gets a fresh build in the same job).

## F3 — Full sync and strict checksum (Medium)

- `tools/sync-core.sh` copies all of `core/` except `core.sha256`, then
  rehashes and copies the hash to the frontend.
- Both checksum tests now list every file under `core/` recursively and fail
  on any unlisted, missing or changed file (verified: probe files included,
  5 entries).
- Frontend CI downloads `core/core.sha256` from the backend's `main` and
  `diff`s it. Merge order: backend first, then frontend.

## F4 — Demo scenes on staging (Medium, needs author approval)

- `docs/designs/deviations.md` proposes: CUJ 1, 2, 4, 6, 7 recorded on
  staging with a `tools/load-import.ts`-loaded staging crew (provenance
  `synthetic`); the comms-link simulation works in every mode; only CUJ 8
  uses demo mode. `docs/demo-script.md` unchanged pending approval.
- **Status: proposed — author approval requested. Phase 1 starts on core
  logic/server items, which this does not touch.**

## F5 — Phase 0 report corrected (Low)

- `docs/progress/phase-0.md` §2 rewritten: merge ranges
  (`a3edb39..c8d1dac`, `ad79331..2899a97`) instead of a commit's own ID.

## F6 — Hygiene (Low)

- `@eslint/js` added to backend devDependencies (was imported, undeclared).
- Backend `tsconfig.json` is now `src/` + `core/` with Workers types only;
  new `tsconfig.test.json` covers `test/`, `tools/`, `vitest.config.ts`
  with Node types (+ Workers types for `D1Database`). `npm run typecheck`
  runs both.
- `verbatimModuleSyntax: true` added per the design's core source rules.

## Deploy / verify

- Backend deployed from the fixes branch (identical to merge result):
  version `e5cc1f64-0d98-4317-9d80-e64faff29e32`, `/api/health` ok.
  No migrations (rule 8: no backup needed). No `src/` route changes.
- Frontend ships via Vercel on merge to `main`.

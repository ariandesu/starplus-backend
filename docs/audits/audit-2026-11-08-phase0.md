# Audit: Phase 0 (2026-11-08)

**Auditor:** Claude · **Builder report:** `starplus-backend/docs/progress/phase-0.md`
**Scope:** design items 1–11, 8a, 8b; HANDOFF rules; live deployments.
**Verdict:** Phase 0 is accepted with **3 fixes required before Phase 1 work starts**
(F1–F3). Everything the report claims was reproduced.

## What was verified

| Check | Result |
|---|---|
| Commits on `main` (backend `c8d1dac`, frontend `2899a97`) | Authored `ariandesu <mahirfaisalarian@gmail.com>`; no AI co-author or attribution lines; phase branches used; no force-push |
| Design items present | 1–11, 8a, 8b all present |
| `core/` copies | Identical in both repos; checksums match |
| `npm ci`, typecheck, lint, tests (run by the auditor) | Backend: clean, 17 tests pass. Frontend: clean, 1 test passes |
| GitHub Actions | Green on `phase-0` and `main` in both repos |
| Vercel | Deployment for `2899a97` succeeded; home page 200 |
| Worker | `/api/health`, `/api/astronauts`, `/api/watch-signals` unchanged (200) |
| Rules (HANDOFF §5) | No migrations, no route or scoring changes, no secrets committed, `ml/` still untracked (correct until item 28) |

## Findings

### F1 — High — Route tests cannot run (blocks the Phase 1 gate)

*   **Evidence:** a probe route test in a scratch copy failed with
    `Failed to load url cloudflare:test`. The `routes` project sets
    `pool: "@cloudflare/vitest-pool-workers"` as a plain string, which does not add the
    pool's Vite plugin. The report's "no route tests yet" hid this.
*   Also: `test/setup/apply-migrations.ts` uses `node:fs` (not available inside the Workers
    runtime where setup files run), and only exports a function that nothing calls, so no
    migration would be applied.
*   **Fix:** build the routes project with `defineWorkersProject` (or `defineWorkersConfig`)
    from `@cloudflare/vitest-pool-workers/config`. In the config, read migrations with
    `readD1Migrations("./migrations")` and pass them as a binding (for example
    `TEST_MIGRATIONS`) under `poolOptions.workers.miniflare.bindings`. In the setup file:
    `import { applyD1Migrations, env } from "cloudflare:test"; await
    applyD1Migrations(env.DB, env.TEST_MIGRATIONS);`. Add `test/env.d.ts` declaring
    `ProvidedEnv`. Add one real route test (`test/routes/health.test.ts`) so the gate
    proves the pool works.

### F2 — High — Frontend typecheck and Vercel build will fail once `core/` has real modules

*   **Evidence:** in a scratch copy, adding `export { A } from "./a.ts"` and a JSON import
    with `with { type: "json" }` to `core/src/index.ts` (both required by the design's
    "core/ source rules") made `tsc --noEmit` fail with TS5097, and
    `next build --webpack` stop with "Failed to type check". Webpack itself compiled
    (JSON import attributes are fine).
*   **Fix:** add `"allowImportingTsExtensions": true` to the frontend `tsconfig.json`
    (`noEmit` is already set). Before writing Phase 1 modules, commit a small probe in
    `core/` (a `.ts`-extension import and a JSON import with attributes) and prove it in all
    four toolchains: backend `tsc`, `npx wrangler deploy --dry-run`, frontend
    `npm run build`, and `node core/src/index.ts` under Node 24.
*   Add `npm run build` to the frontend CI so this class of failure shows up before Vercel.

### F3 — Medium — Shared-code sync and checksum leave gaps that Phase 1 will hit

*   **Evidence:** in a scratch copy, adding a new file to `core/src/` without re-syncing
    still passed the checksum test. The test only checks files already listed in
    `core.sha256`.
*   `tools/sync-core.sh` copies only `package.json`, `tsconfig.json` and `src/`. The design
    puts the catalog, knowledge base, formulary, `model.json`, explanation cache and demo
    crew under `core/content/`, so none of that would reach the frontend or be checksummed.
*   Each repo only checks itself; nothing detects the two repos drifting apart.
*   **Fix:**
    *   Sync the whole `core/` directory except `core.sha256`.
    *   The test must list every file under `core/` and fail if any file is unlisted,
        missing, or changed.
    *   Frontend CI downloads `core/core.sha256` from the backend's `main`
        (`https://raw.githubusercontent.com/ariandesu/starplus-backend/main/core/core.sha256`)
        and fails if it differs.

### F4 — Medium — Demo script does not say which environment each scene runs in

*   The design says the outbox is disabled in demo mode, but CUJ 7 needs a report delivered
    and acknowledged. CUJ 2 needs 30 days of history. And the comms-link simulation is
    described as a demo-mode behaviour, while CUJ 1 also needs it.
*   **Fix:** add an entry to `docs/designs/deviations.md` proposing:
    *   Scenes CUJ 1, 2, 4, 6 and 7 are recorded against **staging**, with a staging crew
        whose 30-day history is loaded with `tools/load-import.ts` (provenance
        `synthetic`, staging only).
    *   The comms-link simulation toggle in settings works in every mode.
    *   Only CUJ 8 uses demo mode.

    Update the script to match after the author approves.

### F5 — Low — Progress report SHA does not match `main`

The report lists `3526806`, which is not on `main` (`main` has `c8d1dac`). Don't record a
commit's own SHA inside that commit. Put final SHAs in the next report, or in a follow-up
commit that only touches the report.

### F6 — Low — Hygiene

*   `eslint.config.mjs` imports `@eslint/js`, which is not a declared devDependency. Add it.
*   The backend `tsconfig.json` now gives `src/` Node types. Worker code could use Node APIs
    without a type error. Split the config: `tsconfig.json` for `src/` with Workers types
    only, and `tsconfig.test.json` for `test/` and `tools/` with Node types.
*   The Playwright `webServer` runs `npm run start`, which needs a build first. Make sure CI
    builds before e2e in Phase 3.

### F7 — Info

*   The workspace copy of the design (`Starplus v2/docs/designs/`) is now superseded. The
    source of truth is `starplus-backend/docs/designs/self-check-platform.md`, and HANDOFF
    links have been updated to it.
*   The CSS-only marquee rewrite is fine. The component is deleted in Phase 2 anyway.

## Direction

Start Phase 1 only after F1–F3 are fixed and proven. Raise F4 as a deviation for the
author. Fix F5 and F6 along the way. No change to the design is needed for F1–F3: they
implement what the design already requires.

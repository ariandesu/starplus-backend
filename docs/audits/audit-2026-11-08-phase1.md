# Audit: Phase 0 fixes and Phase 1 branch (2026-11-08)

**Auditor:** Claude · **Builder reports:** `docs/progress/phase-0-fixes.md`, `docs/progress/phase-1.md`
**Branches:** backend `main` `ba77e28`, `phase-1` `c588e00`; frontend `main` `f5ffb37`, `phase-1` `51c6040`
**Verdict:** Phase 0 fixes **accepted** (F1–F3, F5, F6 done; F4 awaiting author).
Phase 1 is **acceptable to merge once P1 and P2 below are fixed and the author steps are
done**. Code quality is good; the safety logic behaves as designed.

## Phase 0 fixes — verified

| Finding | Status | Evidence |
|---|---|---|
| F1 route tests | Fixed | 5 route test files run in the Workers pool with migrations applied (auditor run) |
| F2 `.ts` imports | Fixed | Frontend tsconfig flag added; core now uses `.ts` and JSON imports; backend typecheck, `wrangler deploy --dry-run` (81.9 KiB) pass |
| F3 sync and checksum | Fixed | Strict manifest; frontend CI compares with backend `main` (that check is red on `phase-1` until backend merges — expected) |
| F5, F6 | Fixed | Report corrected; `@eslint/js` declared; tsconfig split |

Process note: the fixes Worker was deployed from the branch before merge. HANDOFF says
merge after the gate, then deploy. No harm done; follow the order from now on.

## Phase 1 — what the auditor ran

| Check | Result |
|---|---|
| Typecheck, lint | Clean |
| `vitest` (unit + Workers routes) | 12 files, 67 tests pass |
| Coverage on `core/` | 88.9% lines (gate 85%) |
| `npm run rehearse`, `pytest ml/` | Pass; rehearsed model passes all loader checks |
| `wrangler deploy --dry-run` | Bundles (81.9 KiB) |
| Commits | `ariandesu`, no AI attribution |
| Catalog vs design limit table | All 9 limited measures match exactly; 10 baseline-only measures have no limits; every limit cited |
| Boundary probe (25 values) | Correct: SpO2 96/94 grey, 93/92 watch, 91 critical; HR 111 and 130 watch, 131 and 40 critical; systolic 100 and 140 watch, 90 and 180 critical; temperature 39.1 watch, 35.0 critical; respiratory rate 21 watch, 25 critical; glucose 69 and 200 watch, 53 critical |
| CUJ 3 (no baseline) | Values within limits are grey; values over a limit are coloured |
| CUJ 4 (estimate) | HR 128 estimate → watch, `estimate_abnormal`, `confirm_required: true` |
| Model | Contract fields present, 20 reference cases, `provenance: synthetic`; features use each person's earlier rows only (no leakage); model card says the numbers are not clinical evidence |
| Migration 0003 | Matches the design tables (incl. `results.received_at`; `access_codes` has no role); old tables untouched |
| Legacy routes and cron | Still present and unchanged |

## Findings

### P1 — Medium — Phase offsets are missing from the catalog

Every measure has `phase_offsets: {}`. The design requires in-flight baseline shifts for
core temperature (+1.0 °C, Stahn et al., *Scientific Reports* 2017) and systolic pressure
(−14 mmHg, Circulation 2019). Without them, a pre-flight baseline makes normal in-flight
values look abnormal.
**Fix:** add `inflight: {baseline_shift: 1.0}` for `temperature_c` and
`inflight: {baseline_shift: -14}` for `blood_pressure_systolic`, each with its citation.
Add a test that a pre-flight baseline of 36.8 °C does not raise a 37.8 °C in-flight
reading, and keep the test that limits never change.

### P2 — Medium — Shared-device 24-hour sessions not implemented

`src/auth.ts` gives every session 30 days. The design requires 24 hours on a device marked
"shared" (privacy mitigation in the Risks table).
**Fix:** `POST /api/auth` accepts `shared: boolean`; `shared: true` gives a 24-hour expiry.
Add a route test for both.

### P3 — Low — Staging will run the old cron

`[env.staging]` has no `triggers`. Triggers are inherited, so staging runs the 6-hourly
legacy cron. **Fix:** add `[env.staging.triggers]` with `crons = []`, as the design states.

### P4 — Low — Rate limiting fails open when a binding is missing

`checkRateLimit` returns "allowed" if the binding is undefined. That is what lets the tests
run, but a misconfigured production deploy would silently have no limits.
**Fix:** when `ENVIRONMENT` is `production` or `staging` and the binding is missing,
return 503 on `/api/auth` and log an error; keep the test path as is.

### P5 — Low — One measure can appear twice in a result

A refuted estimate is added to `per_measure` as a separate row for the same metric. The
Phase 2 result screen would show two rows for heart rate.
**Fix:** put the refuted value inside the metric's row (for example `values.refuted:
[{client_id, value}]`), or make the UI merge rows by metric. Decide before Phase 2 screens.

### P6 — Info

*   Baseline SD uses the population formula (divide by n). Fine; note it in the model card or
    catalog comments so it is not "fixed" later by accident.
*   The frontend `phase-1` CI failure is the expected cross-repo check; it turns green when
    backend `main` has the new `core/`.

## Deviations — author decision (2026-11-08)

Both deviations **approved** by the author. The `max` bound stays; the auditor's
recommendation to reject it is recorded below for reference only. Condition from the
audit: keep the 25-value boundary check as a test so the bounded bands stay correct.

## Deviations — auditor's recommendation (superseded by the author decision)

*   **Optional `max` bound on limits — recommend reject.** The design's shape already
    expresses every band, because critical is checked before watch: SpO2 watch `<= 93`
    (critical `<= 91` catches 91 and below), heart rate watch `>= 111` (critical `>= 131`
    catches the top), respiratory rate watch `>= 21`, systolic watch `<= 100` and `>= 140`.
    The deviation's premise ("a `>= 92` ray matches 97") comes from encoding the band in the
    wrong direction. Rejecting it keeps one limit shape across the catalog, the pipelines and
    the patch tool. Approving it is not unsafe (all values are identical), so this is the
    author's call. If rejected: re-encode those four bands, remove `max` from the loader and
    types, and keep the 25-value boundary probe as a test.
*   **Demo scenes on staging (F4) — recommend approve.** It resolves a real contradiction in
    the design with no rule impact.

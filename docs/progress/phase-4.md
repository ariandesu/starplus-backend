# Phase 4 progress — tests, import, body map, domains

## W1–W6 fixes (audit-2026-11-08-phase3h, do not merge)

- W1: explicit per-metric accepted units for FHIR (UCUM `code` read first,
  then `unit`); converts °C-variants and [degF]/°F to °C, mg/dL and mmol/L
  to mg/dL; everything else rejected, including empty and unknown units.
- W2: shared `validateRecord` mirrors the server (catalog bounds, unit,
  future timestamp, provenance); every adapter calls it and reports the
  server's reasons; FHIR skips non-final/amended/corrected entries.
- W3: imports belong to the logged-in crew only (`wrong_crew` otherwise);
  `provenance` is required, from the session; SYNTHETIC data_source with a
  non-synthetic crew is rejected as `provenance_mismatch`.
- W4: "Other ways" section on /check links to questionnaire, reaction
  test, and the new /import page (CSV with per-column mapping table,
  FHIR Bundle/Observation or JSON array, preview with counts, offline
  capable). E2E: CSV with one bad row shows preview counts and imports;
  reaction test completes offline.
- W5: Body item in nav; /body, /check/questionnaire, /check/reaction and
  /import added to precache and the offline test.
- W6: reaction records share one `capture_id`; CSV rows without a timestamp
  are rejected (`missing timestamp`); FHIR BP panels share one
  `capture_id` across systolic/diastolic.
- Counts: unit 110 frontend (incl. W1 probe cases, W2/W3/W6 coverage) +
  89 backend; typecheck clean; lint 0 errors; `build:staging` clean;
  offline suite 2 passed Chromium + 2 passed WebKit; new import e2e
  2 passed Chromium + 2 passed WebKit. CUJ suite NOT run (no staging
  codes; the auditor reruns it). NOT merged.

Phase 4 is stretch (items 69–72, all frontend). Gate: adapter tests green.

## 1. Design items (Phase 4: 69–72) — implementation complete

- 69: `src/lib/adapters/questionnaire.ts` — 4-question self-check
  (sleep_hours, mood_score, stress_score, sleep_quality) producing one
  `Measurement` per answer with a shared `capture_id` and source
  `questionnaire`. `src/lib/adapters/reaction-test.ts` — tap-time median
  dropping the first (practice) tap, producing a `reaction_time`
  measurement with source `test`.
- 69: `src/lib/adapters/import-csv.ts` — header-based CSV import mapping
  canonical catalog codes plus a `SYNTHETIC_COLUMNS` map mirroring
  `ml/maps/synthetic.yaml`. Canonical codes only (explicit, since an
  alias such as `body_weight_lb` carries the wrong unit); BP pairs from
  the same row share a `capture_id`; non-numeric values are rejected per
  cell; unmapped columns are ignored. `src/lib/adapters/import-fhir.ts`
  — FHIR Bundle / single Observation / array import with a LOINC map
  (heart rate, BP pair, SpO2, temperature with °F→°C, respiratory rate,
  glucose), per-item rejected reasons; nothing sent, nothing stored.
- 70: `src/app/body/page.tsx` + `src/components/body-map.tsx` — clickable
  SVG figure plus a per-system list with latest values; systems with no
  data render grey ("No data yet").
- 71: `src/app/history/page.tsx` — All / Radiation / Nutrition / Exercise
  filter chips over the charts (`radiation_dose`; `calories` +
  `water_intake`; `physical_activity`).
- 72: `test/adapters.test.ts` — synthetic CSV excerpt to catalog
  measures (BP pair shares one `capture_id`), catalog-code headers with
  per-row crew/timestamp, invalid-cell rejection, FHIR Bundle import with
  rejections, °F→°C conversion, questionnaire validation, reaction median
  and record, body-system catalog coverage and grey-state.

## 2. Checks

- Backend: 89 tests pass (no backend changes this phase); typecheck clean;
  lint 0 errors (2 warnings); `build:staging` clean.
- Frontend: 93 unit tests pass (`test/adapters.test.ts` 13 incl. body-map
  coverage); typecheck clean; lint 0 errors (2 pre-existing warnings);
  `next build --webpack` (staging) succeeds.
- Playwright (local build): offline suite 2 passed on Chromium and WebKit.
- CUJ suite NOT run (needs staging codes; the auditor reruns it).

## 3. Phase 4 gate — STOPPED at the gate, awaiting audit

Gate: adapter tests green — PASS (`test/adapters.test.ts`, 13 tests,
local run).

Not run (needs author-held secrets/codes):
1. CUJ suite against staging on both browsers with fresh codes.
2. Merge `phase-4` in both repos, deploy staging then production, smoke test.

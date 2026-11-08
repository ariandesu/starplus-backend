# Phase 5 progress — Bluetooth, voice, gamification, medicines, crew progress

Phase 5 is stretch (items 73–78, 75a). Gate: BLE parser and voice tests green;
formulary citation check green.

## Item 73 — BLE profiles, parser, simulator (frontend)

- `src/lib/adapters/ble-profiles.ts`: six standard health profiles
  (heart-rate, blood-pressure, thermometer, glucose, pulse-oximeter,
  weight-scale) with service/measurement UUIDs, plus a typed
  `requestBleMeasurement` helper using Web Bluetooth.
- `src/lib/adapters/ble-parse.ts`: parsers for the six GATT characteristics
  (SFLOAT/FLOAT decode, timestamps, kPa→mmHg, °F→°C, mol/L→mmol/L,
  kg/L→mg/dL, lb→kg), returning canonical catalog metrics. Returns `null`
  on truncated input.
- `src/lib/adapters/ble-simulator.ts`: deterministic byte generators for
  all six profiles used by the tests.
- Added devDependency `@types/web-bluetooth`.

## Item 74 — voice number grammar (frontend)

- `src/lib/adapters/voice.ts`: `parseSpokenNumber` (cardinals to
  thousands, "point"/"dot" decimals, minus/negative, "and" ignored) and
  `extractReadings` (number words with bpm/mmHg/%/degC/degF/kg/lb units,
  falling back to a bare number).

## Item 75 — gamification core (backend, synced to frontend)

- `core/src/gamification.ts`: pure functions over the event log.
  `scoreDays` awards one point each per local day for a completed check-in
  (whatever the result), an exercise session (`physical_activity`), logged
  sleep (`sleep_hours`/`sleep_quality`) and logged hydration
  (`water_intake`/`urine_specific_gravity`);estimates, synthetic or
  simulated_device provenance and voided rows earn nothing; capped at 4
  points/day. `streakDays` counts trailing active days with one rest day
  per week. `patchesForStreak` unlocks patches at 7/14/30/90 days.
- `core/test/gamification.test.ts`: 13 tests.

## Item 75a — GET /api/crew/progress (backend)

- `src/progress.ts` + route in `src/index.ts`: any authenticated crew
  session. For each crew member whose latest result is not watch or
  critical: days in the last 7 with at least one check-in, divided by 7;
  the route returns the mean as `{window_days: 7, readiness_pct}`.
- `test/routes/progress.test.ts`: 401 without a token; 3/7 days for one
  nominal crew while a 7/7 watch crew is excluded → 42.9.

## Item 76 — progress page and readiness ring (frontend)

- `src/components/readiness-ring.tsx`: four-segment SVG ring (check-in,
  exercise, sleep, hydration) with a done/total label.
- `src/app/progress/page.tsx`: today's ring from local IndexedDB via
  `scoreDays`, streak and patches, crew-wide percentage from the server,
  and a gamification on/off toggle (per-device). New nav items Progress
  and Medicines; both pages precached.

## Item 77 — formulary and medicines page

- `core/content/formulary.json` already shipped with cited entries; the
  citation check validates every entry (version, word-for-word dose rule).
- `src/app/medicines/page.tsx`: offline formulary list with purpose, side
  effects, interactions, dose and cited sources.

## Item 78 — BLE and voice tests (frontend)

- `test/ble.test.ts` (19 tests): six profiles listed; every parser
  round-trips simulator bytes, incl. 16-bit heart rate, kPa→mmHg,
  °F→°C, lb→kg; truncated input rejected.
- `test/voice.test.ts` (13 tests): numbers to thousands, decimals,
  negatives, rejections; unit extraction and fallback.

## Counts

- Frontend unit 160/160 (incl. 13 gamification, 19 BLE, 13 voice);
  backend 104/104 (incl. 13 gamification, 2 progress route).
- Typecheck clean both repos; lint 0 errors (2 pre-existing demo
  warnings); citation check ok; `build:staging` clean with /progress and
  /medicines prerendered.
- Offline/e2e suites NOT run (no changes to sync, SW routing or forms;
  the auditor reruns at the gate). NOT merged.

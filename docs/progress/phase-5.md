# Phase 5 progress — Bluetooth, voice, gamification, medicines, crew progress

Phase 5 is stretch (items 73–78, 75a). Gate: BLE parser and voice tests green;
formulary citation check green.

## Y1–Y7 fixes (audit-2026-11-08-phase5, do not merge)

- Y1: crew progress uses a 7-date window (today plus the 6 days before),
  caps each fraction at 1, counts only real astronauts, and picks the latest
  result per crew with `ORDER BY assessed_at DESC, client_id DESC LIMIT 1`.
  Route tests: an 8-day daily checker → 100.0; a synthetic crew ignored; a
  watch-latest crew excluded.
- Y2: `decodeSfloat` and FLOAT decode return `null` for the reserved NaN,
  NRes and ±INF codes; weight `0xFFFF` → `null`; parsers return `null` (or
  drop the field) for reserved values. Tests use the exact audit bytes.
- Y3: glucose always returns mg/dL (kg/L × 100,000, mol/L × 18,015.59) and
  applies the sint16 time offset to the base time. Tests cover both unit
  flags and the offset with independent bytes.
- Y4: every parser returns the catalog unit string (notably temperature
  `°C`); one test asserts each parser's output unit equals
  `lookupMeasure(metric).unit`.
- Y5: `extractReadings` finds a metric keyword (heart rate, blood pressure,
  oxygen, temperature, glucose, weight, breathing rate) with the number
  after it; "X over Y" yields a systolic/diastolic pair ("one twenty" = 120
  only in a BP context); the unit comes from the metric. An 11-phrase table
  test covers the five audit phrases plus five more.
- Y6: `/check/bluetooth` (profile picker, `requestDevice` + notifications,
  heart-rate streams downsampled to one value per minute, Simulator button
  recording `simulated_device`, preview → `validateRecord` → result; the
  Connect button alone is greyed with the no-Web-Bluetooth reason) and
  `/check/voice` (mic → transcript → `extractReadings` → editable preview
  → result; greyed with the no-speech-recognition reason, noting the
  network need). Both linked from "Other ways", precached, in the offline
  route test. E2E: simulator saves a BP pair → result; voice mic shown when
  supported, greyed reason when the API is removed.
- Y7: core check-ins count only with an eligible `per_measure` record
  (real, not an estimate, not voided), with a test; the same gamification
  switch lives on `/progress` and `/settings` via a shared stored value;
  `/progress` and `/medicines` added to the offline route test.

## Items 73–78, 75a (as built)

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

- `test/ble.test.ts` (21 tests): six profiles listed; every parser
  round-trips simulator bytes, incl. 16-bit heart rate, kPa→mmHg,
  °F→°C, lb→kg; reserved SFLOAT/FLOAT/weight rejected; catalog units;
  truncated input rejected.
- `test/voice.test.ts` (38 tests): numbers to thousands, decimals,
  negatives, rejections; keyword extraction, BP pairs and the 17-phrase table.

## Z1 fix (audit-2026-11-08-phase5b, do not merge)

- `parseSpokenNumber`: a units word (one–nine) followed directly by a tens
  word (ten–ninety, with an optional units word) or by "oh" plus a units
  word reads as hundreds: "one thirty five" = 135, "one oh five" = 105,
  "two ten" = 210. "Thirty five" and "one hundred thirty five" unchanged.
- Tests: 135/85, 105/70, 140/90, 95/60, "pulse one oh two" = 102,
  "thirty five" = 35.
- bluetooth-voice.spec.ts 3/3 on Chromium and WebKit.

## Z3 fix (audit-2026-11-08-phase5b round 2, do not merge)

- `/check/voice`: a reading with no metric starts with an empty "Choose a
  measure" option, never `heart_rate`; Save stays disabled until every row
  has a measure (`previewReady`); no default metric anywhere. Pure helpers
  `transcriptToPreview`/`previewReady` in the voice adapter.
- Tests: transcript "one thirty" gives a row with no measure and Save is
  disabled; "pulse sixty six" is ready to save.

## Counts

- Frontend unit 190/190 (incl. 14 gamification, BLE reserved/unit/glucose
  and 17-phrase voice coverage, Z3 preview gating); backend 106/106 (incl. 14 gamification,
  3 progress route).
- Typecheck clean both repos; lint 0 errors (2 pre-existing demo
  warnings); citation check ok; `build:staging` clean with /check/bluetooth,
  /check/voice, /progress and /medicines prerendered.
- Offline routes 2/2 Chromium + 2/2 WebKit; import e2e 3/3 both;
  bluetooth/voice e2e 3/3 both. offline-form/sync skip (need staging codes).
  CUJ suite NOT run (needs staging codes; the auditor reruns it). NOT merged.

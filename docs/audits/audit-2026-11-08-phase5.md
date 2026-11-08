# Audit: Phase 5 gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-5` `b44638b`, frontend `phase-5` `c1d8f61`
**Verdict:** **The gate passes as written** (BLE and voice tests green, citations ok). But
probes with bytes built independently from the GATT specs, and with natural speech, show
real defects. The crew progress figure can exceed 100% and counts synthetic test crew.
As in Phase 4, Bluetooth and voice have no screen. Fix Y1–Y7 before merging. Phase 5 is
due 2026-11-12 morning.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| Checks | Frontend unit 160/160 ×3; backend 104/104; `check-citations` ok; typecheck clean; lint 0 errors; `core/` identical; CI success on both heads; staging build ok |
| No regressions | CUJ Chromium 3/3, WebKit 3/3 (real staging logins); import e2e 6/6; offline suite 4/4 |
| Valid BLE readings | HR 8-bit, 16-bit and with RR intervals; BP mmHg and kPa (16.0 kPa → 120 mmHg); BP with pulse; temperature °C and °F (98.6 → 37.0); glucose mol/L (5.5 mmol/L); PLX 98 % / 72; weight SI (70 kg) and imperial (154.32 lb → 70 kg). **All correct.** |
| Gamification core | Points: check-in, exercise, sleep, hydration; cap 4/day; measurements must be real, not estimates, not voided; streak with 1 rest day/week; patches at 7/14/30/90. |
| Medicines page | Shows purpose, side effects, interactions, dose ("per flight surgeon / mission protocol") and citations, from the Phase-2-audited formulary. |
| Progress switch | Per-device off switch on `/progress`. |

## Findings

### Y1 — High — The progress endpoint can exceed 100% and counts synthetic crew

*   **Auditor's route probe:**
    *   one real crew member who checks in every day → `readiness_pct: 114.3`;
    *   adding one **synthetic** crew member with a single check-in → `64.3`.
*   **Cause 1:** `windowStart` is the date 7 days ago, and `>=` includes today. So the window
    spans **8** calendar days, divided by 7.
*   **Cause 2:** every crew member with a result is included. The design says synthetic data
    earns nothing. Production already has the synthetic `smoke-prod-1`.
*   **Fix:**
    *   window = today and the 6 days before it (7 dates); cap each fraction at 1;
    *   include only crew with `crew.provenance = 'real'` and `role = 'astronaut'`;
    *   pick the latest result per crew with `ORDER BY assessed_at DESC, client_id DESC
        LIMIT 1` (no duplicate rows on equal timestamps);
    *   route tests: a daily checker for 8 days → 100.0; a synthetic crew member is ignored;
        a crew member whose latest result is watch is excluded.

### Y2 — High — BLE parsers read "no value" codes as numbers

*   Probe results:
    *   SFLOAT `0x07FF` (NaN) as BP systolic → **2047 mmHg**;
    *   FLOAT `0x007FFFFF` (NaN) as temperature → **8,388,607 °C**;
    *   weight `0xFFFF` ("measurement unsuccessful") → **327.68 kg**.
*   **Fix:**
    *   `decodeSfloat` / FLOAT return `null` for the reserved values:
        *   SFLOAT: `0x07FF` NaN, `0x0800` NRes, `0x07FE` +INF, `0x0802` −INF, `0x0801`
            reserved;
        *   FLOAT: `0x007FFFFF`, `0x00800000`, `0x007FFFFE`, `0x00800002`, `0x00800001`;
    *   weight: `0xFFFF` → `null`;
    *   each parser returns `null` (or drops that field) when a needed value is `null`;
    *   add tests with these exact bytes.

### Y3 — High — Glucose in kg/L is labelled mmol/L

*   A kg/L reading of 100 mg/dL (SFLOAT 100e-5) comes back as `value: 100, unit: "mmol/L"`.
    If anything later converts mmol/L to mg/dL, that is **1,800 mg/dL**.
*   The time offset (flag bit 0) is also ignored: a reading with a +5 min offset keeps the
    base time.
*   **Fix:**
    *   always return **mg/dL**, the catalog unit: kg/L × 100,000, and mol/L × 18,015.59;
    *   apply the time offset (sint16 minutes) to the base time;
    *   tests with independent bytes for both unit flags and the offset.

### Y4 — Medium — Unit labels do not match the catalog

*   Temperature returns `unit: "degC"`, while the catalog unit is `°C`. `validateRecord`
    (Phase 4) rejects a unit mismatch as `invalid_schema`, so every BLE temperature would be
    rejected once connected.
*   **Fix:** every parser returns the catalog's unit string exactly. Add one test that each
    parser's output unit equals `lookupMeasure(metric).unit`.

### Y5 — Medium — Voice understands almost nothing a person would say

| Spoken | `parseSpokenNumber` | `extractReadings` |
|---|---|---|
| "seventy two beats per minute" | null | 72 bpm ✔ |
| "my heart rate is seventy two" | null | — |
| "one twenty over eighty" / "one hundred twenty over eighty" | null | — |
| "oxygen ninety eight percent" | null | — |
| "temperature thirty seven point two" | null | — |

*   **Fix:**
    *   `extractReadings` finds a **metric keyword** (heart rate/pulse; blood pressure or
        "X over Y"; oxygen/saturation/SpO2; temperature; glucose/sugar; weight; breathing
        rate) and the number after it;
    *   "X over Y" → a systolic and diastolic pair;
    *   number words inside longer phrases must parse ("one twenty" = 120 only in a BP
        context);
    *   the unit comes from the metric, not only from a spoken unit;
    *   add a table test with at least the five phrases above, plus 5 more.
    *   Raw transcripts stay on the device (design).

### Y6 — Medium — Bluetooth and voice have no screen

*   No page imports `ble-*` or `voice`. The design's "Other ways" lists Bluetooth (six
    profiles plus a simulator) and voice, "unavailable ones greyed with a reason".
*   **Fix (on `phase-5`):**
    *   **`/check/bluetooth`:**
        *   if `navigator.bluetooth` is missing, greyed with the reason "This browser has
            no Web Bluetooth (use Chrome on Android or desktop)";
        *   otherwise, a profile picker → `requestDevice` with that service → subscribe →
            parse;
        *   heart-rate streams reduced to **one value per minute**;
        *   a **Simulator** button that feeds `ble-simulator` bytes through the same
            parsers, recorded with provenance `simulated_device`;
        *   preview → save via `validateRecord` → enqueue → result.
    *   **`/check/voice`:**
        *   if `SpeechRecognition`/`webkitSpeechRecognition` is missing, greyed with the
            reason "This browser has no speech recognition";
        *   also note "needs a network on most browsers" (design);
        *   a mic button → transcript → `extractReadings` → editable preview → save.
    *   add both links to "Other ways" on /check, both routes to the precache list and to
        the offline route test (the page must load offline even if voice then says it
        needs a network);
    *   e2e: the Bluetooth simulator saves a BP pair → result; voice is greyed in the
        Playwright browsers (no speech API) with its reason visible.

### Y7 — Low — Progress page scoring and offline coverage

*   `/progress` passes **all** stored results to `scoreDays` as check-ins. A result built
    only from estimate or synthetic readings still earns the check-in point. The design
    says nothing for estimates, synthetic data or emergency use.
    *   **Fix:** a check-in counts only if at least one of its `per_measure` records is
        eligible (real, not an estimate, not voided). Do this in core, with a test.
*   The design puts the gamification switch under settings. Add the same switch on
    `/settings`, sharing the stored value.
*   `/progress` and `/medicines` are precached, but not in `offline-routes.spec.ts`. Add
    them.

## Next

1.  **Builder:**
    *   fix Y1–Y7 on `phase-5`;
    *   run all unit tests, citations, typecheck, lint, `build:staging`, the offline suite
        and import e2e on both browsers, and the new Bluetooth/voice e2e;
    *   report with accurate commit titles, commit as ariandesu, push, do not merge, stop.
2.  **Auditor:** rerun the byte and speech probes, the progress probe, CUJ and the
    new screens.
3.  Merge and deploy on the author's go-ahead.

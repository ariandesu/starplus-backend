# Audit: Phase 5, Y-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-5` `87aff00`, frontend `phase-5` `02c1e1c`
**Verdict:** **Y1–Y7 are fixed.** Every suite passes on both browsers. One voice defect
remains: spoken blood pressure like "one thirty five" is read as **36** (Z1). It's a small
fix. After it, Phase 5 can merge.

## Probes, rerun

| Probe | Before | Now |
|---|---|---|
| Progress: daily check-in for 8 days | 114.3% | **100%** ✔ |
| Progress: plus a synthetic crew member | 64.3% | **100%** (ignored) ✔ |
| Progress: plus a real crew member at 3/7 | — | **71.4%** = (7/7 + 3/7) / 2 ✔ |
| BLE BP systolic NaN `0x07FF` / diastolic NRes `0x0800` | 2047 mmHg | **null** ✔ |
| BLE BP with only MAP = NaN | — | 120/80 kept (MAP is not stored) ✔ |
| BLE temperature FLOAT NaN | 8,388,607 °C | **null** ✔ |
| BLE weight `0xFFFF`; PLX SpO2 NaN | 327.68 kg / — | **null** ✔ |
| BLE temperature unit | `degC` | **°C** ✔ |
| BLE glucose 5.5 mmol/L / 100 mg/dL (kg/L) | 5.5 / **100 "mmol/L"** | **99.09 mg/dL / 100 mg/dL** ✔ |
| BLE glucose time offset +5 / −10 min | ignored | **10:05 / 09:50** ✔ |
| Voice: "my heart rate is seventy two", "pulse sixty", "seventy two beats per minute" | mostly nothing | 72 / 60 / 72 bpm ✔ |
| Voice: "one twenty over eighty", "one hundred twenty over eighty" | nothing | **120/80** ✔ |
| Voice: oxygen 98 %, temperature 37.2, glucose 105, weight 70.5 kg, breathing 16 | nothing | all correct ✔ |
| Voice: "I feel fine" | — | nothing ✔ |
| **Voice: "blood pressure one thirty five over eighty five"** | — | **systolic 36**, diastolic 85 ✘ (Z1) |

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| Checks | Frontend unit 178/178 ×3; backend 106/106; citations ok; typecheck clean; lint 0 errors; `core/` identical; CI success on both heads; staging build ok |
| Browser suites, real staging logins | CUJ **3/3** on Chromium and WebKit; offline-form and offline-sync pass on both |
| New and existing e2e | `bluetooth-voice` 6/6; import 6/6; offline routes 4/4 (incl. /check/bluetooth, /check/voice, /progress, /medicines) |
| Simulator provenance | `simulated_device`. The server accepts it from real and synthetic crew; gamification gives it no points. |
| Y6 screens | Bluetooth: profile picker, Connect greyed with a reason when unsupported, Simulator always available. Voice: greyed with a reason when unsupported; editable preview. Both linked from "Other ways". |
| Y7 | A check-in counts only with an eligible reading (core, tested). Shared switch on /progress and /settings. |

## Findings

### Z1 — Medium — Spoken "one thirty five" reads as 36

*   People say blood pressure in short form: "one thirty five", "one oh five", "one
    forty", "two ten". The grammar adds the parts (1 + 35), so 135/85 becomes **36/85**.
    That would show as a critical low.
*   "One twenty" works only because 1 + 20 is not what the code does for tens alone. The
    rule is inconsistent.
*   **Fix:** in `parseSpokenNumber`, when a units word (one–nine) is followed directly by a
    tens word (ten–ninety, with an optional units word) or by "oh" plus a units word, read
    it as hundreds: "one thirty five" = 135, "one oh five" = 105, "two ten" = 210.
    "Thirty five" and "one hundred thirty five" keep their current meaning.
*   **Tests:** "one thirty five over eighty five" → 135/85; "one oh five over seventy" →
    105/70; "one forty over ninety" → 140/90; "ninety five over sixty" → 95/60; "pulse one
    oh two" → 102; "thirty five" → 35.

### Z1 verified (round 2, `b170e27`)

*   Voice now reads 135/85, 105/70, 140/90, 95/60, 120/80 and 210/110 correctly, and
    "pulse one oh two" = 102. "Thirty five" = 35, "one hundred thirty five" = 135.
*   Unit 188/188 ×2; backend 106/106; typecheck clean; lint 0 errors; `core/` identical;
    CI success on both heads; `bluetooth-voice` 6/6.

### Z3 — Medium (blocks merge) — A number with no measure is saved as heart rate

*   `extractReadings("one thirty")` returns a reading with `metric: null`. The voice page
    then fills in `reading.metric ?? "heart_rate"`, so the preview shows "heart_rate 130
    bpm" (a high reading), and one tap saves it.
*   **Fix:**
    *   in `/check/voice`, a reading with no metric starts with an empty "Choose a
        measure" option;
    *   "Save" stays disabled until every row has a measure;
    *   no default metric anywhere;
    *   e2e or unit test: the transcript "one thirty" gives a row with no measure, and
        Save is disabled.
*   **Note (no change needed):** "twelve thirty" reads as 42. Times are not measurements;
    leave it.

### Z3 verified (round 3, backend `ba03321`, frontend `95c149f`). **Phase 5 passes.**

*   **Real voice screen** (auditor's fake speech engine, fresh staging build, Chromium and
    WebKit):
    *   "one thirty" → measure empty, **Save disabled**; after choosing a measure, Save is
        enabled;
    *   "pulse sixty six" → heart rate, Save enabled.
*   **Checks:** frontend unit 190/190 ×2; backend 106/106; typecheck clean; lint 0 errors;
    `core/` identical; CI success on both heads.
*   **Browser suites:**
    *   CUJ 3/3 and offline-sync on Chromium and WebKit (real staging logins);
    *   `bluetooth-voice` 6/6, import 6/6, offline routes 4/4.
*   **Ready to merge and deploy on the author's go-ahead.** The backend has code changes
    this phase (progress route), so the Worker **will** be redeployed.

### Z2 — Info

*   Staging codes used this run: 6 synthetic `stg-astro-1` codes.

## Next

1.  **Builder:**
    *   fix Z1 with its tests on `phase-5`;
    *   run the unit tests, typecheck, lint, and `bluetooth-voice.spec.ts` on both browsers;
    *   report, commit as ariandesu with an accurate title, push, do not merge, stop.
2.  **Auditor:** rerun the voice probes, then merge and deploy on the author's go-ahead.
3.  **Then Phase 6** (due 2026-11-12 afternoon), items 79–83: camera display reading (OCR),
    camera heart-rate estimate, image attachments to R2, `docs/disclosure.md`, READMEs,
    freeze tag.

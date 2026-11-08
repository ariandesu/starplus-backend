# Audit: Phase 4, W-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-4` `7b8eb65`, frontend `phase-4` `fbbdb54`
**Verdict:** **W1–W6 are fixed; the imports are now safe.** One import gap remains: real FHIR
heart rates in the standard unit `/min` are rejected (X1). The new tests also avoid the
offline case they were meant to cover (X3). Both are small. Fix X1–X3, then Phase 4 can
merge.

## Probe table, rerun

| Input | Before | Now |
|---|---|---|
| FHIR temperature 98.6 `[degF]` (as `unit`, or as UCUM `code`) | 98.6 °C | **37.0 °C** ✔ |
| FHIR temperature 310 `K`; no unit | accepted | **rejected: unsupported unit** ✔ |
| FHIR glucose 5.5 `mmol/L` / `g/L` | 99.1 / **5.5 mg/dL** | 99.1 mg/dL / **rejected** ✔ |
| FHIR heart rate 900 bpm | accepted | **out_of_bounds** ✔ |
| FHIR heart rate dated 2030 | accepted | **future_timestamp** ✔ |
| FHIR `entered-in-error` | accepted | **skipped** ✔ |
| FHIR BP panel `85354-9` with components | not read | **120/80, shared capture_id** ✔ |
| CSV heart rate 900 | accepted | **out_of_bounds** ✔ |
| CSV `crew_id` = another crew member | stored under them | **wrong_crew** ✔ |
| CSV with no timestamp | stamped "now" | **missing timestamp** ✔ |
| CSV `data_source=SYNTHETIC`, real crew / synthetic crew | `real` | **provenance_mismatch** / **synthetic** ✔ |
| Reaction test capture_id | none | **set** ✔ |
| **FHIR heart rate 70 `/min` or `{beats}/min`** | — | **rejected: unsupported unit** ✘ (X1) |
| **FHIR heart rate with no `effectiveDateTime`** | — | **stamped "now"** ✘ (X2) |

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| Checks | Frontend unit 110/110 ×3; backend 89/89; typecheck clean; lint 0 errors; `core/` identical; CI green on both heads; staging build ok |
| W4 screens | "Other ways" on /check → /check/questionnaire, /check/reaction, /import. The reaction test has a random 1–4 s delay, 1 practice + 5 taps, and shows the median. |
| **Offline saves (auditor, real staging login)** | Fully offline, the self-check and the reaction test both save and land on "Your result", on **Chromium and WebKit** |
| W5 | Body in the navigation; /body, /check/questionnaire, /check/reaction and /import precached; offline suite 4/4 |
| No regressions | CUJ Chromium 3/3, WebKit 3/3; `import-offline.spec.ts` 4/4 |

## Findings

### X1 — Medium — FHIR heart rate rejects the standard unit

*   Heart rate accepts only `bpm`, `beats/min` and `beats/minute`. The UCUM unit is `/min`,
    often written `{beats}/min`, and most real exports (Apple Health, EHRs) use these. A
    real heart-rate import is rejected in full.
*   **Fix:**
    *   add `/min`, `{beats}/min`, `1/min`, `{beat}/min` to heart rate;
    *   for respiratory rate, also add `{breaths}/min`, `{Breaths}/min`, `1/min`;
    *   for oxygen saturation, check `%` plus the UCUM code `%` with a display unit such as
        "percent";
    *   add a unit test for each.

### X2 — Low — FHIR without a time is stamped "now"

*   An Observation with no `effectiveDateTime` gets the import time. CSV rejects the same
    case, and a past reading filed as "now" distorts the baseline.
*   **Fix:**
    *   read `effectiveDateTime`, then `effectiveInstant`, then `effectivePeriod.start`;
    *   if none exists, reject with `missing timestamp`, as CSV does;
    *   add tests.

### X3 — Low — The new e2e tests skip the offline case

*   The reaction test reconnects before "Save result", and the import test runs online.
    The builder reported that saving offline "crashes". The auditor could not reproduce
    that with a real session: both browsers save offline and show the result.
*   The likely cause is the test itself. It seeds a session and goes offline at once,
    before the service worker controls the page and has finished precaching. So the
    navigation to `/result` has nothing to serve.
*   **Fix:**
    *   after seeding, wait for `navigator.serviceWorker.controller` plus the same settle
        time as `offline-routes.spec.ts`;
    *   then stay offline through "Save result", and assert `/result`;
    *   run the CSV import test offline too, with the same wait;
    *   add a questionnaire save test (offline), since none exists.

### X4 — Info

*   FHIR observations with a skipped status leave no trace in the preview. Optional: count
    them as "skipped (status entered-in-error)", so the user sees why fewer readings were
    imported.
*   Staging codes used this run: 4 synthetic `stg-astro-1` codes.

## Next

1.  **Builder:**
    *   fix X1–X3 on `phase-4`;
    *   run the unit tests, typecheck, lint, `build:staging`, the offline suite and
        `import-offline.spec.ts` on both browsers, **with no reconnect step**;
    *   report, commit as ariandesu, push, do not merge, stop.
2.  **Auditor:** rerun the X probes, CUJ and the new e2e tests.
3.  Merge and deploy Phase 4 on the author's go-ahead (fast-forward only).

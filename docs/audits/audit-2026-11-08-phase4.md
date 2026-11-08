# Audit: Phase 4 gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-4` `2a1b843`, frontend `phase-4` `255a9e5`
**Verdict:** **The Phase 4 gate ("adapter tests green") passes as written, but the
adapters are not safe to connect to a screen.** Probes show wrong-unit values stored as if
correct, no bounds or date checks, and synthetic data labelled real. None of the four
adapters is reachable from the app, and the body map is not in the navigation or the
offline precache. Fix W1–W6 before merging. Phase 4 is due 2026-11-11, so there is time.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| Files per design items 69–72 | Four adapters, the body page and component, history filter chips, `test/adapters.test.ts` (13 tests) |
| Checks | Frontend unit 93/93 ×3; backend 89/89; typecheck clean; lint 0 errors; `core/` identical; CI green on both `phase-4` heads; staging build ok |
| No regressions | CUJ Chromium 3/3, WebKit 3/3 (real staging logins); offline suite 4/4 |
| Questionnaire | The four questions match the catalog bounds; `capture_id` is shared |
| Reaction test | Median skips the chronological first (practice) tap; `reaction_time` is in the catalog |
| Builder's two fixes | The median fix and canonical-only CSV headers are both correct |

## Auditor's probes (throwaway unit test, not committed)

| Input | Result | Should be |
|---|---|---|
| FHIR temperature 98.6, unit `[degF]` (the standard UCUM code) | **98.6 °C** | 37.0 °C |
| FHIR temperature 310, unit `K` | **310 °C** | rejected: unsupported unit |
| FHIR temperature 37, no unit | accepted as °C | rejected: unit missing |
| FHIR glucose 5.5 `g/L` | **5.5 mg/dL** | rejected or 550 mg/dL |
| FHIR heart rate 900 bpm | accepted | rejected: out of bounds |
| FHIR heart rate, status `entered-in-error` | accepted | skipped |
| FHIR or CSV reading dated 2030 | accepted | rejected: future timestamp |
| CSV with no provenance passed (including the synthetic CSV, which has `data_source=SYNTHETIC`) | `provenance=real` | the session's provenance, or rejected |
| CSV with a `crew_id` column = another crew member | stored under **someone-else** | the logged-in crew member only |

## Findings

### W1 — High — Unknown units pass through unconverted (FHIR)

*   For temperature and glucose, a `convert` function exists, so the "unsupported unit"
    check is skipped. Every unknown unit is kept as is and relabelled °C or mg/dL. The
    standard FHIR code for Fahrenheit, `[degF]`, is not recognised.
*   Results like these would score as critical: hypothermia at 98.6 °C, or very low glucose
    at 5.5 mg/dL.
*   **Fix:**
    *   Each metric gets an explicit list of accepted units, each with its conversion:
        *   temperature: `Cel`/`°C`/`C` (unchanged), `[degF]`/`°F`/`F` (convert);
        *   glucose: `mg/dL` (unchanged), `mmol/L` (convert);
        *   …
    *   Anything else → `rejected: unsupported unit '<u>'`, including an empty unit.
    *   Read `valueQuantity.code` (UCUM) first, then `unit`.
    *   Add a test for each row of the probe table.

### W2 — High — No bounds, date or status checks in any import path

*   CSV, FHIR, questionnaire and reaction test write records without the checks the server
    applies. The values are stored and scored on the device before the server rejects them
    at sync. A 900 bpm heart rate gives a red result and then disappears from the server.
*   **Fix:**
    *   Add one shared `validateRecord(record, now)` in `src/lib/adapters/validate.ts` that
        mirrors the server's checks: catalog `bounds.min`/`max`, unit = catalog unit,
        `measured_at` not more than 1 day ahead, provenance present.
    *   Every adapter calls it and puts failures in `rejected` with the same reason codes
        as the server (`out_of_bounds`, `future_timestamp`, …).
    *   FHIR: skip any `status` other than `final`, `amended` or `corrected`.
    *   Tests for each.

### W3 — High — Wrong crew member and wrong provenance on import

*   The CSV `crew_id` column overrides the logged-in crew member. Imports must only ever
    belong to the session's crew member.
*   **Fix (crew):** ignore the column if it matches; reject the row (`wrong_crew`) if it
    differs.
*   All adapters default `provenance` to `"real"`.
*   **Fix (provenance):**
    *   Make `provenance` a **required** field of each context, filled from the session.
    *   In the CSV adapter, a `data_source` column of `SYNTHETIC` must give `synthetic`.
        If that conflicts with the session's provenance, reject the row
        (`provenance_mismatch`), as the server does.
    *   Add tests, including the verbatim synthetic CSV, which must import as `synthetic`.

### W4 — Medium — The adapters cannot be reached; the plan left out the screens

*   No screen imports any adapter. The design's input section asks for:
    *   questionnaires and a reaction-time test;
    *   "CSV/JSON import with a column-mapping screen, and FHIR `Observation` import",
        reachable from "Other ways" on the self-check screen.

    Plan item 69 listed only the adapter files, so this is a plan gap, not a builder error.
    Without screens, judges and crew cannot see any of it.
*   **Fix (on `phase-4`):**
    1.  `/check`: an "Other ways" section with links to questionnaire, reaction test and
        import.
    2.  `/check/questionnaire`: four sliders or number fields → `answerQuestionnaire` →
        enqueue → result.
    3.  `/check/reaction`: a tap test (a random 1–4 s delay, then "Tap now"; one practice
        tap plus 5 taps) → `reactionToRecord` → enqueue → result.
    4.  `/import`:
        *   a file picker for `.csv` or `.json` (FHIR Bundle or Observation);
        *   for CSV, a **column-mapping table** (header → catalog measure or "ignore",
            pre-filled from canonical codes and `SYNTHETIC_COLUMNS`);
        *   a preview with counts of accepted and rejected rows by reason;
        *   "Import N readings" → enqueue all.

        Everything must work offline.
    5.  Add all new routes to `additionalPrecacheEntries` and the offline route test.
    6.  E2E (no staging code needed; use demo mode or a seeded profile): import a small CSV
        with one bad row, and assert the preview counts; complete the reaction test.

    The JSON import of non-FHIR rows (an array of `{metric, value, measured_at}`) can reuse
    the CSV mapping. Add it if time allows, otherwise record it as a deviation.

### W5 — Medium — The body map is unreachable and not offline

*   `/body` is not in the navigation, and not in `additionalPrecacheEntries`, so it does not
    open offline unless visited first.
*   **Fix:** add a "Body" item to the navigation, add `/body` (and the W4 routes) to the
    precache list and to `offline-routes.spec.ts`.

### W6 — Low — Smaller adapter items

*   Reaction-test record has `capture_id: null`. The design says a test shares one ID.
    Set a capture ID.
*   CSV rows with no timestamp all get "now". The synthetic CSV has no timestamp column,
    so 180 people's rows would land on one moment and swamp the baseline.
    *   If there is no timestamp column, require the user to choose a date per row range in
        the mapping screen, or reject with `missing_timestamp`.
    *   The design's demo history uses `load-import`, not this screen, so rejecting is
        acceptable.
*   FHIR blood-pressure panels (LOINC `85354-9` with `component[]`) are the common format
    for BP and are not read. Read systolic and diastolic from the components, and share
    a `capture_id`.

## Next

1.  **Builder:**
    *   fix W1–W6 on `phase-4`;
    *   run the unit tests (5 times), typecheck, lint, `build:staging`, the offline suite on
        both browsers, and the new e2e tests;
    *   report, commit as ariandesu, push, do not merge, stop.
2.  **Auditor:** rerun the probe table, the CUJ suite and the new screens on both browsers.
3.  Merge and deploy Phase 4 on the author's go-ahead (fast-forward only).

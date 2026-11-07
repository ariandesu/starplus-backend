# STAR PLUS: Astronaut Self-Check Platform

*   **Author:** ariandesu
*   **Status:** Approved (revision 3, approved by the author 2026-11-08)
*   **Date:** 2026-11-08
*   **Predecessor:** [concepts_brief.md](../../egm/concepts_brief.md). Every decision
    this document relies on is restated in the [Decision log](#appendix-a-decision-log).

--------------------------------------------------------------------------------

## Overview

STAR PLUS is a web app that an astronaut uses on their own phone, tablet or laptop to
check their health during a mission, in one of four settings: the ISS, a Mars transit, a
Moon base, or a surface rover. It also lets a crewmate help someone who has collapsed.

Each check answers three questions: *how am I*, *why*, and *what do I do now*. The
astronaut records measurements by typing, short questionnaires and tests, file import,
Bluetooth medical devices, voice, or camera. The app returns a status per measurement and
overall: green (nominal), amber (watch), red (critical), or grey (not enough data yet).
Each status comes with a one-sentence reason and its source, cited next steps, and a
report that can be queued for the flight surgeon on Earth.

The app keeps working with no network. A spacecraft far from Earth has a communication
delay of minutes and periods of no link at all, so data is stored and scored on the
device first, and copied to Cloudflare D1 when a link exists.

All scoring comes from one function behind a fixed contract. Today it uses cited safety
limits and each astronaut's personal baseline, with a placeholder classifier trained on
synthetic data shown as advice only. On 2026-11-13 NASA Space Apps publishes the
challenge dataset; the classifier is retrained on it and only data files change.

This is the entry for the NASA Space Apps Challenge 2026 challenge "Create Health
Monitoring Software for Astronauts on Space Missions". The hackathon runs 2026-11-14 to
2026-11-15.

## Problem Statement

On long missions astronauts are exposed to the five hazards that NASA's Human Research
Program (HRP) describes: radiation, isolation and confinement, distance from Earth,
altered gravity, and a hostile closed environment. These cause bone loss, fluid shifts and
blood-pressure changes, immune changes, poor sleep and mood problems, among others.

Far from Earth a flight surgeon cannot answer in real time. On a Mars transit a message
takes about 4 to 22 minutes each way, so the earliest reply to a question comes 8 to 44
minutes later, and there are blackouts. The crew has to notice changes in themselves,
judge how serious they are, and act, without being doctors. The challenge's own example:
halfway to Mars, a crewmate has sharp chest pain and collapses. What do you do?

What exists today does not solve this:

*   The current STAR PLUS site is a read-only monitoring dashboard. An astronaut cannot
    enter a measurement, and the page never says what to do.
*   The backend stores five vital signs in a fixed-column table. Thresholds disagree
    between frontend and backend: systolic blood pressure of 140 mmHg is "critical" in the
    frontend (`page.tsx`) and "watch" in the backend (`watch.ts`, critical at 160). Neither
    value has a cited source.
*   The backend's scoring returns nothing when there are fewer than five baseline readings,
    so a dangerously low SpO2 on a new astronaut produces no alert at all.
*   Nothing works offline, and emergency help does not exist.
*   The model that will decide "sick or fit" cannot be built yet, because its training data
    is released on 2026-11-13 in an unknown format.

The proposed solution is a self-check app built around one set of rules with cited
sources, one measurement record, and one scoring contract, run on the device, so every
screen gives the same answer for the same reading and model version, works with no link,
and survives a model swap without code changes.

## Goals

Goals 1–8 and 11 form the **minimum shippable version** (build phases 0–3). Goals 9 and 10
are stretch goals (phases 4–6) and are cut first if time runs out.

1.  **Self-check in under a minute.** An astronaut can record a catalog measurement and see
    its status, reason, source and next step on phone, tablet and laptop. Verified by a
    timed end-to-end test of CUJ 2 (two measures) completing in under 60 seconds.
2.  **Emergency help from every screen.** One control, reachable with no login and no
    network, opens step-by-step first-aid protocols quoted from named sources, including a
    path for helping a crewmate who cannot respond.
3.  **One result per reading.** The status the device shows is the stored record. Every
    result carries its `model_version` and `catalog_version`, so any later difference can be
    explained by version.
4.  **Works with no link.** CUJs 1–5 work with the network off. Records and reports queue
    and are delivered when a link returns, each with a visible state (queued, sending,
    delivered, failed).
5.  **Model swap changes only data files.** Retraining on the hackathon dataset changes
    `model.json` and, if the dataset has new column names, catalog alias data. No UI,
    storage or API code changes. A model that fails its checks falls back to limits and
    baselines automatically. The swap is rehearsed daily by an automated test.
6.  **Every piece of guidance and every safety limit is cited.** A build test fails if a
    knowledge-base entry, formulary entry or catalog limit has no source.
7.  **The LLM explains and never decides, and never receives health data.** Meta Muse
    Spark is used only at build time on public cited content. Explanations of a person's
    results are templates filled in on the device.
8.  **Synthetic data is never mistaken for real data.** Every crew member and measurement
    on the server has a required provenance. Demo data lives only on the device in a
    separate store and is never sent.
9.  *(Stretch)* **More input methods**, in this order: questionnaires and reaction-time
    test; file import (CSV, JSON, FHIR); Bluetooth (six standard health profiles plus a
    simulator); voice; camera reading of a device display; camera heart-rate estimate;
    image attachments.
10. *(Stretch)* **The challenge's optional ideas:** reminders, gamification that rewards
    routine and never values, a clickable body map, radiation, nutrition and exercise
    views.
11. **A three-minute demo with one story:** crewmate collapses, emergency mode, self-check,
    Mars blackout, queued report, model swap. It uses only minimum-version features.

## Non-Goals

*   **Clinical validation or diagnostic claims.** No accuracy claim is made. No metric
    computed on synthetic labels is presented as evidence. Limits come from published
    standards but have not been reviewed by a clinician for spaceflight, and the app says
    so.
*   **Replacing the flight surgeon.** Every amber and red result directs the astronaut to
    the crew medical officer or flight surgeon.
*   **Generated doses.** A medication dose appears only when quoted word for word from a
    named public source.
*   **Live LLM calls from the app.** No question, value or report text is sent to Meta at
    run time. (Live Q&A is listed under Future Improvements.)
*   **Server-side re-scoring.** The server stores the device's results; it does not score.
*   **Mixing synthetic or reference data into real crew records**, on the server or the
    device.
*   **Equal support on every browser.** Web Bluetooth and speech recognition are missing in
    iOS Safari and Firefox, and browser speech recognition usually needs a network. Those
    methods appear greyed out with a reason.
*   **A native mobile app.** The app is an installable web app.
*   **One repository before 2026-11-13.** Shared code is copied into both existing repos;
    the merge into one repository happens after the hackathon.

## Open Questions

*   **Rules eligibility (decision D).** Whether the Local Event organiser accepts work built
    before 2026-11-14. The author has chosen to build now. Affects the submission, not the
    design. Owner: author.
*   **D1 limits on the account's plan.** Queries per Worker invocation and daily rows. The
    plan uses 100 bound parameters per statement (a D1 limit) and assumes 50 queries per
    invocation until checked. Owner: developer, before phase 1 ends.
*   **Reference devices.** Whether a real Bluetooth heart-rate strap and a reference pulse
    reading are available. Without them, the "works with real devices" and camera
    heart-rate accuracy claims are dropped. Owner: author.

## Critical User Journeys (CUJs)

### CUJ 1: Crewmate collapses during a Mars blackout

*   **Given**: The app is installed on a shared tablet, setting "Mars transit" with a
    20-minute one-way delay, the comms link is in a simulated blackout, and nobody is
    logged in.
*   **When**: A crewmate taps the emergency control and chooses "someone else, not
    responding".
*   **Then**: The app shows one cited instruction per screen (check response, call for the
    crew medical officer, check breathing, start CPR, and so on) with large targets,
    offline. Each step taken is recorded with a time. A report with subject "unknown
    crewmate" (or a chosen crew member) is queued on the device and shows "queued — will
    send when the link returns; earliest reply about 40 minutes after sending". It is sent
    under the next login made on that tablet.

### CUJ 2: Routine self-check

*   **Given**: An astronaut logged in on their device, with at least 30 days of readings,
    setting "ISS", phase "in flight".
*   **When**: They open today's reminder, enter blood pressure and heart rate (how-to and why
    shown beside each field), and confirm.
*   **Then**: They see a status per measure and overall, a reason with its source ("Systolic
    146 mmHg: at or above 140, ACC/AHA 2017 stage 2 hypertension"), cited next steps, and a
    chart with their baseline band. The record syncs and shows "delivered".

### CUJ 3: First check-in, no baseline yet

*   **Given**: A new astronaut with no earlier readings.
*   **When**: They complete their first self-check.
*   **Then**: Values inside the safety limits show grey "not enough data yet — a baseline
    needs 5 readings older than 3 days". A value outside a safety limit shows amber or red
    immediately.

### CUJ 4: Estimated abnormal reading

*   **Given**: An astronaut enters heart rate 128 bpm and marks it "estimated, no device".
    (In the stretch version the same applies to a camera heart-rate estimate.)
*   **When**: The result is computed.
*   **Then**: The app asks them to re-measure or confirm with a device before escalating. If
    confirmed, or if they choose "no device available", the amber result stands and the
    next step is to tell the crew medical officer. If a device reading is normal, the
    estimate is kept as a refuted reading and does not affect the baseline.

### CUJ 5: Explain more simply

*   **Given**: An amber blood-pressure result is on screen with its cited guidance.
*   **When**: The astronaut taps "Explain more simply".
*   **Then**: A separate, labelled panel shows a pre-written plain-language explanation with
    their numbers filled in on the device. Nothing is sent anywhere. It works offline.

### CUJ 6: Model swap on 2026-11-13

*   **Given**: The hackathon dataset is published.
*   **When**: The developer writes a column map, runs the matching pipeline, and commits the
    new `model.json` (and alias data, if needed).
*   **Then**: The model passes format and behaviour checks; every screen's advisory model
    panel uses it; new results record the new `model_version`. If the checks fail, the app
    keeps scoring with limits and baselines and says "model unavailable".

### CUJ 7: Flight surgeon receives a report

*   **Given**: A report queued in CUJ 1 or CUJ 2, and a flight surgeon logged in with the
    `flight_medical_officer` role.
*   **When**: The link returns and the device sends the report.
*   **Then**: D1 stores it once (a retry does not duplicate it). The device shows "delivered"
    with a time. The surgeon's view lists it with raw values, steps taken, the status with
    its source and versions, and the edited summary if the astronaut kept one. The surgeon
    marks it "acknowledged", and the device shows that on its next sync.

### CUJ 8: Judge opens the demo

*   **Given**: A judge opens the public URL on any device.
*   **When**: They switch on demo mode.
*   **Then**: A full-width banner and a distinct palette mark everything as synthetic. A demo
    crew with 30 days of history loads into a separate on-device store. Nothing is sent to
    the server, and real data is not shown or affected.

## Proposed Architecture

### System shape

```text
 Device (browser, installable app)                    Cloudflare
 ┌──────────────────────────────────────────┐        ┌─────────────────────────┐
 │ Input methods → draft → normalise →      │        │ Worker (starplus-backend)│
 │   confirm → measurement record           │        │  /api/auth, /api/admin/* │
 │                  │                        │ batch  │  /api/measurements/batch │
 │  IndexedDB (per profile) ── outbox ───────┼─link──►│  /api/reports, /api/sync │
 │                  │                        │◄───────┤  /api/crew/progress      │
 │  assess() — catalog, colour rule,         │ acks   │        │                 │
 │            model.json (advisory)          │        │        ▼                 │
 │                  │                        │        │  D1 (new tables beside   │
 │  Screens · cited content · templates      │        │      the old ones)       │
 │  Service worker caches app, content, model│        │  R2 (stretch: images)    │
 └──────────────────────────────────────────┘        └─────────────────────────┘

 Build time only:  tools/pregenerate → Meta Muse Spark (Contributor) → reviewed templates
```

The device is the primary system. Measuring, scoring, guidance and emergency mode run
from cached code and content. The server stores copies, delivers reports, serves another
device's history for the same astronaut, and computes one crew-wide progress figure.

### Repositories and shared code

The two existing repos stay. Shared code lives in `starplus-backend/core/` (the source)
and is copied to `starplus-frontend/core/` by a sync script. Both repos run a checksum
test that fails if the copies differ. `core/` is plain TypeScript with no enums or
namespaces, so Node can run it directly with type stripping (used by the model checker).
Merging into one repository is a Future Improvement after 2026-11-13.

| Location | Contents |
|---|---|
| `starplus-backend/core/` | Catalog, record types, validation, `assess()`, model contract and loader, gamification rules, cited content, explanation templates |
| `starplus-backend/src/` | Worker routes |
| `starplus-backend/migrations/` | D1 migrations |
| `starplus-backend/ml/` | Column maps, pipelines, rehearsal, model card |
| `starplus-backend/tools/` | Template generation and review, citation checker, core sync |
| `starplus-backend/docs/` | This design, decision log, demo script, disclosure |
| `starplus-frontend/` | Next.js app; `core/` is a synced copy |

### Measurement record and metric catalog

**Catalog** (`core/content/catalog.json`), one entry per measure. Fields: `code` (keeps
the five existing keys, for example `heart_rate`), `label`, `unit`, `value_type`
(numeric, ordinal, enum, duration), `origin` (observed or derived), `bounds` (plausible
input range), `limits` (see the limit table), `limit_source`, `phase_offsets`,
`sd_floor`, `min_baseline_readings` (default 5), `body_system` (exactly one), `hazards`
(HRP hazards that affect it), `guidance_key`, `aliases` (dataset column names).

**Record** (one value per record, stored on the device and in D1):

| Field | Meaning |
|---|---|
| `client_id` | UUID made on the device; unique |
| `crew_id` | crew member the value belongs to |
| `metric`, `value_num` or `value_text`, `unit` | value in the catalog's canonical unit |
| `measured_at` | device clock, ISO 8601 UTC |
| `received_at` | server clock when synced (empty on the device until then) |
| `source` | manual, questionnaire, test, import, ble, voice, ocr, camera_hr |
| `device_id`, `capture_id` | device, and a shared ID for values taken together (BP pair, questionnaire, test) |
| `is_estimate`, `confirmed_by_user` | estimate flag; whether the person confirmed the value |
| `provenance` | real, synthetic, simulated_device |
| `setting`, `phase`, `phase_day` | iss, mars_transit, moon_base, rover; preflight, inflight, surface, postflight; day number |
| `supersedes_client_id`, `voided` | corrections and removals; baselines read the latest non-voided value |
| `catalog_version`, `schema_version` | versions the record was made under |

Phase values: `preflight` (before launch), `inflight` (in microgravity, including ISS and
Mars transit), `surface` (Moon base, rover), `postflight` (after return). The astronaut
sets setting and phase in settings; `phase_day` is calculated from a mission start date
entered there. Raw adapter output (photos, voice transcripts) stays on the device.

### Safety limits (with sources)

Limits use the NHS/RCP **National Early Warning Score 2** (Royal College of Physicians,
2017) for single-parameter scores: a parameter score of 3 is **critical**, 2 is **watch**,
0–1 is nominal (score 1 is shown as a note). Other measures use the named standards.
Measures with no published single-reading limit get baseline scoring only.

| Measure | Watch | Critical | Source |
|---|---|---|---|
| Heart rate (bpm) | 111–130 | ≤40 or ≥131 | NEWS2 |
| Respiratory rate (/min) | 21–24 | ≤8 or ≥25 | NEWS2 |
| SpO2 (%) | 92–93 | ≤91 | NEWS2 scale 1 |
| Systolic BP (mmHg) | 91–100, or ≥140 | ≤90, or ≥180 | NEWS2 (low); ACC/AHA 2017 stage 2 and hypertensive crisis (high) |
| Diastolic BP (mmHg) | ≥90 | ≥120 | ACC/AHA 2017 |
| Core temperature (°C) | ≥39.1 | ≤35.0 | NEWS2 (39.1+ scores 2) |
| Blood glucose (mg/dL) | <70 or ≥200 | <54 or ≥250 | ADA Standards of Care (hypoglycaemia levels 1 and 2; random plasma glucose ≥200 diagnostic threshold; DKA threshold 250) |
| Urine specific gravity | >1.020 | — | ACSM position stand on exercise and fluid replacement (2007) |
| Sleep (hours) | <7 | — | AASM/SRS consensus on adult sleep duration (2015) |
| Radiation (mSv) | shown as % of career limit; no colour | — | NASA-STD-3001 Vol. 1 Rev. B (600 mSv career limit) |
| HRV, mood, stress, sleep quality, reaction time, body mass, exercise, water and calories | baseline only | — | no published single-reading limit |

**Phase offsets never move a safety limit.** Core body temperature in long-duration flight
rises about 1 °C (Stahn et al., *Scientific Reports* 2017) and systolic pressure falls about
14 mmHg by six months in flight (Circulation 2019). These offsets shift only the personal
baseline expectation and the "typical range" shown beside charts. The temperature watch
limit stays 39.1 °C in flight; the app shows a note that in-flight temperature runs about
1 °C higher. A build test fails if any pipeline output or catalog patch changes `limits`.

**Resolved conflict:** systolic 140 mmHg is watch and 180 mmHg is critical (ACC/AHA),
replacing both the frontend's 130/140 and the backend's 140/160.

### Scoring: one function, one colour rule

`assess(history, context) → result` in `core/` is the only code that decides a status. It
runs on the device. (The Worker does not score.)

Colour rule, in order:

1.  **Safety limits first,** on the latest non-voided value, using the current setting and
    phase. A limit result cannot be lowered by anything after it.
2.  **Personal baseline** can raise a status. Baseline = readings from 30 days before to
    72 hours before now, with at least `min_baseline_readings`; window = the last 72 hours.
    z = (window mean − baseline mean) / max(baseline SD, `sd_floor`). |z| ≥ 2 raises to
    watch, |z| ≥ 3 to critical. Trend (rising, falling, stable) compares the last third of
    the window with the first third. These thresholds are a design choice carried over from
    the existing backend, not a published standard, and the app says so.
3.  **No baseline yet** and inside limits → `insufficient` (grey).
4.  **Estimated values** that are abnormal trigger "re-measure or confirm" first; escalate if
    confirmed or confirmation is not possible.
5.  **The model is advisory.** Its output appears in a separate "Model view" panel on the
    result screen as a probability with its `model_version`, in neutral grey, with no status
    words or status colours. It never changes a colour or a next step. When the model's
    probability is above its `threshold_watch` while the rule result is nominal, or below
    it while the rule result is watch or critical, the panel shows fixed text: "The model
    disagrees with the rule-based result. Follow the result above; tell the crew medical
    officer if you are concerned." A test covers both disagreement directions.

`result` fields: `overall_status` (insufficient, nominal, watch, critical), per-measure
`{metric, status, status_source (safety_limit | personal_baseline), reason_code, values}`,
`model_advice` (or null), `model_id`, `model_version`, `catalog_version`, `kb_version`,
`inputs_hash`.

This fixes the existing bug where `computeSignal` returned nothing with fewer than five
baseline readings, and checked limits against the 72-hour mean instead of the latest
value.

### Model contract and the 2026-11-13 swap

`model.json` fields: `contract_version` (integer), `model_id` (string), `model_version`
(string), `kind` (`logistic`), `inputs` (array of `{metric, unit, feature}` where `feature`
is `latest` or `baseline_z`), `intercept` (number), `coefficients` (number per input),
`scaler` (`mean` and `sd` per input), `output` (`{threshold_watch, threshold_critical}` on
predicted probability), `training_data` (`source`, `provenance`, `rows`, `evaluation`),
`reference_cases` (input rows with expected probability).

The loader checks, in order: schema; every input exists in the catalog; every
`reference_case` reproduces within 0.001; predictions on the reference cases are not all
equal. Any failure means "model unavailable" and scoring continues without it.

`ml/` pipeline: dataset → column map (YAML: `id_column`, `time_column`, optional
`label_column`, optional `phase_column` with a parse rule, and `columns` mapping each
source column to a catalog code and unit) → one of two pipelines:

*   **Labelled rows** → logistic regression on `latest` and `baseline_z` features computed
    from each person's earlier records only, split by person, evaluated on held-out
    people → `model.json`.
*   **Time series without labels** → per-measure, per-phase reference ranges and phase
    offsets written into catalog data (`phase_offsets`, and a "typical range" shown beside
    charts). No `model.json` change; the model panel stays on the current model.

The swap rehearsal runs daily in GitHub Actions and on every push: it renames and shuffles
the synthetic CSV's columns, writes a column map, runs the labelled-rows pipeline, and runs
the loader's checks with Node. It proves the column-map stage and the checks work; it does
not prove an unknown dataset shape will. The placeholder model's `training_data` is marked
synthetic, and its metrics are not shown as evidence.

### Storage, sync and identity

**On the device.** IndexedDB through the `idb` library. One database per crew profile
(`starplus-<crew_id>`) plus `starplus-device` (outbox, settings, profiles) and
`starplus-demo` (demo mode only). Stores: measurements, results, reports, content cache,
outbox. Versioned upgrades. The app requests persistent storage and asks iPhone users to
install before the first check-in. Switching to another profile needs that profile's
4-digit PIN. **The PIN is a screen lock only:** IndexedDB is not encrypted and a 4-digit PIN
can be guessed offline, so it does not protect stored data from someone with the device.
On a device marked "shared" in settings, session tokens last 24 hours instead of 30 days.
Emergency mode needs no profile or PIN.

**Outbox.** Sends batches of up to `max_items` (from the server's last reply; starts at
100) to `POST /api/measurements/batch`, retries with backoff, and shows each item's state.
Results are sent with their measurements. Reports go to `POST /api/reports`. An
emergency report made with no login waits until any session exists on that device and is
then sent under it, keeping its `subject`. While such a report waits, the home screen and
emergency screen show "1 emergency report waiting — log in to send it".

**Identity.**

*   The admin (holder of `API_KEY`) creates crew members and issues single-use access
    codes: 8 characters, Crockford base32, stored as SHA-256 hashes.
*   `POST /api/auth` exchanges a code for a session token: 32 random bytes, stored as a
    SHA-256 hash, valid 30 days (long, because missions go offline), revocable.
*   Roles: `astronaut` (reads and writes own data), `flight_medical_officer` (reads all
    reports and crew results, acknowledges reports), `mission_control` (reads all reports).
    The role list moves from the old `validate.ts` into `core/`.

**D1.** New tables are added beside the old ones; old tables and routes are untouched until
after 2026-11-13. The existing `vitals` rows are test data and are not copied.

### Database tables (migration `0003_self_check.sql`)

All timestamps are ISO 8601 UTC text. Booleans are integers 0/1.

| Table | Columns (type, constraint) | Keys and indexes |
|---|---|---|
| `crew` | `id` TEXT; `name` TEXT NOT NULL; `role` TEXT NOT NULL CHECK in roles; `provenance` TEXT NOT NULL CHECK in (real, synthetic, simulated_device); `created_at` TEXT NOT NULL | PK `id` |
| `measurements` | record fields above; `crew_id` TEXT NOT NULL; `metric` TEXT NOT NULL; `value_num` REAL; `value_text` TEXT; `unit` TEXT; `measured_at` TEXT NOT NULL; `received_at` TEXT NOT NULL; `source` TEXT NOT NULL CHECK; `device_id` TEXT NOT NULL; `capture_id` TEXT; `is_estimate` INTEGER NOT NULL; `confirmed_by_user` INTEGER NOT NULL; `provenance` TEXT NOT NULL CHECK; `setting` TEXT NOT NULL CHECK; `phase` TEXT NOT NULL CHECK; `phase_day` INTEGER; `supersedes_client_id` TEXT; `voided` INTEGER NOT NULL DEFAULT 0; `catalog_version` TEXT NOT NULL; `schema_version` INTEGER NOT NULL | PK `client_id`; FK `crew_id` → `crew(id)`; index (`crew_id`, `metric`, `measured_at`); index (`received_at`) |
| `results` | `client_id` TEXT; `crew_id` TEXT NOT NULL; `assessed_at` TEXT NOT NULL; `overall_status` TEXT NOT NULL CHECK in (insufficient, nominal, watch, critical); `per_measure_json` TEXT NOT NULL; `model_advice_json` TEXT; `model_id`, `model_version`, `catalog_version`, `kb_version`, `inputs_hash` TEXT NOT NULL (model fields may be the string `none`); `received_at` TEXT NOT NULL | PK `client_id`; FK `crew_id`; index (`crew_id`, `assessed_at`); index (`received_at`, `client_id`) |
| `reports` | `client_id` TEXT; `device_id` TEXT NOT NULL; `submitted_by` TEXT NOT NULL (crew id of the session that sent it); `subject_crew_id` TEXT; `subject_label` TEXT; `kind` TEXT NOT NULL CHECK in (emergency, routine); `created_at` TEXT NOT NULL; `received_at` TEXT NOT NULL; `payload_json` TEXT NOT NULL; `summary_text` TEXT; `summary_edited` INTEGER NOT NULL; `status` TEXT NOT NULL CHECK in (delivered, acknowledged); `acknowledged_by` TEXT; `acknowledged_at` TEXT | PK `client_id`; index (`status`, `received_at`) |
| `access_codes` | `code_hash` TEXT; `crew_id` TEXT NOT NULL; `created_at` TEXT NOT NULL; `used_at` TEXT; `revoked` INTEGER NOT NULL DEFAULT 0 | PK `code_hash` |
| `sessions` | `token_hash` TEXT; `crew_id` TEXT NOT NULL; `role` TEXT NOT NULL; `device_id` TEXT NOT NULL; `created_at`, `expires_at` TEXT NOT NULL; `revoked` INTEGER NOT NULL DEFAULT 0 | PK `token_hash`; index (`crew_id`) |

A test proves an insert into `crew` or `measurements` without `provenance` fails.

### API contract

All responses are JSON and carry `X-Request-Id`. CORS echoes the request origin if it is
the production domain or matches the project's Vercel preview pattern, with
`Vary: Origin` and `Access-Control-Expose-Headers: X-Request-Id`. Methods are GET and
POST only. Errors: `{error, details?}`.

| Route | Auth | Request | Response |
|---|---|---|---|
| `GET /api/health` | none | — | 200 `{status, d1: "ok"}`; 503 if D1 fails |
| `POST /api/admin/crew` | `API_KEY` | `{id, name, role, provenance}` | 201 crew row; 400 invalid |
| `POST /api/admin/codes` | `API_KEY` | `{crew_id}` | 201 `{code}` (shown once) |
| `POST /api/admin/revoke` | `API_KEY` | `{crew_id}` | 200 `{revoked_sessions, revoked_codes}` |
| `POST /api/auth` | none (rate-limited per IP) | `{code, device_id}` | 200 `{token, crew_id, role, expires_at}`; 401 |
| `POST /api/measurements/batch` | session, role `astronaut`, own `crew_id` only | `{schema_version, catalog_version, items[], results[], client_report}` | 200 `{accepted[], duplicates[], rejected[{client_id, reason}], max_items, retry_after?}`; 400, 401, 413, 429 |
| `GET /api/sync?since=<received_at>` | session, own data | — | 200 `{measurements[], results[], reports_status[], cursor}` (for a second device of the same astronaut) |
| `POST /api/reports` | any session | report fields | 201 or 200 if duplicate |
| `GET /api/reports?since=` | `flight_medical_officer`, `mission_control` | — | 200 `{reports[]}` |
| `GET /api/crew/results?crew_id=&since=` | `flight_medical_officer` | — | 200 `{results[], cursor}` for one crew member |
| `GET /api/attachments/<id>` | the report's sender, `flight_medical_officer` (stretch) | — | the image; 403 otherwise |
| `POST /api/reports/ack` | `flight_medical_officer` | `{client_id}` | 200 |
| `GET /api/crew/progress` | any session | — | 200 `{window_days: 7, readiness_pct}` (crew-wide only) |

The batch insert puts up to 4 records in one statement (D1 allows 100 bound parameters per
statement) and runs statements through `db.batch`. `max_items` starts at 100 so a batch
stays under 50 queries. `client_report` (outbox depth, oldest item age, failures by reason,
clock skew, active `model_version`, whether the model was unavailable) is written to
Workers Logs, not D1.

**Limits:** Cloudflare rate-limiting binding: 10 requests per minute per IP on
`/api/auth`; 60 per minute per token elsewhere. Old public routes stay as they are until
after 2026-11-13.

### Content and the LLM

*   **Knowledge base** (`core/content/kb/`): entries per measure, test, hazard, first-aid
    protocol and mission topic, each with ID, version, content hash, text and at least one
    citation.
*   **First aid:** steps quoted from named sources (American Heart Association / Red Cross
    first-aid and CPR guidance) for unresponsive person and CPR, choking, severe bleeding,
    burns, anaphylaxis, low blood sugar, fainting, chest pain. Emergency screens use no LLM
    text.
*   **Formulary** (`core/content/formulary.json`): purpose, side effects and interactions
    quoted from a named source; a dose only when quoted word for word with its citation,
    otherwise "dose: per flight surgeon / mission protocol".
*   **Templates and explanations (build time):** `tools/pregenerate.ts` sends only public
    cited KB entries to `muse-spark-1.3-contributor` (Meta may train on Contributor-mode
    content; nothing personal is sent). It writes two detail levels of plain explanations
    and result templates with placeholders (`{{value}}`, `{{unit}}`, `{{limit}}`,
    `{{baseline}}`, `{{source}}`) to `core/content/explain-cache.json`, keyed by entry
    content hash, level, model ID and prompt version, with `review_status`.
*   **Filters** (`core/explain/filters.ts`): reject output that contains a number, unit,
    dose, route or time word not in the source entry, or wording that softens a status
    ("normal", "nothing to worry about"). Run on every generated item and in CI.
*   **Review:** the developer reviews each item against its source with `tools/review.ts`.
    The app labels explanations "AI-written, reviewed by the developer against the cited
    source". Only reviewed items ship.
*   **On the device:** "Explain more simply" fills a template from the record. Nothing
    leaves the device.

### Input methods

Every method produces a draft `{metric, value, unit, source, confidence, raw}` and never
writes to storage. The shared pipeline converts units with the catalog, checks bounds and
pairs (systolic above diastolic within a `capture_id`), shows a confirm step where the
source can misread (with the heard phrase or photo crop), and writes the record.
`confidence < 1` sets `is_estimate`. Each measure has one default method; others are under
"Other ways"; unavailable ones are greyed with a reason.

Minimum version: forms, with an "estimated, no device" option. Stretch, in order:
questionnaires and reaction-time test; CSV/JSON import with a column-mapping screen, and
FHIR `Observation` import; Bluetooth (heart rate, blood pressure, thermometer, glucose,
pulse oximeter, weight scale) plus a simulator sending the same bytes, with heart-rate
streams reduced to one value per minute; voice; camera display reading (Tesseract.js,
loaded on demand, needs a link the first time); camera heart-rate estimate (always an
estimate, never used for baselines); image attachments to R2.

Offline: forms, questionnaires, tests, import, Bluetooth and the camera heart-rate
estimate work offline; voice needs a network on most browsers; display reading works
offline only after its first download.

### Screens

Login (access code), profile switch (PIN), home (today's reminder, overall status),
self-check, result (status per measure, reason and source, hazard link, next steps,
"Explain more simply", model view, escalate), emergency (on every screen; self or
crewmate; one step per screen; steps logged into a report), reports (queue and delivery
states; summary editable or discardable before queueing), history (charts per measure with
baseline band), settings (setting, phase, mission start date, comms link simulation,
gamification switch, data notice), flight-surgeon view (role-gated), demo mode.
Stretch: body map with list view, radiation/nutrition/exercise as filtered views of
history, progress (gamification), medicines.

All screens are static routes with client components reading IndexedDB, so they start with
no network. The service worker is built with Serwist (named in the Next.js 16 PWA guide);
if its Next 16 integration needs webpack, the app builds with `next build --webpack`. It
precaches the app shell, hashed static assets, content and `model.json`; the Satoshi font
is self-hosted (Fontshare's free licence) so it works offline. `/sw.js` is served with
`Cache-Control: no-cache`. A kill-switch worker that unregisters itself is tested once.

Reused components: `empty-state.tsx` becomes the status card (it already has the three
tones; grey is added); `demo-badge.tsx` becomes the demo banner; `dashboard-shell.tsx` and
`mobile-nav.tsx` stay as the app shell. Deleted: hero, bento, marquee, accordion,
role-switcher, skeleton-loader, and the `gsap`, `@gsap/react` and `framer-motion`
dependencies.

### Comms delay

Settings define one-way delay: ISS a few seconds, Moon base about 1.3 seconds, Mars transit
4–22 minutes (demo default 20), rover the same as its host body. "Earliest reply" is twice
the one-way delay. In demo mode the outbox and report delivery wait on a simulated link
with that delay and with blackout windows.

### Gamification (stretch)

Pure functions in `core/` over the event log; no points table. Points for a completed
check-in whatever the result, a completed exercise session, and logged sleep and
hydration. Nothing for confirming, estimates, `synthetic` or `simulated_device`
provenance, or emergency use. Capped per local day by `measured_at`, so it works offline.
Daily readiness ring (check-ins, countermeasures, sleep and hydration logged); streaks with
one rest day a week; mission patches. Crew progress is one crew-wide percentage over 7
days from the server, excluding anyone whose latest status is watch or critical. Can be
switched off.

### Observability

Workers Logs (already enabled) with a request ID on every response; `/api/health` checks
D1; batch `client_report` fields logged; template generation logs model ID, prompt version
and filter rejections.

## Risks and Mitigations

| Risk | Category | Likelihood / impact | Mitigation |
|---|---|---|---|
| Not eligible because work began before 2026-11-14 | Rules | Medium / entry lost | Author asks the Local Event organiser; `docs/disclosure.md` states what existed before the event |
| Unsynced data lost (device lost, storage cleared, Safari eviction) | Failure | Medium / lost readings | Persistent-storage request; install prompt on iPhone; outbox shows unsynced count; sync whenever a link exists |
| Device clock wrong | Failure | Medium / wrong baselines and caps | Store both clocks; batch reports clock skew; server rejects `measured_at` more than 1 day in the future |
| Worker or D1 outage | Failure | Low / delayed delivery | Device keeps working; outbox retries with backoff |
| Model passes format checks but is useless | Failure | Medium on 2026-11-13 / misleading advice | Reference cases and non-constant check; model is advisory only and never changes colour |
| Quotas exhausted | Scale | Low at crew scale / failed sync | Batch cap from server; rate limits; per-astronaut cap of 5,000 records per UTC day by `received_at` (excess items rejected with `daily_cap_reached` and retried the next day) |
| Wrong limit or guidance | Safety | Low–medium / harm | Published sources only; citation test; amber and red always point to the crew medical officer; no clinical review stated |
| Shared-tablet privacy | Security | Medium / exposure | Per-profile store; PIN as a screen lock only (stated in the app); 24-hour tokens on shared devices; server reads scoped by role; R2 images private, served only through the Worker, deleted after 90 days |
| LLM writes something unsafe | Safety | Medium / harm | Build time only; filters; developer review; emergency text never generated |
| Service worker pins a broken build | Rollout | Low / stuck clients | Versioned caches; tested kill-switch worker |
| Scope does not fit 4 days | Schedule | High / missing features | Minimum version = phases 0–3; dated go/no-go per phase; stretch cut from the end |

## Non-Functional Requirements

*   **Security and privacy:** no health data or free text is sent to an LLM; tokens and codes
    hashed; reads scoped by role; secrets (`API_KEY`; `MODEL_API_KEY` used only by local
    tools) never in the browser.
*   **Safety:** limits cannot be overridden; estimates trigger re-measurement; cited
    guidance only; no generated doses; app states no clinical review.
*   **Offline:** CUJs 1–5 with the network off.
*   **Performance:** `assess()` on 30 days × 20 measures in under 300 ms on the developer's
    laptop (benchmark test); camera code loads only when used.
*   **Rollout and rollback:** additive migrations; D1 time-travel bookmark and export before
    each migration; old routes untouched until after 2026-11-13; code freeze on the evening
    of 2026-11-12. On 2026-11-13 only data files change. If the new model fails its checks,
    the app already falls back; to roll back on purpose, revert `core/content/model.json`
    to the previous commit and redeploy both apps.

## Alternatives Considered

Each rejection states the trade-off. Decision letters refer to the
[Decision log](#appendix-a-decision-log).

### A. Keep the wide `vitals` table, one column per measure

*   **Pros:** no new tables; current code works.
*   **Cons:** each new measure means edits in five places across two repos; no room for
    source, estimate, provenance or corrections; the 2026-11-13 dataset could force a
    schema change on deadline day.
*   **Rejected:** one record per value with a shared catalog makes a new measure a data
    entry, not a migration.

### B. A sick/fit classifier as the only model

*   **Pros:** one clear output.
*   **Cons:** fails if the dataset has no label; gives nothing for a new astronaut; the
    placeholder's accuracy only reflects the synthetic generator's rules.
*   **Rejected:** limits and baselines decide; the model is advisory (decision R3).

### C. Server as the source of truth

*   **Pros:** one place holds results; simpler client.
*   **Cons:** no scoring or emergency help during the delay and blackouts the Mars setting is
    about.
*   **Rejected:** device-first (decision B).

### D. Client-only app with no server

*   **Pros:** no sync, auth or quotas.
*   **Cons:** no way to deliver reports to a flight surgeon (CUJ 7), no second-device
    history.
*   **Rejected:** reports to the ground are part of the core story.

### E. All input methods to equal depth

*   **Pros:** matches "all possible input methods" literally.
*   **Cons:** not finishable in four days; several methods are missing in iOS Safari and
    Firefox or need a network.
*   **Rejected:** forms first; others in a fixed order as stretch, through one pipeline,
    shown only where supported.

### F. Automatic sample data when the backend is empty

*   **Pros:** the screen never looks empty.
*   **Cons:** fake alerts about named crew can be mistaken for real ones.
*   **Rejected:** demo mode is opt-in, on-device, labelled.

### G. One repository first, then features

*   **Pros:** no copied code.
*   **Cons:** relinks both deployments, merges two lockfiles and git histories, four days
    before the freeze.
*   **Rejected for now (decision R4):** copy `core/` into both repos with a checksum test;
    merge after 2026-11-13.

### H. A third "core" repo as a git dependency

*   **Pros:** keeps the two repos unchanged.
*   **Cons:** every rule change needs a publish and two dependency bumps.
*   **Rejected:** a sync script plus checksum test does the same with less ceremony.

### I. Live LLM Q&A and personalised explanations

*   **Pros:** natural answers to any question.
*   **Cons:** in Contributor mode Meta may train on what is sent; typed questions can contain
    readings and symptoms; useless during a blackout; can restate numbers wrongly.
*   **Rejected (decisions F, R1):** build-time templates filled in on the device.

### J. Standard mode for LLM calls

*   **Pros:** Meta does not train on Standard-mode content.
*   **Cons:** costs more; with only public content sent (I), training exposure carries no
    personal data.
*   **Rejected (decision E):** Contributor mode; the model ID is one config value.

### K. A dose table compiled by the developer

*   **Pros:** complete medication screens.
*   **Cons:** highest-harm content, no clinical reviewer, not required by the challenge.
*   **Rejected (decision G):** doses only when quoted with a citation.

### L. Pipelines for every dataset shape before 2026-11-13

*   **Pros:** ready for anything.
*   **Cons:** most would go unused; each needs tests.
*   **Rejected:** labelled-rows and time-series pipelines only; others written on the day if
    needed.

### M. Build only during the hackathon

*   **Pros:** no eligibility question.
*   **Cons:** 48 hours for offline, sync, content and review.
*   **Rejected by author (decision D):** build now; disclose what existed before.

### N. Stateless signed tokens

*   **Pros:** no database read per request.
*   **Cons:** cannot be revoked before expiry without a blocklist.
*   **Rejected:** revocable stored sessions.

### O. Server re-scoring and a scheduled recompute

*   **Pros:** catches differences between device and server versions.
*   **Cons:** two sources of results, comparison screens, a scheduled job and a reverse
    data flow, for a difference that versions on each result already explain.
*   **Rejected (decision R2):** the stored result is the device result.

### P. A hand-written service worker

*   **Pros:** no dependency.
*   **Cons:** precaching hashed assets and cache versioning by hand is the riskiest custom
    code, and offline emergency mode depends on it.
*   **Rejected:** Serwist.

## Future Improvements

*   Merge both repos into one with npm workspaces.
*   Live Q&A with numbers and symptom words removed on the device, or Standard mode.
*   Group-summary and unlabelled dataset pipelines when a dataset needs them.
*   Clinical review of all limits, guidance and the formulary.
*   Native iOS wrapper for Bluetooth.

## Additional Resources

*   [NASA Space Apps 2026 challenge](https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/)
    and [participant FAQ](https://www.spaceappschallenge.org/resources/participant-faqs/).
*   [Meta Model API models](https://dev.meta.ai/docs/models) and
    [Muse Spark](https://dev.meta.ai/docs/muse-spark).
*   Royal College of Physicians, *National Early Warning Score (NEWS) 2*, 2017.
*   Whelton et al., *2017 ACC/AHA Guideline for High Blood Pressure in Adults*.
*   American Diabetes Association, *Standards of Care in Diabetes* (glycaemic targets,
    hypoglycaemia classification).
*   Watson et al., AASM/SRS consensus on adult sleep duration, *Sleep* 2015.
*   American College of Sports Medicine, *Exercise and Fluid Replacement* position stand,
    2007.
*   NASA-STD-3001 Volume 1 Revision B (radiation career limit).
*   Stahn et al., "Increased core body temperature in astronauts during long-duration space
    missions", *Scientific Reports* 2017.
*   Next.js 16 guide `progressive-web-apps.md` (in the frontend's
    `node_modules/next/dist/docs/01-app/02-guides/`).
*   Synthetic dataset and notes: `starplus-backend/ml/data/`.

## Appendix A: Decision log

| ID | Decision | Date |
|---|---|---|
| A | All input methods wanted; built in a fixed order through one pipeline | 2026-11-07 |
| B | Scoring runs on the device; Cloudflare D1 stores copies | 2026-11-07 |
| C | Extra domains (radiation, nutrition, exercise, body map) as catalog measures | 2026-11-07 |
| D | Build before the hackathon; eligibility pending the organiser's answer | 2026-11-07 |
| E | Meta Muse Spark in Contributor mode for all calls | 2026-11-08 |
| F | No health values sent to the LLM; templates filled on the device | 2026-11-08 |
| G | Doses only when quoted from a named source | 2026-11-08 |
| R1 | Live Q&A cut; build-time explanations only | 2026-11-08 |
| R2 | No server re-scoring; the stored result is the device result | 2026-11-08 |
| R3 | Model is display-only, with reference-case and non-constant checks | 2026-11-08 |
| R4 | Shared code copied into both repos until after 2026-11-13 | 2026-11-08 |
| — | Hackathon and synthetic datasets stay in files, never in D1 | 2026-11-08 |

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Fixed implementation decisions

These settle every remaining choice raised in the final re-audit; the file items below
follow them.

*   **Importing `core/`:** both repos map `@starplus/core` to `./core/src/index.ts` with a
    tsconfig `paths` entry; the backend tsconfig `include` adds `core/**`; both vitest
    configs set the same `resolve.alias`. Wrangler (esbuild) and Next resolve tsconfig paths.
*   **`core/` source rules:** relative imports use `.ts` extensions
    (`allowImportingTsExtensions`, `noEmit`); `verbatimModuleSyntax` (type-only imports use
    `import type`); JSON imported with `with { type: "json" }`; no enums or namespaces.
    Node 24 runs it with built-in type stripping. CI uses Node 24 and Python 3.12.
*   **Catalog limit shape:** `limits: [{level: "watch" | "critical", op: "<" | "<=" | ">"
    | ">=", value, source}]`; a value matching any critical entry is critical, else any
    watch entry is watch. `phase_offsets: {<phase>: {baseline_shift}}`: when baseline
    readings come from a different phase, the baseline mean is shifted by the difference
    between the two phases' `baseline_shift` values. Limits are never shifted.
*   **Overall status:** worst per-measure status (critical > watch > nominal >
    insufficient); if every measure is insufficient, overall is insufficient.
*   **Baseline but no reading in the last 72 hours:** the baseline step is skipped; the
    latest value is checked against limits only.
*   **Reason codes:** `limit_watch`, `limit_critical`, `baseline_watch`,
    `baseline_critical`, `within_limits`, `insufficient_baseline`, `estimate_abnormal`
    (with `confirm_required: true` on the measure), `refuted_estimate`.
*   **`model_advice`:** `{probability, model_version, disagrees: boolean}` or `null` when
    the model is unavailable or lacks inputs. `assess()` is async (SHA-256 via Web Crypto).
*   **Batch reject reasons:** `invalid_schema`, `unknown_metric`, `out_of_bounds`,
    `bp_pair_invalid`, `missing_provenance`, `wrong_crew`, `future_timestamp`,
    `catalog_version_too_old` (more than one version behind), `daily_cap_reached` (the reply
    also carries `retry_after` in seconds until the next UTC day).
*   **Report body:** the client sends `client_id`, `device_id`, `subject_crew_id?`,
    `subject_label?`, `kind`, `created_at`, `payload_json` (steps with times, values,
    statuses, versions), `summary_text?`, `summary_edited`; the server sets `submitted_by`,
    `received_at`, `status`.
*   **Sync cursor:** `results` also stores `received_at`; `GET /api/sync` and
    `GET /api/crew/results` page by `(received_at, client_id)`, 500 rows per page.
*   **Crew progress formula:** for each crew member whose latest result is not watch or
    critical, days in the last 7 with at least one check-in, divided by 7; the route returns
    the mean as a percentage. Built in phase 5 with gamification.
*   **Session role:** taken from `crew.role` (the `access_codes.role` column is dropped).
*   **Outbox backoff:** 5 s base, doubling, 10 min cap, ±20% jitter.
*   **IndexedDB stores:** `measurements` (key `client_id`; indexes `[metric, measured_at]`,
    `received_at`), `results` (key `client_id`; index `assessed_at`), `reports` (key
    `client_id`; index `status`), `outbox` (key `client_id`; index `state`), `content` (key
    `id`), `settings` (key `key`).
*   **Service worker:** `@serwist/next` with `next build --webpack`; the `build` script
    changes to `next build --webpack` (Vercel runs it); `sw.ts` uses the `webworker` lib by a
    triple-slash reference; generated `public/sw.js` is in `.gitignore`.
*   **Synthetic CSV column map:** no time column (`time_column` is optional); records are
    ordered by phase then `phase_day`; label column `sick/fit`; `data_source`,
    `mean_arterial_pressure_mmHg` and `body_weight_lb` are ignored (constant or derived).
*   **Muse Spark call:** `fetch` to `https://api.meta.ai/v1/chat/completions` with model
    `muse-spark-1.3-contributor`; no SDK.
*   **Staging setup (phase 1):** `wrangler d1 create starplus-db-staging` (its id goes into
    `[env.staging]`); `wrangler d1 migrations apply starplus-db-staging --env staging
    --remote`; `wrangler secret put API_KEY --env staging`; `[env.staging.triggers]
    crons = []`; rate-limit `namespace_id` 1001 (auth) and 1002 (api), staging 2001 and
    2002; a staging crew member and access code issued with `POST /api/admin/crew` and
    `/api/admin/codes` for the load test.
*   **CI steps arrive with their files:** phase 0 CI runs typecheck, lint and tests; the
    `rehearse` step is added with item 26 and the citation check with item 41.

Paths are relative to each repo: **[B]** = `starplus-backend/`, **[F]** =
`starplus-frontend/`. Each phase has a date, ends with its tests passing, and is deployed
with the phase's deploy steps. Go/no-go: at the end of each day, if the phase due that
day is not done, the remaining stretch phases are cut from the end.

**Deploy steps (every phase):** backend — `npx wrangler d1 migrations apply starplus-db
--remote` (if a migration was added, after `wrangler d1 time-travel info starplus-db` and
`wrangler d1 export starplus-db --remote --output backups/<date>.sql`), then
`npx wrangler deploy`; frontend — push to `main` (Vercel builds it). Smoke test:
`GET /api/health` and load the home page.

### Phase 0 (2026-11-08): shared code, CI, demo script

1. **[B] `core/package.json`, `core/tsconfig.json`** (Create) — package `@starplus/core`,
   TypeScript source only (no build), `"type": "module"`, `exports` pointing at
   `src/index.ts`; target ES2022 with no DOM types so it compiles for the Worker; no
   enums or namespaces.
2. **[B] `core/src/index.ts`** (Create) — re-exports the modules below.
3. **[B] `tools/sync-core.sh`** (Create) — copies `core/` into `../starplus-frontend/core/`
   and writes `core.sha256` (hash of all files) in both.
4. **[B] `test/core-checksum.test.ts`, [F] `test/core-checksum.test.ts`** (Create) — fail
   if `core/` does not match `core.sha256`.
5. **[B] `package.json`** (Modify) — scripts `test` (vitest), `typecheck`, `lint` (eslint),
   `rehearse` (swap rehearsal); devDependencies `vitest`, `@vitest/coverage-v8`,
   `@cloudflare/vitest-pool-workers`, `eslint`, `typescript-eslint`, `tsx` (runs `tools/`
   scripts).
6. **[B] `vitest.config.ts`** (Create) — Workers pool for `test/routes/*`, node for the
   rest; coverage on `core/` with an 85% line threshold.
7. **[F] `package.json`** (Modify) — add `test` (vitest), `typecheck` (`tsc --noEmit`);
   dependencies `idb`, `@serwist/next`, `serwist`; remove `gsap`, `@gsap/react`,
   `framer-motion`; devDependencies `vitest`, `jsdom`, `fake-indexeddb`,
   `@playwright/test`; `build` becomes `next build --webpack`.
8. **[F] `vitest.config.ts`, `playwright.config.ts`** (Create) — vitest: jsdom with
   `fake-indexeddb`, `@starplus/core` alias; Playwright: starts `next start` on port 3100,
   Chromium and WebKit projects.
8a. **[B] `eslint.config.mjs`** (Create) — typescript-eslint recommended rules for `src/`,
   `core/`, `tools/`, `test/`.
8b. **[B] `test/setup/apply-migrations.ts`** (Create) — applies `migrations/` to the test D1
   with `applyD1Migrations`; referenced from `vitest.config.ts` together with
   `wrangler.configPath: "./wrangler.toml"`.
9. **[B] `.github/workflows/ci.yml`, [F] `.github/workflows/ci.yml`** (Create) — on push
   and daily at 06:00 UTC: install, typecheck, lint, test; backend also runs `npm run
   rehearse` and the citation check.
10. **[B] `docs/demo-script.md`** (Create) — the three-minute script: CUJ 1 (emergency in a
    blackout), CUJ 2 (self-check), CUJ 4 (estimate entry), CUJ 7 (report delivered and
    acknowledged), CUJ 6 (model swap), CUJ 8 (demo mode). Every scene uses minimum-version
    features only.
11. **[B] `docs/designs/self-check-platform.md`, `docs/designs/SITEMAP.md`** (Move from
    `Starplus v2/docs/designs/`).

### Phase 1 (2026-11-08 to 2026-11-09): core logic, model, server

12. **[B] `core/content/catalog.json`** (Create) — every measure in the limit table, with
    all catalog fields, `limit_source` text for each limit, `sd_floor` values (heart rate
    3, SpO2 1, temperature 0.2, systolic 4, diastolic 3, respiratory rate 1, glucose 5;
    others 5% of the baseline mean), `aliases` for the synthetic CSV columns.
13. **[B] `core/src/catalog.ts`** (Create) — loads and validates the catalog; lookup by code
    or alias; unit conversion (lb→kg, °F→°C, mmol/L→mg/dL); exports `ROLES`,
    `SETTINGS`, `PHASES`, `catalogVersion`.
14. **[B] `core/src/record.ts`** (Create) — types `Draft`, `Measurement`, `Result`,
    `Report`; `normalise(draft, context)`; `validateRecord` (UUID `client_id`, provenance
    required, bounds); `validateCapture` (BP pair).
15. **[B] `core/src/assess.ts`** (Create) — `assess(history, context)` implementing the
    colour rule exactly as in Proposed Architecture; `inputsHash` (SHA-256 of sorted
    `client_id`s); phase offsets; latest non-voided value; estimate handling returns
    `confirm_required`.
16. **[B] `core/src/model.ts`** (Create) — `model.json` schema check, catalog input check,
    reference-case check (tolerance 0.001), non-constant check; `predict(features)`;
    returns `{ok, model}` or `{ok: false, reason}`.
17. **[B] `core/content/model.json`** (Create) — placeholder trained on the synthetic CSV;
    `training_data.provenance = "synthetic"`.
18. **[B] `core/test/assess.test.ts`, `core/test/model.test.ts`, `core/test/record.test.ts`,
    `core/test/catalog.test.ts`** (Create) — colour rule order (limit beats baseline;
    baseline never lowers; model never changes colour; grey before baseline; a critical
    SpO2 with no baseline is critical); phase offsets; voids and corrections; BP pairing;
    provenance required; model checks; conversions; every limit has a source; every
    measure has one body system; the 140/180 systolic values; benchmark under 300 ms.
19. **[B] `ml/requirements.txt`** (Create) — pandas, numpy, scikit-learn, pyyaml, pytest.
20. **[B] `ml/column_map.py`** (Create) — reads a column-map YAML, renames columns to
    catalog codes, converts units, parses phase (for the synthetic CSV, `preflight_L-90`
    → `preflight`, day −90; `inflight_day21` → `inflight`, day 21).
21. **[B] `ml/labelled_rows.py`** (Create) — features `latest` and `baseline_z` from each
    person's earlier rows only; logistic regression; grouped split by person (5 folds plus
    20% held-out people); writes `model.json` with `reference_cases` (20 rows) and an
    evaluation summary.
22. **[B] `ml/time_series.py`** (Create) — per-measure, per-phase median and 5th–95th
    percentile ranges; writes `phase_offsets` and typical ranges into a catalog patch file
    `ml/out/catalog_patch.json`, applied with `tools/apply-catalog-patch.ts`.
23. **[B] `tools/apply-catalog-patch.ts`** (Create) — merges the patch into
    `core/content/catalog.json` and bumps `catalog_version`.
24. **[B] `ml/maps/synthetic.yaml`** (Create) — column map for the synthetic CSV.
25. **[B] `ml/check_model.mjs`** (Create) — runs `core/src/model.ts` checks on a given
    `model.json` with Node's built-in type stripping; exits non-zero on failure.
26. **[B] `ml/rehearse.py`, `ml/test_rehearse.py`** (Create) — shuffles and renames the
    synthetic CSV's columns, writes a matching map, runs `labelled_rows.py`, then
    `check_model.mjs`; asserts Python and Node predictions on the reference cases agree
    within 0.001.
27. **[B] `ml/MODEL_CARD.md`** (Create) — data provenance, method, evaluation, limits, and
    that the placeholder is synthetic.
28. **[B] `ml/data/astronaut_health_SYNTHETIC.csv`, `ml/data/how_data_was_generated.txt`**
    (Add to git; currently untracked).
29. **[B] `migrations/0003_self_check.sql`** (Create) — the tables in "Database tables"
    exactly; no changes to existing tables; no data copied.
30. **[B] `src/env.ts`** (Create) — `Env` type: `DB`, `ENVIRONMENT`, `API_KEY`,
    `RATE_LIMIT_AUTH`, `RATE_LIMIT_API`, `ATTACHMENTS` (R2, stretch).
31. **[B] `src/http.ts`** (Modify) — `json`, `error`, `preflight` take the request to echo an
    allowed origin; add `Vary`, `X-Request-Id`, `Access-Control-Expose-Headers`; allowed
    origins: `https://starplus-frontend.vercel.app` and
    `^https://starplus-frontend-[a-z0-9-]+-mahirs-projects-9649281e\.vercel\.app$`; keep
    `checkAuth` and `timingSafeEqual` for admin routes.
32. **[B] `src/auth.ts`** (Create) — admin crew, code issue and revoke; `POST /api/auth`;
    `requireSession(request, env, roles)` returning `{crew_id, role}`.
33. **[B] `src/sync.ts`** (Create) — batch handler per the API contract; multi-row
    `INSERT ... ON CONFLICT(client_id) DO NOTHING RETURNING client_id`; duplicates are
    items not returned; rejects `measured_at` more than 1 day ahead of server time;
    per-astronaut daily cap 5,000; `GET /api/sync`.
34. **[B] `src/reports.ts`** (Create) — `POST /api/reports`, `GET /api/reports`,
    `POST /api/reports/ack`.
35. **[B] `src/crew.ts`** (Create) — `GET /api/crew/results` for the flight medical officer.
    (`GET /api/crew/progress` is added in phase 5, item 75a.)
36. **[B] `src/index.ts`** (Modify) — route the new endpoints; `/api/health` runs
    `SELECT 1`; wrap the existing cron's per-astronaut loop in try/catch (old cron kept
    for old tables until after 2026-11-13); request ID on every response; old routes
    unchanged.
37. **[B] `wrangler.toml`** (Modify) — two `[[ratelimits]]` bindings (`RATE_LIMIT_AUTH`:
    10 per 60 s; `RATE_LIMIT_API`: 60 per 60 s, each with a `namespace_id`); `[env.staging]`
    redeclaring `d1_databases` (new database `starplus-db-staging`), `vars`, rate limits;
    no cron in staging.
38. **[B] `test/routes/*.test.ts`** (Create: `auth`, `batch`, `reports`, `cors`, `health`) —
    code issue, single use, expiry, revoke; batch replay returns duplicates, not new rows;
    cross-astronaut write rejected; reject reasons; rate limit returns 429; provenance
    required; CORS for preview and foreign origins; health with D1.
39. **[B] `.dev.vars`** (local only, not committed) — `API_KEY` for tests.

### Phase 2 (2026-11-09 to 2026-11-10): storage, login, self-check, emergency, content

40. **[B] `core/content/kb/<entry-id>.json`** (Create) — one file per entry: each catalog
    measure (`kb/measure-heart-rate.json` etc.), each first-aid protocol
    (`kb/firstaid-unresponsive.json`, `-cpr`, `-choking`, `-bleeding`, `-burns`,
    `-anaphylaxis`, `-low-blood-sugar`, `-fainting`, `-chest-pain`), each HRP hazard
    (`kb/hazard-radiation.json` and four others).
41. **[B] `tools/check-citations.ts`, `core/test/content.test.ts`** (Create) — every KB and
    formulary entry and every catalog limit has a source; every `guidance_key` resolves.
42. **[F] `src/lib/db.ts`** (Create) — `idb` databases and stores per "Storage, sync and
    identity", with upgrade functions and `schema_version`.
43. **[F] `src/lib/session.ts`** (Create) — login with code, token storage per profile,
    profile PIN, role.
44. **[F] `src/lib/outbox.ts`** (Create) — batch send, `max_items`, backoff, per-item
    states, emergency reports waiting for any session.
45. **[F] `src/lib/api.ts`** (Modify) — new endpoints with token; errors surface to the
    outbox instead of returning null; old functions removed after the old home page goes.
46. **[F] `src/app/login/page.tsx`, `src/app/check/page.tsx`, `src/app/result/page.tsx`,
    `src/app/emergency/page.tsx`, `src/app/reports/page.tsx`** (Create) — static routes
    with client components.
47. **[F] `src/components/emergency-button.tsx`, `measure-form.tsx`, `citation.tsx`,
    `model-view.tsx`** (Create).
48. **[F] `src/components/dashboard/empty-state.tsx`** (Modify) — becomes the status card,
    with a grey `insufficient` tone.
49. **[F] `src/app/layout.tsx`** (Modify) — self-hosted font; wraps children in a client
    `AppShell` (from `dashboard-shell.tsx`) that shows the emergency control, setting and
    phase, and the demo banner.
50. **[F] `src/components/navigation/dashboard-shell.tsx`, `mobile-nav.tsx`** (Modify) — nav
    items for the new routes.
51. **[F] `src/app/page.tsx`** (Modify) — astronaut home (reminder, overall status, links).
52. **[F] `src/components/hero/`, `bento/`, `marquee/`, `accordion/`,
    `dashboard/role-switcher.tsx`, `dashboard/skeleton-loader.tsx`** (Delete).
53. **[F] `public/fonts/satoshi-*.woff2`** (Create) — self-hosted font files.
54. **[F] `src/app/sw.ts`, `next.config.ts`** (Create / Modify) — Serwist service worker
    and config; `headers()` sets `Cache-Control: no-cache` on `/sw.js`.
55. **[F] `public/sw-kill.js`** (Create) — unregisters the worker; used only for rollback.
56. **[F] `src/app/manifest.ts`** (Create) — web app manifest (Next adds the link).
57. **[F] `test/db.test.ts`, `test/outbox.test.ts`, `test/session.test.ts`** (Create) —
    upgrades, outbox states and retries, emergency report sent under the next session,
    PIN check.

### Phase 3 (2026-11-10 to 2026-11-11): settings, charts, surgeon view, demo, explanations — end of minimum version

58. **[F] `src/app/settings/page.tsx`, `src/lib/comms-link.ts`** (Create) — setting, phase,
    mission start date, comms simulation, data notice.
59. **[F] `src/app/history/page.tsx`** (Create) and **`src/components/dashboard/vital-chart.tsx`**
    (Modify) — baseline band and typical range.
60. **[F] `src/app/surgeon/page.tsx`** (Create) — role-gated report list, acknowledge.
61. **[F] `src/app/demo/page.tsx`** (Create) — demo store seeded from
    `core/content/demo-crew.json` (created in [B] by item 63 and synced); outbox disabled;
    exports watermarked SYNTHETIC.
62. **[F] `src/components/dashboard/demo-badge.tsx`** (Modify) — becomes the full-width
    banner.
63. **[B] `tools/build-demo-crew.ts`, `core/content/demo-crew.json`** (Create) — builds a
    30-day synthetic crew from the synthetic CSV.
64. **[B] `core/explain/filters.ts`, `core/explain/templates.ts`** (Create) — filters and
    template filling.
65. **[B] `tools/pregenerate.ts`, `tools/prompts/explain-entry.md`,
    `tools/prompts/result-template.md`** (Create) — reads `MODEL_API_KEY` from
    `../.secrets/meta-model-api-key`, calls `muse-spark-1.3-contributor` via the
    OpenAI-compatible Chat Completions API, writes `core/content/explain-cache.json`.
66. **[B] `tools/review.ts`** (Create) — side-by-side review, marks `reviewed`, runs filters.
67. **[B] `core/test/explain.test.ts`, `tools/eval/cases.json`** (Create) — filter cases: an
    invented dose, an invented number, a softened amber, an invented interaction; all must
    be rejected; every shipped item is `reviewed`.
67a. **[B] `tools/load-import.ts`** (Create) — posts the synthetic CSV's rows to the
    batch endpoint of a given base URL with a staging access code; reports accepted,
    duplicates and timing.
68. **[F] `test/e2e/cuj.spec.ts`** (Create) — Playwright: CUJ 1 offline, CUJ 2 under 60 s,
    CUJ 3, CUJ 4, CUJ 5 offline, CUJ 8; runs on Chromium and WebKit.

### Phase 4 (2026-11-11, stretch): tests, import, body map, domains

69. **[F] `src/lib/adapters/questionnaire.ts`, `reaction-test.ts`, `import-csv.ts`,
    `import-fhir.ts`** (Create).
70. **[F] `src/app/body/page.tsx`, `src/components/body-map.tsx`** (Create) — figure and
    list view; no-data systems grey.
71. **[F] `src/app/history/page.tsx`** (Modify) — radiation, nutrition, exercise filters.
72. **[F] `test/adapters.test.ts`** (Create) — import of the synthetic CSV and a FHIR sample.

### Phase 5 (2026-11-12 morning, stretch): Bluetooth, voice, gamification, medicines

73. **[F] `src/lib/adapters/ble-profiles.ts`, `ble-parse.ts`, `ble-simulator.ts`**
    (Create); devDependency `@types/web-bluetooth`.
74. **[F] `src/lib/adapters/voice.ts`** (Create).
75. **[B] `core/src/gamification.ts`, `core/test/gamification.test.ts`** (Create).
75a. **[B] `src/progress.ts`** (Create) and **`src/index.ts`** (Modify) — `GET
    /api/crew/progress` using the formula in Fixed implementation decisions.
76. **[F] `src/app/progress/page.tsx`, `src/components/readiness-ring.tsx`** (Create).
77. **[B] `core/content/formulary.json`** (Create); **[F] `src/app/medicines/page.tsx`**
    (Create).
78. **[F] `test/ble.test.ts`, `test/voice.test.ts`** (Create) — parsers against simulator
    bytes (and recorded device bytes if available); number grammar.

### Phase 6 (2026-11-12 afternoon, stretch): camera, disclosure, freeze

79. **[F] `src/lib/adapters/ocr.ts`, `camera-hr.ts`, `attachment.ts`** (Create); dependency
    `tesseract.js`.
80. **[B] `wrangler.toml`** (Modify) — private R2 bucket `starplus-attachments` with a
    90-day lifecycle delete rule; **[B] `src/reports.ts`** (Modify) — attachment upload,
    2 MB cap after compression, `GET /api/attachments/<id>` for the sender and the flight
    medical officer only.
81. **[B] `docs/disclosure.md`** (Create) — what existed before 2026-11-14; synthetic data;
    AI tools used (Claude for development; Meta Muse Spark in Contributor mode for
    build-time explanations); no clinical review.
82. **[B] `README.md`, [F] `README.md`** (Modify) — overview, architecture, data sources,
    how to run, how to swap the model.
83. **Freeze (evening of 2026-11-12):** tag both repos `freeze-2026-11-12`; record the Worker
    version ID.

### After 2026-11-13 (not part of this plan's deadline)

Remove old routes, `src/watch.ts`, `src/validate.ts`, `test/logic.test.ts` (it imports
both), the old cron, and the `vitals`, `watch_signals` and `astronauts` tables; merge the
repos.

### Verification Plan

*   **Build:** `npm run build` in [F]; `npx wrangler deploy --dry-run` in [B].
*   **Unit and integration:** `npm test` in both repos (core, routes with the Workers pool,
    frontend with fake IndexedDB); `pytest ml/`.
*   **Static analysis:** `npm run typecheck`, `npm run lint` in both.
*   **Content:** `tools/check-citations.ts`; filter cases; all shipped explanations
    reviewed.
*   **Swap rehearsal:** `npm run rehearse`, daily in CI and before the freeze.
*   **End to end:** Playwright CUJ suite (Chromium, WebKit), including network-off runs and
    the 60-second CUJ 2 timing.
*   **Load:** `tools/load-import.ts` posts the synthetic CSV's 1,260 rows through the batch
    endpoint against `wrangler dev --env staging --remote` (staging D1 only).
*   **Manual:** CUJs 1–5 and 8 on an installed iPhone (Safari) and Android Chrome.
*   **Coverage:** 85% of lines in `core/`.

--------------------------------------------------------------------------------

*Drafted with EGM*

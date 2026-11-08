# Phase 6 progress — camera, disclosure, freeze

Phase 6 is stretch (items 79–83). Gate: `docs/disclosure.md` written; READMEs
updated; both repos tagged `freeze-2026-11-12`.

## Item 79 — camera adapters (frontend)

- `src/lib/adapters/ocr.ts`: `parseDisplayReading` (digits with units,
  "120/80" and "120 over 80" BP pairs, °F→°C, mmol/L→mg/dL, lb→kg; bare
  numbers return nothing, a lone mmHg gets `metric: null`) plus
  `recognizeDisplay` (Tesseract.js loaded on demand; needs a link the first
  time, works offline after its download).
- `src/lib/adapters/camera-hr.ts`: `estimateHeartRate` (parabolic-interpolated
  peak intervals over the red channel; null when flat, short or out of range)
  plus `startCameraReader` (getUserMedia + canvas sampling).
- `src/lib/adapters/attachment.ts`: `compressImage` (canvas downscale + JPEG
  quality loop, passthrough when already small), `blobToBase64`,
  `uploadAttachment`, 2 MB cap constant.
- Dependency: `tesseract.js`.
- Tests: `test/ocr.test.ts` (8), `test/camera-hr.test.ts` (5, synthetic 72
  bpm sine), `test/attachment.test.ts` (4).

## Item 80 — R2 attachments (backend)

- R2 buckets `starplus-attachments` and `starplus-attachments-staging` created
  with a 90-day expire lifecycle rule (`expire-90-days`, all prefixes).
- `wrangler.toml`: `[[r2_buckets]]` `ATTACHMENTS` binding in production and
  staging.
- `src/reports.ts`: `POST /api/attachments` (any session; UUID id, image
  content type, base64 body, 413 past 2 MB; R2 key `attachments/<id>` with
  `submitted_by`/`report_client_id` metadata, idempotent by id) and
  `GET /api/attachments/<id>` (sender or flight medical officer, else
  403/404; 503 when the binding is missing).
- `test/routes/attachments.test.ts` (4): 401, 400/413 validation, one
  round-trip test (store, serve sender with bytes, refuse other crew, allow
  FMO, 404 unknown). R2 writes stay inside a single test: the workers pool
  isolates storage per test, and unconsumed response streams break its
  teardown — every fetched body is consumed.
- Frontend: emergency review has "Photo (optional)" (compress → inline
  `data_base64` in the queued report); `flush()` uploads pending photos via
  `uploadReportAttachments` before `POST /api/reports` in both the session
  and orphan-emergency paths (idempotent retry); `test/outbox.test.ts` covers
  upload-then-send with data stripped.

## New input screens (frontend)

- `/check/camera`: photo → Tesseract → text shown → editable preview (shared
  `ReadingPreview`: empty "Choose a measure" default, Save gated on every row
  having a measure) → save as `ocr`; manual "type what the display shows"
  input runs the same parser. No measure ever defaults.
- `/check/camera-hr`: fingertip video → live estimate → Save as `camera_hr`
  with `is_estimate: 1` (never used for baselines); greyed with a reason when
  the browser has no camera; "Simulate a signal" for tests.
- Both linked from "Other ways", precached, and in `offline-routes.spec.ts`.
- E2E `test/e2e/camera.spec.ts`: display saves a typed BP pair offline;
  camera HR saves a simulated 72 bpm signal offline.

## Item 81 — disclosure (backend)

- `docs/disclosure.md`: what existed before 2026-11-14, synthetic data, AI
  tools (Claude for development; Meta Muse Spark in Contributor mode for
  build-time explanations), no clinical review.

## Item 82 — READMEs

- Backend README rewritten: overview, architecture, self-check endpoints,
  data sources, how to run, how to swap the model.
- Frontend README rewritten: overview, architecture, data sources, how to
  run, how to swap the model.

## Item 83 — freeze (left for the freeze step)

- Production Worker version at phase start: `8aa88105-bdda-4a0d-b286-37f3adf21f25`
  (created 2026-11-07; Phase 5 did not redeploy the backend).
- The `freeze-2026-11-12` tags are NOT created here: freezing follows audit,
  merge and deploy on the author's go-ahead.

## Counts

- Backend unit 110/110 (incl. 4 attachments); frontend 205/205.
- Typecheck clean both repos; lint 0 errors (2 pre-existing demo warnings);
  citation check ok; `build:staging` clean with /check/camera and
  /check/camera-hr prerendered; `core/` identical.
- Offline routes 2/2 Chromium + 2/2 WebKit; camera e2e 2/2 both;
  bluetooth/voice e2e 3/3 both; import e2e 3/3 both. CUJ and offline-form/sync
  need staging codes (auditor reruns). NOT merged; NOT tagged.

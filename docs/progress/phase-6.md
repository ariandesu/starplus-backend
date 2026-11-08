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

## AA1–AA4 fixes (audit-2026-11-08-phase6, do not merge)

- AA1: `POST /api/attachments` heads the key first — same sender and size →
  200 idempotent retry, anything else → 409. Allowlist JPEG/PNG/WebP only,
  with magic-byte checks (`FF D8 FF`, `89 50 4E 47`, `RIFF....WEBP`); bodies
  over 3 MB rejected before parsing (content-length gate plus the 2 MB
  decoded cap). GET carries nosniff, `sandbox` CSP and an inline
  disposition. Route tests (6): validation, JPEG/WebP magic, the exact
  overwrite probe (B's SVG → 400, B's PNG → 409, A still served, retry →
  200, changed bytes → 409), and a role test (sender + FMO 200, other
  astronaut + mission_control 403). Test-pool notes: R2 writes must stay
  inside a single test, and every fetched body must be consumed, or
  isolated-storage teardown fails.
- AA2: `docs/disclosure.md` rewritten with the true timeline (existing
  repos, work 2026-11-07 → 2026-11-12, event 2026-11-14, model swap
  2026-11-13) and the true roles (Claude: design, handoff, audits, deploys,
  explanation review, as an AI; Muse Spark Contributor model: code; its
  explanations; Meta may train on Contributor input; only public KB text
  sent). Both READMEs point at it.
- AA3: the surgeon view's report detail shows photo thumbnails (fetch with
  bearer → blob → object URL `<img>`, revoked on unmount, never opened in a
  new tab); 404 renders "Photo expired (90 days)". E2E with an FMO session
  (thumbnail + expiry) and a backend role test.
- AA4: `compressImage` always re-encodes through a canvas (JPEG, longest
  side ≤ 1,600) and `stripApp1Segments` removes encoder-added APP1 markers,
  so phone GPS metadata never survives. Unit tests (magic + EXIF strip +
  scaling) and an e2e that queues a crafted EXIF photo and asserts
  `FF D8 FF`, no `Exif` marker and ≤ 2 MB in the outbox.

## Counts

- Backend unit 112/112 (incl. 6 attachments); frontend 206/206.
- Typecheck clean both repos; lint 0 errors (2 pre-existing demo warnings +
  one benign next/image warning for blob: thumbnails); citation check ok;
  `build:staging` clean; `core/` identical.
- Offline routes 2/2, camera 2/2, bluetooth/voice 3/3, import 3/3,
  surgeon-photos 1/1, emergency-photo 1/1 — all on Chromium and WebKit
  (fresh `build:staging`). CUJ and staging-code suites left for the auditor.
  NOT merged; NOT tagged.

# Phase 3 progress — settings, charts, surgeon, demo, explanations, CUJ suite (NOT merged, gate NOT passed)

The Phase 2 gate passed on staging (auditor ran `test/e2e/gate-live.spec.ts`: 4/4).
The Phase 3 gate did NOT pass (audit `audit-2026-11-08-phase3a.md`): one
offline test fails on query-string URLs (K1) and the explanation filter lets
invented numbers through (K2). K1–K4 below are implemented on `phase-3`;
do NOT merge until the auditor reruns the CUJ suite and the load test.

## 1. Design items (Phase 3: 58–68) — implementation complete

- 58: `src/app/settings/page.tsx`, `src/lib/comms-link.ts` (setting, phase,
  mission start, blackout simulation, data notice).
- 59: `src/app/history/page.tsx` + baseline band and typical-range label in
  `vital-chart.tsx`.
- 60: `src/app/surgeon/page.tsx` (role-gated report list, acknowledge).
- 61: `src/app/demo/page.tsx` (demo store seeded from
  `core/content/demo-crew.json`, outbox disabled in demo mode, watermarked
  SYNTHETIC export); 62: `demo-badge.tsx` is now the full-width banner.
- 63: `tools/build-demo-crew.ts` → `core/content/demo-crew.json` (30-day
  synthetic crew from the synthetic CSV, deterministic).
- 64: `core/explain/filters.ts` + `templates.ts`.
- 65: `tools/pregenerate.ts` + `tools/prompts/` (reads `MODEL_API_KEY` from
  the environment per HANDOFF §3, never from a workspace file — see
  deviations log). Not run: needs the author's key.
- 66: `tools/review.ts` (list / approve / reject).
- 67: `core/test/explain.test.ts` + `tools/eval/cases.json` (invented dose,
  invented number, softened amber, invented interaction all rejected).
- 67a: `tools/load-import.ts` (posts a mapped CSV to a batch endpoint;
  ` --metric` selects columns, reruns are idempotent by deterministic IDs).
- 68 + G1: `test/e2e/cuj.spec.ts` (CUJ 1 offline, CUJ 2 under 60 s, CUJ 3
  grey first measure, CUJ 4 estimate + confirm, CUJ 5 offline explain, CUJ 8
  demo, offline-queued emergency report delivered after reconnect) and
  `test/e2e/gate-live.spec.ts` (API-level gate, already 4/4 on staging).
- Audit G-items: G2 `provenance_mismatch` reject + route test (server also
  returns crew provenance from `/api/auth` so the device labels records
  correctly — additive API change, recorded in deviations); G3 in-flight
  CPR keeps "100 to 120 compressions per minute, 5 to 6 cm deep";
  H1 staging CORS origins via request-scoped config.
- S1 shared-device login, S2 per-device PIN salt, W1 branch-aware
  cross-repo core check (carried over).

## 1b. Phase 3 gate fixes (audit-2026-11-08-phase3a, implemented, awaiting auditor rerun)

- K1: all 15 app routes precached including `/result`; navigations match by
  path ignoring the query string (custom `Route` with `ignoreSearch`
  matching on the documents cache); new `test/e2e/offline-routes.spec.ts`
  loads every route with and without a query, online then offline. Staging
  deployed with the fix (worker `b9b738f6`); preflight from localhost:3100
  returns the allow header, foreign origins get none, production unchanged.
- K2: `filterExplanation` checks every number one at a time against source
  numbers (integers, decimals); word lists match on word boundaries; audit
  probes added to `tools/eval/cases.json`. `pregenerate` NOT run (no key).
- K3: `load-import` maps every row into the past ending at now, prints
  rejections by reason, accepts `--person`, accepts `--name value` and
  `--name=value`. Loads target dedicated crew `stg-load-1` (TO BE CREATED
  by the author). Cleanup of `stg-astro-2` on staging PROPOSED, awaiting
  explicit author OK — NOT done.
- K4: gate commands in this report corrected (staging URL for the CUJ
  suite; one code per Playwright project); audit copy is in
  `docs/audits/`.

## 1c. Gate rerun fixes (audit-2026-11-08-phase3b: L1/L2 fixed; audit-2026-11-08-phase3c: K1–K5 fixed; audit-2026-11-08-phase3d: M1–M3 test-only)

- L1 (real fix): offline navigations are served by a native `fetch`
  listener registered before Serwist's own, matching the precached
  document by path and ignoring the query string. Serwist's default routes
  shadowed the old custom `Route`, so it never ran; the new listener runs
  first deterministically. `precacheOptions.ignoreURLParametersMatching`
  was tried and removed again (unneeded once the listener handles
  navigations; avoids matching data requests to HTML docs). An explicit
  `ServiceWorkerRegister` component was added because the auto-injected
  registration did not fire reliably in tests.
- L2: `POST /api/measurements/batch` checks the existing row's `crew_id`
  on `client_id` conflict — different crew is rejected with the new reason
  `client_id_conflict` (same crew stays a duplicate). Route test added.
  `load-import` seeds `client_id` with the crew ID.
- M1: dropped the `context.serviceWorkers().length` assertion from
  `offline-routes.spec.ts` (Playwright only reports service workers on
  Chromium; `controller !== null` already proves control on every browser).
- M2: removed the retry loop. Added `waitForURL` after each offline goto
  so a dropped navigation fails loudly. The first loop test is
  `test.fixme` on Chromium only (second test unaffected).
- M3: renamed the second offline test to "…to the self-check page" (it
  navigates to `/check`, not `/result`).

### M2 evidence (Chromium intermittent offline navigation; corrected by N1)

- Symptom: ~1 in 5 runs, one offline `page.goto` resolves with no error
  but the URL does not change (e.g. `NAV[2] /check now=/login`). Retries
  sometimes land it, sometimes not.
- Ruled out: service-worker restart (same boot ID across the miss),
  controller loss (`activated` throughout), handler not running
  (temporary SW log showed `fetch <path>` + `precache <path> -> HIT`
  for the missed navigation itself), wrong document (precached docs
  verified byte-correct: `/check` shell without h1 as prerendered,
  `/login` with form), main-thread stall (page evaluates fine).
- Decisive trace: `framenavigated` shows the target committing
  (`/history`), then two navigations back to the previous page
  (`/emergency`). `performance.getEntriesByType("navigation")` on a
  reverted page reports `type: "reload"` for the previous page's URL.
  The only automatic reload in the bundle is @serwist/next's injected
  `window.addEventListener("online", () => location.reload())`: a
  spurious `online` event during offline emulation aborts the in-flight
  navigation and reloads the current (previous) page.
- First conclusion (wrong): harness-only artifact, test quarantined.
  Correction per audit-2026-11-08-phase3e (N1): it is a real app bug —
  on the station the link drops and returns constantly, and the reload
  wipes a half-done self-check (auditor reproduced live). Fixed with
  `reloadOnOnline: false` in `next.config.ts`; `test.fixme` removed;
  new env-gated e2e test `test/e2e/offline-form.spec.ts` (login, type
  offline, reconnect, assert no reload and value intact).

## 1d. Gate rerun fixes (audit-2026-11-08-phase3e: N1 reload on reconnect, N2 login errors)

- N1: `reloadOnOnline: false` in `withSerwistInit` (`next.config.ts`), so
  coming back online never reloads the page. Outbox flush was
  user-initiated at the time (`Send now` on `/reports`); P1 below makes
  it automatic as well, and the auditor reruns the CUJ reconnect flow
  with fresh codes.
- N2: `login()` (`src/lib/session.ts`) now throws a distinct message per
  case — no response (network/CORS/offline): "Can't reach the server…Your
  code has not been used."; 401: "That code did not work…"; 429: "Too
  many tries…"; anything else: generic. The login page surfaces the thrown
  message. Unit tests cover all four cases (`test/session.test.ts`).
  `/settings` shows the API host ("Server: …") so a build pointed at the
  wrong backend is visible. `npm run build:staging` added to
  `package.json` and used in the staging gate commands above.

## 1e. Gate rerun fixes (audit-2026-11-08-phase3f: P1 auto-sync, P2 login save failure)

- P1: new `useOutboxSync` hook (`src/components/outbox-sync.tsx`,
  mounted once in `AppShell`) backed by `src/lib/outbox-sync.ts`.
  It calls `flush()` on app open when a session exists, on the `online`
  event, after every `enqueue*` (via a new `onQueued` listener registry
  in `outbox.ts`), and right after login (`login/page.tsx` calls
  `requestOutboxSync()`), plus a timer at `outbox_next_retry_at` while
  items wait (reads the backoff already stored by `flush()`). A single
  in-flight lock (`requestOutboxSync`) prevents overlapping sends;
  `flush()` already no-ops in demo mode so nothing sends there.
  "Send now" stays as a manual push.
- P1 tests: `test/outbox-sync.test.ts` covers all triggers (app open
  with/without session, post-login request, online event, enqueue,
  backoff timer) plus the single-flight lock and the demo guard; new
  env-gated e2e `test/e2e/offline-sync.spec.ts` (login, offline, record,
  reconnect, wait for the outbox to empty without opening Reports;
  skips without a staging code). CUJ reconnect step no longer taps
  "Send now" — it waits for the auto-delivered report.
- P2: `login()` wraps everything after `res.ok` (JSON parse, IDB
  writes); on failure it throws "Logged in, but this device could not
  save the session. Ask for a new code if it keeps happening." Unit test
  with a 200 non-JSON response.
- Counts (no retries, no fixme): offline suite 2 passed Chromium,
  2 passed WebKit. Unit: 65 frontend (incl. 9 new sync + 3 new login) and
  88 backend pass. Typecheck, lint, `build:staging` clean.

## 1f. Gate rerun fixes (audit-2026-11-08-phase3g: Q1 backoff gate)

- Q1: `flush()` takes `{ force?: boolean }`. "Send now" and the `online`
  trigger pass `force: true`, which clears the stored backoff and sends at
  once. Automatic triggers (`requestOutboxSync()` without force) skip
  while `navigator.onLine` is false — no failure recorded, no backoff set.
  Consecutive failures are counted in a stored `outbox_failures` setting:
  backoff is `computeBackoffMs(count)` (5 s base, doubling, 10 min cap,
  ±20% jitter) with +1 per failed send and a reset to 0 on any successful
  send or forced send. A dirty flag runs one more send if anything was
  queued mid-send (`requestOutboxSync` in-flight lock).
- Q1 tests: unit tests for forced send (ignores + clears backoff),
  offline skip (no failure recorded), consecutive doubling (5 s → 10 s)
  with reset on success, and enqueue-during-send leading to a second
  send — all with real short timers (fake timers stall fake-indexeddb).
  `offline-sync.spec.ts` now waits for the batch request within 3 s of
  reconnecting. The CUJ reconnect step (no Send now tap) is unchanged
  and covers the live path with fresh codes.
- Counts (no retries, no fixme): offline suite 2 passed Chromium,
  2 passed WebKit. Unit: 72 frontend (incl. 14 sync + 8 session) and
  88 backend pass. Typecheck, lint, `build:staging` clean. CUJ suite NOT
  run locally (needs staging codes; the auditor reruns it).

## 1g. Gate rerun fixes (audit-2026-11-08-phase3h: R1 live updates, R2 forced follow-up, R3 banner)

- R1: new `onSynced` listener registry in `outbox-sync.ts` (same pattern
  as `onQueued`). `requestOutboxSync` fires it after any send that changed
  something (`sent > 0`, `failed > 0`, or any item's state/error changed,
  detected via an outbox fingerprint); the `onQueued` hook also fires it
  on every enqueue. `/reports` and the emergency queued screen subscribe
  and re-read on sync and on `visibilitychange` visible, so a background
  send updates the screen without a manual refresh.
- R2: `dirtyForce` carries force into the follow-up send, so a "Send now"
  or `online` trigger that lands mid-send still sends immediately instead
  of waiting out the backoff the failed send just set.
- R3: the waiting banner reads "sending when the link is up" whenever any
  session exists (`hasActiveSession()`), keeping "log in to send it" only
  when logged out. The emergency queued screen shows "Report sent" once
  the outbox no longer holds it.
- Tests: `onSynced` fires after a delivering send and not after a no-op;
  forced follow-up after a failing send; banner copy covered by the CUJ
  reconnect assertions. Counts (no retries, no fixme): offline suite
  2 passed Chromium, 2 passed WebKit. Unit: 72 frontend + 88 backend
  pass. Typecheck, lint, `build:staging` clean. CUJ suite NOT run
  locally (needs staging codes; the auditor reruns it).

## 1h. Explanation review fixes (review-2026-11-08-explanations: T1–T3)

- `core/content/explain-cache.json` committed exactly as generated
  (27 reviewed, 6 rejected); shipped to the app via `sync-core.sh`.
- T1: `getExplanation(entryId, level)` (`src/lib/kb.ts`) recomputes the
  `sha256(id + "\n" + text.join("\n"))` + `:standard+simple:<model>:prompts-v1`
  key and returns text only when `status === "reviewed"`. "Explain more
  simply" shows the reviewed simple text with the AI label; anything else
  shows the source text labelled "From the cited source" with no AI label.
  Unit tests: reviewed entry returns AI text, rejected entry and edited
  source fall back (`test/explain-cache.test.ts`).
- T2: the prompt keeps every qualifier word for word (normal/normally,
  at least, no sooner than, only if, never, do not, at once); the ban on
  "normal"/"fine" applies only to describing the reader's own results.
  `core/explain/filters.ts` gained a must-keep check (word boundaries,
  case-insensitive, ordered words with gaps allowed; source count or more
  required) and flags "normal"/"fine" as softening only when the source
  lacks them. Three must-reject cases added to `tools/eval/cases.json`.
  `PROMPT_VERSION` unchanged; change logged in `docs/designs/deviations.md`.
- T3: `pregenerate` logs a rejection, skips that entry, writes the cache
  after each entry, and exits non-zero if anything was skipped (reviewed
  entries are still skipped cleanly). Counts: unit 76 frontend
  (incl. 4 new explain-cache) + 88 backend; filter eval green;
  typecheck, lint, `build:staging`, offline suite 2 passed Chromium,
  2 passed WebKit. CUJ suite NOT run locally (needs staging codes).

## 2. Checks (local, no codes needed)

- Backend: `npm test` 15 files pass; typecheck, lint clean; citation check
  green; coverage 87% lines on `core/`.
- Frontend: typecheck, lint clean; 53 vitest tests pass; `next build
  --webpack` succeeds.
- Playwright (Chromium, local build): CUJ 1 offline green, CUJ 8 demo green;
  staging specs skip cleanly without codes.
- CI green on both `phase-3` branches.

## 3. Phase 3 gate — STOPPED, needs the author

Not run (needs author-held secrets and codes):
1. CUJ suite against staging, one project at a time (each Playwright project
   burns its own single-use code; codes for stg-astro-1 and stg-fmo-1 remain,
   plus one for stg-load-1 once created):
   `npm run build:staging && NEXT_PUBLIC_API_BASE=https://starplus-backend-staging.shareflow.workers.dev STARPLUS_STAGING_CODE_ASTRO=<code> npx playwright test test/e2e/cuj.spec.ts --project=chromium`
   (`npx playwright install chromium webkit` first if needed; rerun with a
   fresh code for `--project=webkit`).
2. Create the dedicated load-test crew first (`POST /api/admin/crew` with
   `{"id": "stg-load-1", "name": "Load", "role": "astronaut", "provenance": "synthetic"}`),
   then the staging load test of 1,260 rows (both `--name value` and
   `--name=value` forms work):
   `python ml/column_map.py ml/data/astronaut_health_SYNTHETIC.csv ml/maps/synthetic.yaml /tmp/mapped.csv && tsx tools/load-import.ts --base https://starplus-backend-staging.shareflow.workers.dev --code <code> --crew stg-load-1 --csv /tmp/mapped.csv --metric heart_rate`
   (reruns are duplicates by design).
3. Optional staging cleanup (needs explicit author OK first — NOT done):
   `DELETE FROM measurements WHERE crew_id = 'stg-astro-2'` on staging only,
   to remove the 720 mixed-provenance rows from the earlier gate run.
4. Explanations: `MODEL_API_KEY=<key> npx tsx tools/pregenerate.ts`, review
   each entry with `npx tsx tools/review.ts list` / `approve`, which ships
   `core/content/explain-cache.json` with `reviewed` items only.
5. Then: merge both repos, deploy staging then production, smoke-test both
   (the Phase 3 gate also ends the minimum version with a production deploy).

## 1i. Explanation review fixes (review-2026-11-08-explanations: T1–T3)

- `core/content/explain-cache.json` committed exactly as generated
  (27 reviewed, 6 rejected); shipped to the app via `sync-core.sh`.
- T1: `getExplanation(entryId, level)` (`frontend/src/lib/kb.ts`)
  recomputes the `sha256(id + "\n" + text.join("\n"))` +
  `:standard+simple:<model>:prompts-v1` key and returns text only when
  `status === "reviewed"`. "Explain more simply" shows the reviewed simple
  text with the AI label; anything else shows the source text labelled
  "From the cited source" with no AI label. Unit tests: reviewed entry
  returns AI text, rejected entry and edited source fall back
  (`frontend/test/explain-cache.test.ts`). Fixed the vitest
  `@starplus/core` alias to exact-match so subpath JSON imports resolve.
- T2: `tools/prompts/explain-entry.md` now requires keeping every qualifier
  word for word (normal/normally, at least, no sooner than, only if, never,
  do not, at once); the "normal"/"fine" ban applies only to describing the
  reader's own results. `core/explain/filters.ts` gained a must-keep check
  (word boundaries, case-insensitive, ordered words with gaps allowed;
  source count or more required) and flags "normal"/"fine" as softening
  only when the source lacks them. Three must-reject eval cases appended
  to `tools/eval/cases.json`. `PROMPT_VERSION` unchanged (recorded in
  `docs/designs/deviations.md`).
- T3: `pregenerate` logs each rejection, skips that entry, writes the
  cache after every entry, and exits non-zero if anything was skipped
  (reviewed entries are still skipped cleanly).
- Counts (no retries, no fixme): unit 80 frontend (incl. 5 explain-cache + 3 waiting-banner) + 88 backend pass;
  filter eval green; typecheck, lint (2 pre-existing warnings), `build:staging` green; offline
  suite 2 passed Chromium, 2 passed WebKit. CUJ suite NOT run locally
  (needs staging codes; the auditor reruns it).

## 1i. Final gate fix (audit-2026-11-08-phase3k: V1 core resync)

- V1: ran `tools/sync-core.sh` so the U2 filter change reached the app;
  `diff -r starplus-backend/core starplus-frontend/core` is empty.
  Committed `core/` in both repos (backend `61d855b`, frontend
  `1eb0eb0`), both as `ariandesu` with no co-author trailer.
- CI green on `phase-3` in both repos:
  backend https://github.com/ariandesu/starplus-backend/actions/runs/42474549289
  frontend https://github.com/ariandesu/starplus-frontend/actions/runs/42474552044
- Also filed the missing `audit-2026-11-08-phase3i.md` alongside phase3k.

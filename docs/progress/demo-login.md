# Demo login — progress (branch `demo-login`, from `main`)

One-tap demo login with a pre-filled 30-day history (request-2026-11-08-demo-login rev 2).

## Backend

- `POST /api/auth/demo` (`src/auth.ts` + route in `src/index.ts`): works only when
  `DEMO_LOGIN = "on"` (set in `wrangler.toml` for production and staging), else 404.
  Signs in as fixed `demo-astronaut` / `demo-surgeon` (provenance `synthetic`,
  created on first use), issues a normal session marked `demo: true`, valid 24 h.
  No access code is created or consumed. Rate-limited like `/api/auth`.
- Migration `0004_demo_login.sql`: `sessions.demo` flag; `requireSession` returns it.
- Data fence for demo sessions: `GET /api/reports`, `GET /api/crew/results`,
  `GET /api/attachments/<id>` and `POST /api/reports/ack` only see rows/objects
  whose submitter or subject crew is synthetic (others get 0 rows or 403).
  Writes are already fenced (batch ties rows to the session crew; synthetic crews
  may only post synthetic/simulated_device). `GET /api/crew/progress` unchanged.
- `POST /api/admin/demo-reset` (`src/demo.ts`, also run by the cron at 00:00 UTC):
  deletes only `demo-*` rows (measurements, results, reports, sessions,
  access codes, crew) plus the fixed demo photo key.
- `tools/seed-demo.ts` (run by the auditor with the admin key): picks one CSV
  person, maps rows onto the last 30 days, computes a result per check-in day
  with core `assess()`, forces watch + critical in the last days, posts 2
  reports (routine + emergency with a generated JPEG photo), and synthesizes
  water, calories, radiation, reaction-time and questionnaire measures.
  `--reset` reuses the reset endpoint. Deterministic client IDs (duplicates on
  re-run); exiting non-zero is not needed — rejected rows are reported.
- Tests: `test/demo.test.ts` (404 when off, 24 h, no codes touched);
  `test/routes/demo-auth.test.ts` (role logins; fence: demo surgeon gets
  0 rows + 403 on a real report/result/photo/ack while a normal surgeon sees
  them; reset keeps real rows and drops demo rows + photo);
  `test/seed-demo.test.ts` (≥1 watch + ≥1 critical, HR/BP baselines exist);
  `GET /api/sync` gained per-table cursors (`since_measurements`,
  `since_results`) after the shared cursor was found to skip rows past 500.

## Frontend

- `/login`: "Trying the demo?" box (Demo astronaut / Demo flight surgeon),
  `?demo=astronaut|surgeon` auto-login links, home "Try the demo" entry.
  Double-submit fixed (in-flight guard, cleared code, "Logged in, opening…").
  After a demo login the crew history is pulled (`pullHistory`, per-table
  cursors, `per_measure_json` parsing) with "Loading demo history…".
- `DemoAccountBanner` in the app shell on every screen during a demo session
  ("Demo account: synthetic data").
- Progress page counts the demo crew's own synthetic data
  (`includeSynthetic`, core-gated to the demo view) and labels it
  "Demo points (synthetic data)".
- Tests: `loginDemo` session flag + `pullHistory` paging in
  `test/session.test.ts`; `includeSynthetic` in core gamification tests;
  `test/e2e/staging-demo.spec.ts` (staging: demo astronaut → banner, charts,
  latest critical result with reason/citation/explain; demo surgeon → photo
  thumbnail loaded; skips cleanly without a demo backend).

## Verification (local backend + seeded data, both browsers)

- Backend 123/123, frontend 209/209; typecheck clean; lint 0 errors;
  citations ok; `core/` identical.
- Local `wrangler dev` (DEMO_LOGIN=on) + `seed-demo` (696 measurements,
  30 results, 2 reports, photo, 0 rejected) + frontend build against it:
  staging-demo e2e 2/2, offline routes 2/2, camera 2/2, bluetooth/voice 3/3,
  import 3/3, surgeon-photos 1/1, emergency-photo 1/1 — Chromium and WebKit.
- CUJ and staging-code suites need staging (auditor reruns after seeding
  staging + production and deploying this branch).

## Notes for the author/auditor

- `.dev.vars` (gitignored, local only) was changed during verification: it now
  holds a test `API_KEY`. Re-enter the real local key before `wrangler dev`.
- Seed staging, then production:
  `npx tsx tools/seed-demo.ts --base <worker-url> --admin-key <key> [--person SYN-A001] [--reset]`.

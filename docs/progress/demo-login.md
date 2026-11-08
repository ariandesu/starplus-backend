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
- `POST /api/admin/demo-reset` calls `resetAndSeedDemo` (also run by the cron
  at 00:00 UTC): deletes only demo measurements, results, reports and the
  photo, keeps crew rows and sessions, then re-inserts the 30-day history,
  results, 2 reports and photo, all dated relative to today.
- Seeding lives in the Worker (`src/demo-seed.ts`, pure, unit-tested):
  one CSV person's rows from embedded `core/content/demo-seed.json` are
  interpolated across 30 days, steadied with documented fixed values, scored
  per day with core `assess()` (day-relative), with forced events: a mild
  watch on day 12, one critical systolic day 27, a mild recovery watch on
  day 28 and on the latest day.
- `tools/seed-demo.ts` is a thin wrapper that calls the endpoint; the admin
  key comes from `STARPLUS_ADMIN_KEY` only.
- Tests: `test/demo.test.ts` (404 when off, 24 h, no codes touched);
  `test/routes/demo-auth.test.ts` (role logins; fence: demo surgeon gets
  0 rows + 403 on a real report/result/photo/ack while a normal surgeon sees
  them; reset keeps sessions and crew, reseeds 30 days, spares real rows);
  `test/seed-demo.test.ts` pins the mix (≥70% nominal, ≥2 spread watch days,
  exactly 1 critical in the last 3 days, latest day watch, HR/BP baselines
  exist);
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

## DD1–DD4 fixes (audit-2026-11-08-demo-login, do not merge)

- DD1: seeding moved into the Worker. `core/content/demo-seed.json` embeds
  the chosen person's 7 CSV rows plus the generated photo; `src/demo-seed.ts`
  builds the 30-day history (interpolated days, documented steady values, a
  mild watch day 12, one critical systolic day 27, a mild recovery watch day
  28 and a mild watch on the latest day) with per-day `assess()`.
  `resetAndSeedDemo` (cron at 00:00 UTC + `POST /api/admin/demo-reset`)
  deletes only demo measurements, results, reports and the photo, keeps crew
  rows and sessions, then re-inserts history dated relative to today.
  `tools/seed-demo.ts` is a thin wrapper that calls the endpoint.
- DD2: the seeded mix is pinned by test: ≥70% nominal, ≥2 spread watch days
  (12 and 28/29), exactly 1 critical in the last 3 days (day 27), latest day
  watch, HR/BP baselines present.
- DD3: the admin key comes from `STARPLUS_ADMIN_KEY` only; `--admin-key`
  (and the other flags) are gone. Docs updated.
- DD4: removed the unused imports; CI links below.

## Verification (local backend + seeded data, both browsers)

- Backend 123/123, frontend 209/209; typecheck clean; lint 0 errors;
  citations ok; `core/` identical.
- Local `wrangler dev` (DEMO_LOGIN=on) + `POST /api/admin/demo-reset`
  (726 measurements, 30 results, 2 reports, photo, 0 rejected) + frontend
  build against it:
  staging-demo e2e 2/2, offline routes 2/2, camera 2/2, bluetooth/voice 3/3,
  import 3/3, surgeon-photos 1/1, emergency-photo 1/1 — Chromium and WebKit.
- CUJ and staging-code suites need staging (auditor reruns after deploying
  this branch and seeding staging + production).

## Notes for the author/auditor

- `.dev.vars` (gitignored, local only) was changed during verification: it now
  holds a test `API_KEY`. Re-enter the real local key before `wrangler dev`.
- Seed staging, then production:
  `STARPLUS_ADMIN_KEY=<key> npx tsx tools/seed-demo.ts --base https://<worker>`.

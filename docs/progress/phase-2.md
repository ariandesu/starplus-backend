# Phase 2 progress — storage, login, self-check, emergency, content (2026-11-08, MERGED)

Gate: PASS (auditor ran the live gate on staging: 4/4). Backend and frontend
`main` fast-forwarded from `phase-2`. No commit's own ID is recorded inside
itself; final ranges below were filled in afterwards.

## 1. Design items (Phase 2: 40–57)

Done: 40 (33 kb entries + 3-item formulary), 41 (`tools/check-citations.ts`,
`core/test/content.test.ts`, CI step), 42 (`lib/db.ts`), 43 (`lib/session.ts`),
44 (`lib/outbox.ts`), 45 (`lib/api.ts`, old dashboard calls removed after the
home page went), 46 (login/check/result/emergency/reports routes),
47 (emergency-button, measure-form, citation, model-view), 48 (grey
`insufficient` tone on the status card), 49 (self-hosted Satoshi, `AppShell`
with emergency control, setting/phase display and demo banner), 50 (nav for
the new routes), 51 (astronaut home with reminder, overall status and links),
52 (hero/bento/marquee/accordion/role-switcher/skeleton-loader and gsap
deleted), 53 (`public/fonts/satoshi-*.woff2`, Fontshare free licence),
54 (Serwist `sw.ts` + `next build --webpack`, `Cache-Control: no-cache` on
`/sw.js`), 55 (`public/sw-kill.js`), 56 (`app/manifest.ts`),
57 (`test/db.test.ts`, `test/outbox.test.ts`, `test/session.test.ts`).

Audit fixes on top: C1 in-flight CPR/unresponsive/fainting/anaphylaxis
variants (verified Rehnberg 2014 + Hinkelbein 2020 citations), C2
generated-dose line removed + dose-pattern test, C3 structured citations
with verified URLs, S1 shared-device login, S2 per-device PIN salt, W1
branch-aware core check. Both deviations approved and recorded.

## 2. Commits

Backend and frontend `phase-2` merged to `main` (fast-forward). Author
`ariandesu <mahirfaisalarian@gmail.com>`, no co-author lines.

## 3. Gate commands and results

- Backend: `npm test` — 13 files, 79 tests pass. Typecheck (both configs)
  clean. `npm run lint` clean. `npx tsx tools/check-citations.ts` ok.
  Coverage ≥85% lines on `core/`.
- Frontend: typecheck clean, `npm run lint` clean, 52 tests pass,
  `npm run build` succeeds (Act-as-1 static routes incl.
  `/login`, `/check`, `/result`, `/emergency`, `/reports`, manifest).
- Playwright: `test/e2e/cuj1-offline.spec.ts` green on Chromium (network
  off, emergency flow queued); live `test/e2e/gate-live.spec.ts` written,
  skips without staging codes.
- Live gate on staging (auditor ran it with the codes): 4/4 pass —
  astronaut login with `shared: true` gives about a 24-hour session; a
  batch is accepted and syncs back; an emergency report is delivered; the
  flight surgeon logs in and sees it. Single-use codes were consumed; one
  unused code remains each for `stg-astro-1`, `stg-astro-2`, `stg-fmo-1`.

## 4. Migrations

None in Phase 2. Old tables untouched.

## 5. Deviations

None in Phase 2 beyond the two approved in `docs/designs/deviations.md`.

## 6. Known issues / follow-ups (Phase 3)

- G1: `gate-live.spec.ts` posts to the API; the Playwright CUJ suite must
  drive the real screens against staging.
- G2: batch ingest does not yet reject provenance mismatches.
- G3: confirm the in-flight CPR screen keeps rate and depth.
- Next.js notes a stray `package-lock.json` in the author's home directory
  (harmless; author may delete it).

## 7. Deploys

- Staging worker from `main`, version recorded in the follow-up commit;
  `/api/health` ok with `d1: "ok"`, environment `staging`.
- Production worker from `main`; `/api/health` ok; old routes unchanged;
  new routes answer 401 without a session.
- Frontend `main` auto-built by Vercel; home page 200.

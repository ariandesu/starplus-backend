# Audit: Phase 2 close-out and Phase 3 G-items (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `e75394c`, frontend `phase-3` `f6d9ddd`
**Verdict:** Phase 2 is **closed** (merged, deployed, live). Phase 3 G2 and G3 are
**accepted**. **G1 fails** when actually run, because of a CORS setup gap (H1). Fix it and
rerun before merging `phase-3`.

## Phase 2 close-out — verified

*   Both `main` branches carry Phase 2 (backend `df36d79`, frontend `aba9132`); CI green; no
    AI lines in commits.
*   Production and staging `/api/health`: `ok`, `d1: "ok"`.
*   Vercel deployment for frontend `main` succeeded. The live `/emergency` page returns 200
    and shows the "Someone else, not responding" flow.

## Phase 3 G-items

| Item | Result |
|---|---|
| G2 provenance mismatch | Accepted. Batch rejects `provenance_mismatch` (synthetic crew: `synthetic`/`simulated_device`; real crew: `real`/`simulated_device`); route test added. `/api/auth` now also returns `provenance` (additive; record it in the deviation log as an API contract addition) |
| G3 in-flight CPR targets | Accepted with a wording fix: the variant says "about 5 cm deep", while the Earth steps (and the AHA source) say 5 to 6 cm. Use "5 to 6 cm" in both |
| G1 staging screen suite | **Fails** (H1). The suite itself is well built: real screens, offline navigation through the service worker, a run ID per run, skips cleanly without codes |
| Auditor's run | Backend 80 tests, typecheck and lint clean. Frontend 52 tests, typecheck and lint clean, build against staging succeeds |

### H1 — High — The browser suite cannot log in: staging CORS rejects `localhost`

*   **Evidence:** the auditor ran
    `cuj-staging.spec.ts` with a real staging code. The login screen showed "That code did
    not work". A preflight from `Origin: http://localhost:3100` to staging `/api/auth` returns
    204 **without** `Access-Control-Allow-Origin`, so the browser never sends the login. The
    code was not consumed.
*   The API-level gate passed earlier only because Playwright's request client ignores CORS.
    Nothing has yet tested the real app talking to a real server.
*   **Fix:** a staging-only extra origin. Add `EXTRA_ALLOWED_ORIGINS = "http://localhost:3100"`
    under `[env.staging.vars]` and have `allowedOrigin()` accept origins listed there. Do
    **not** set it for production. Add tests: staging config allows localhost; with the var
    unset (production), localhost gets no allow header. Deploy staging, then tell the auditor
    to rerun. One unused `stg-astro-1` code remains for the rerun.

## Scope note

Phase 3 proper (items 58–68: settings and comms link, history charts, surgeon view, demo
mode, explanation templates and review, the full Playwright CUJ suite, load test) has not
started; only the G-items were done, as instructed. Phase 3 is due by 2026-11-11.

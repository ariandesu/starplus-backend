# Audit: demo login, DD-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `demo-login` `d78e880`, frontend `demo-login` `49a831f`
**Verdict:** **DD1–DD4 are fixed, and the demo is good.** One event-day problem remains: at a
venue where many people share one IP address, the one-tap link silently fails after about
10 logins a minute (EE1). It's a small fix. After it, the demo is ready for production.

## Verified (staging `0f416324`, auditor's run)

| Item | Evidence |
|---|---|
| **DD1, reset and seed inside the Worker** | `STARPLUS_ADMIN_KEY=… seed-demo.ts --base <staging>` (key from env, nothing printed) ran **twice**, identical both times: removed 785 measurements, 30 results, 2 reports, 1 photo; re-seeded 785 measurements, 30 results, 2 reports. Fits the Worker's CPU limit on a real request. |
| Sessions survive a reset | A demo session opened **before** the reset → `GET /api/sync` 200 **after** it |
| Real data untouched | The real-provenance fence crew member `stg-real-fence` and its report are still present after both resets |
| **DD2, status mix** | 23 nominal; 3 insufficient (days 1–3, before any baseline: correct and realistic); watch on 22 Oct, 7 Nov, 8 Nov; **critical on 6 Nov**; **latest = watch**. The home page opens on "Overall: watch". |
| DD3 | `--admin-key` removed; key only from `STARPLUS_ADMIN_KEY`; no key in the output |
| DD4 | Lint clean; **CI success** on `d78e880` and `49a831f` |
| Fence, rerun | Demo surgeon: 63 reports, all from synthetic crew (`demo-astronaut`, `stg-astro-1`); the real report is **not** visible |
| Judge's walk (fresh build) | `/login?demo=astronaut` → logged in and history loaded in **2.2 s**, "Overall: watch". `/login?demo=surgeon` → `/surgeon` lists the demo reports with **5 thumbnails** loaded. |
| Regression | Chromium: CUJ 3/3, sync, demo 2/2, real photo flow. WebKit: CUJ 3/3, sync, real photo flow; demo 4/4 on rerun (see EE1). Battery 24/24. |

## Findings

### EE1 — High (event day) — The one-tap demo is rate-limited per IP address, and fails silently

*   20 back-to-back auto-logins on WebKit: **4 misses**, every one `POST /api/auth/demo` →
    **429**. The page stays on `/login` showing **no message**. The earlier WebKit e2e
    failure was the same 429.
*   `/api/auth/demo` uses the auth limiter, 10 per minute **per IP**. That limit exists to
    stop access-code guessing; the demo endpoint holds no secret.
*   At the hackathon, judges and teams share the venue's public IP, so after about 10 demo
    logins a minute every other judge's link does nothing.
*   **Fix:**
    1.  **Backend:** give `/api/auth/demo` its own limiter binding, for example **120 per
        minute per IP**. Keep `/api/auth` at 10/min.
    2.  **Frontend:**
        *   on a 429 from the demo button or `?demo=` link, show "Lots of people are trying
            the demo right now. Retrying in a few seconds…";
        *   retry automatically after `Retry-After` (or 5 s), up to 3 times;
        *   then show a "Try again" button;
        *   **never fail silently.** Show any other demo-login failure as a message too.
    3.  **Re-use a live demo session:** if this device already has a valid demo session for
        that role, `?demo=` opens it with no new request.
    4.  **Tests:**
        *   a route test: 30 demo logins from one IP within a minute all succeed;
        *   an e2e with the demo call stubbed to return 429 once, then 200: the
            "Retrying…" message shows, then the user lands on home;
        *   a stubbed permanent 429: the error and the Try again button are visible.

### Info

*   **Disclosure:** `docs/disclosure.md` says demo crews are synthetic. Add one sentence:
    the demo astronaut's history is generated from one synthetic person's rows, with steady
    typical values for volatile measures and three scripted events (two watch, one
    critical), so the demo shows each status.
*   **Staging admin key rotation** (from the previous audit) still awaits the author's OK.
*   **Production deploy plan:**
    1.  back up production;
    2.  apply migration **0004** to staging (done), then production;
    3.  deploy the Worker with `DEMO_LOGIN=on`;
    4.  run `seed-demo.ts` (reset and seed) against production with the production admin
        key from the environment;
    5.  Vercel builds `main`;
    6.  smoke-test both one-tap links on the live site, the fence with a check that no
        real crew exist (there are none), and the cron path (unit-tested; it runs at
        00:00 UTC).

## Next

1.  **Builder:**
    *   fix EE1, and add the disclosure sentence, on `demo-login`;
    *   run all tests and every e2e suite on both browsers;
    *   paste the CI links; commit as ariandesu with accurate titles; push; do not merge;
        stop.
2.  **Auditor:** rerun the 20-login burst (expect 20/20) and the judge's walk.
3.  **Author:** go-ahead for the production deploy, and OK (or not) for the staging key
    rotation.

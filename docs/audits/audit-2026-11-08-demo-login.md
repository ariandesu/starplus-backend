# Audit: demo login (2026-11-08)

**Auditor:** Claude · **Branches:** backend `demo-login` `a9ba86e`, frontend `demo-login` `878a182`
**Verdict:** **The demo experience works, and the data fence holds.** Two problems would hurt
the judging:
*   the **daily reset wipes the demo history and never re-seeds it** (DD1): the demo is
    empty from 00:00 UTC, 06:00 in Dhaka;
*   the seeded astronaut is **abnormal every single day** (DD2).

**Backend CI is red** (lint). Fix DD1–DD4, then deploy.

## Verified (staging, auditor's run)

| Item | Evidence |
|---|---|
| Staging deploy | Migration `0004_demo_login.sql` applied to staging; Worker `600dfe0b` with `DEMO_LOGIN=on`. Production untouched (`/api/auth/demo` → 404 there). |
| Seed | `seed-demo.ts` on staging: 696 measurements, **726 accepted, 0 rejected**, 2 reports, 1 photo. |
| **Data fence** | A **real** crew member (`stg-real-fence`, provenance real) sent a report with a photo:<ul><li>**demo surgeon:** does not see the report (61 rows, 0 real); results for the real crew member `[]`; real photo **403**; ack on the real report **403**;</li><li>**normal surgeon:** sees the report; the photo loads;</li><li>the demo surgeon sees the demo astronaut's 30 results and the demo photo (200).</li></ul> |
| Demo login | `astronaut` 200, `flight_medical_officer` 200 (`demo: true`, 24 h), other roles 400. |
| **Judge's view** (fresh staging build) | `/login?demo=astronaut` → logged in **and history loaded in 2.5 s**. The home page shows the overall status. History shows 57 chart lines with baseline bands. Progress shows "Demo points (synthetic data)": 4/4, a 30-day streak, patches. The body map shows readings for each system. |
| e2e | `staging-demo.spec.ts` **2/2 on Chromium and WebKit** (ran, not skipped) |
| Regression (the sync cursor change touches all crew) | CUJ 3/3, offline-sync and offline-form on **both browsers** (real logins); battery 24/24 |
| Checks | Backend 123/123; frontend 209/209 ×2; typecheck clean; citations ok; `core/` identical |

## Findings

### DD1 — High — The daily reset deletes the demo and nothing re-seeds it

*   The cron at 00:00 UTC calls `resetDemoData`. That deletes the demo crew members'
    measurements, results, reports, photo, **sessions and crew rows**. Seeding exists only
    as a Node tool (`tools/seed-demo.ts`).
*   From the first midnight onward, judges get **empty** demo accounts, and anyone in the
    middle of the demo is logged out. Judging is 2026-11-14/15.
*   **Fix:**
    *   move the seed logic into code the Worker can run:
        *   **embed the chosen person's rows** (one person, about 7 rows, a few KB of
            JSON) in `core/content/demo-seed.json`;
        *   generate the 30-day history and the `assess()` results inside the Worker;
    *   `resetAndSeedDemo(env)`:
        *   deletes only the demo crew members' measurements, results, reports and photo;
        *   **keeps the crew rows and sessions**;
        *   re-inserts the history, dated relative to "today";
    *   the cron and `POST /api/admin/demo-reset` both call it;
    *   `tools/seed-demo.ts` becomes a thin wrapper that calls the endpoint;
    *   tests:
        *   after a reset, the demo astronaut has 30 days of history;
        *   an existing demo session still works;
        *   a real crew member's rows are untouched.

### DD2 — Medium — The demo astronaut is abnormal every day

*   All 30 seeded results are watch (27) or critical (3); no day is normal. The cause:
    person `SYN-A001` sleeps 6.25 h a night, under the 7 h limit, so every day is
    "watch". A judge sees a crew member in permanent trouble. It looks broken, not
    realistic.
*   **Fix:**
    *   choose a person, or adjust the seed with a fixed seed, so that **at least 70% of
        days are nominal**;
    *   at least 2 watch days spread out;
    *   **1 critical day within the last 3 days** (keeps the escalation story);
    *   the most recent day is **watch**, so the home page opens on a clear but not
        alarming state; the critical day is one tap back in history;
    *   add a unit test that pins these counts.

### DD3 — Medium — The admin key is passed as a command-line argument and was printed

*   `seed-demo.ts --admin-key=<key>`: npm echoes the full command line ("npm notice run
    'tsx' … --admin-key=…"). The **staging admin key was printed** in the auditor's
    session. It went to a local terminal only, but this is how keys leak into CI logs and
    shell history.
*   **Fix:**
    *   read the key from `STARPLUS_ADMIN_KEY` (env var) only, and remove `--admin-key`;
    *   update the docs;
    *   **author:** approve rotating the staging admin key (the auditor can do it: new
        secret on the staging Worker, and `.secrets/starplus-staging-api-key` updated).

### DD4 — Low — Backend CI is red (lint)

*   `src/demo.ts:1` has an unused import `Env`; `test/demo.test.ts:1` has an unused `vi`.
    The report said lint was clean; GitHub Actions on `a9ba86e` = **failure**.
*   **Fix:** remove both, and paste the green CI run link in the report.

### Info

*   **Legacy routes:** `GET /api/astronauts`, `/api/vitals` and `/api/watch-signals` are
    public with no login. That predates this project (the original dashboard) and they
    only serve the old tables. Consider retiring them after the event.
*   **Local key file:** `.dev.vars` (local, gitignored) now holds a test key from the
    builder's run. The author must restore the real local key before `wrangler dev`.
*   **Staging fence-test crew:** staging now holds a **real-provenance** fence-test crew
    member, `stg-real-fence`, with one report and photo, used for the fence test. Keep it
    for future fence checks; it is labelled.
*   **Production deploy:** this is the **first new migration since Phase 3** (0004). Back
    up, apply to staging, then production, then deploy. Then seed production with the
    Worker reset (after DD1).

## Next

1.  **Builder:**
    *   fix DD1–DD4 on `demo-login`;
    *   run all unit tests, lint, typecheck, `build:staging`, and every e2e suite on both
        browsers;
    *   paste the CI links; report with accurate commit titles; commit as ariandesu; push;
        do not merge; stop.
2.  **Auditor:** reset and seed staging through the endpoint, check the status mix and that
    sessions survive a reset, rerun the fence and the judge's walk.
3.  **Author:** approve the staging key rotation (DD3). After that, go-ahead for the
    production deploy.

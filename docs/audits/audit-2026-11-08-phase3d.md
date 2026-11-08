# Audit: Phase 3 gate, second rerun (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `8300f07`, frontend `phase-3` `c7fef2f`
**Staging Worker:** redeployed from `8300f07` by the auditor (version `25b12818`); the previous
staging build did not have L2.
**Verdict:** **L1 and L2 are fixed. The gate passes in real use.** The offline test file
itself is red on WebKit and hides an intermittent Chromium miss behind retries. Fix M1–M3
(test-only, small), then continue to explanations and merge.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| **L1, real flow** | CUJ suite against staging with real logins: **Chromium 3/3 pass, WebKit 3/3 pass**. That includes the case that failed before: in-app navigation to `/result?crew=…&result=…`, then an offline reload. Both codes show `used_at` in staging D1, so the logins were real. |
| L1, never-visited query URLs | WebKit: 36 of 36 offline navigations to fresh `?crew=` URLs loaded. Chromium: see M2. |
| **L2, route test** | `rejects a duplicate client_id owned by another crew member` passes. |
| **L2, live on staging** | A reading posted as `stg-astro-2` with a `client_id` owned by `stg-load-1` returned `rejected: client_id_conflict`. `stg-astro-2` still has 0 rows. |
| **Load test** | 1,260 rows into `stg-load-1`: **1,260 accepted, 0 duplicates, 0 rejected, 3 s**. The new crew-scoped IDs did not collide with the 540 old rows. `stg-load-1` now holds 1,800 rows. |
| Checks | Backend 88 tests pass, typecheck and lint clean. Frontend 53 tests pass, typecheck clean, lint 0 errors (2 warnings). The staging build succeeds. |

## Findings

### M1 — Medium — `offline-routes.spec.ts` always fails on WebKit

*   `waitForPrecachedResult` asserts `context().serviceWorkers().length > 0`. Playwright only
    reports service workers on Chromium, so on WebKit this is always 0 and both tests fail
    (2 of 2 runs).
*   With that one line removed, WebKit passes both tests (2 of 2 runs). The app is fine; the
    test is wrong.
*   **Fix:** drop the assertion. `navigator.serviceWorker.controller !== null` already proves
    the worker is in control on every browser. If you keep a Chromium check, guard it with
    `browserName === "chromium"`.

### M2 — Medium — Retries hide an intermittent Chromium offline-navigation miss

*   The spec retries each offline `goto` up to 3 times. With retries set to 1, Chromium
    failed **3 of 3 runs**, once per run, each time on a different route (`/result?…`,
    `/surgeon`, `/check`).
*   The auditor's 36-navigation probe in Chromium had **24 misses in one run**. The pattern:
    after one navigation, the next ~15 s of `page.goto` calls returned with no error but the
    URL did not change. Then it recovered. The same sequence with event logging ran
    **0 of 11 misses** in another run. WebKit had **0 of 36**.
*   It did not show up in the user flow (the CUJ suite passed on both browsers), and the main
    thread was responsive throughout. It may be Playwright's offline emulation interacting
    with the Chromium service worker, not the app. That is not proven.
*   **Fix (time-box: 1 hour):**
    *   Remove the retry loop. A retry is not allowed to make an offline test pass.
    *   Reproduce the miss, and record for each one: `framenavigated` events, the service
        worker's state (`navigator.serviceWorker.controller`, and whether the worker
        restarted), and whether the `fetch` listener ran (temporary `console.log` in `sw.ts`;
        remove it afterwards).
    *   If the cause is the app (for example, a navigation the listener did not answer), fix
        it.
    *   If it is the test harness, write down the evidence in the progress report. Replace the
        retry with `await page.waitForURL(target, { timeout: 5_000 })` after each `goto`, so a
        dropped navigation fails loudly. Mark that one test `test.fixme` on Chromium with a
        link to the evidence. Do not let it pass by retrying.

### M3 — Low — The second offline test does not test what its name says

*   "offline reload after in-app navigation to a result URL" navigates to `/check`, not to
    `/result`. The CUJ suite covers the real `/result` case, so nothing is untested. But the
    name is misleading.
*   **Fix:** rename it to "…to the self-check page", or make it reach `/result?crew=…` through
    the app. Either is fine.

### M4 — Info — Notes on the new service worker

*   All navigations are now served cache-first from the precache, including when online.
    That is right for this static build, and `skipWaiting` + `clientsClaim` bring each deploy
    in on the next load. Smoke-test that during the production deploy: deploy, reload twice,
    and check that the new build's text shows.
*   `defaultCache` runtime caching was removed. Offline pages, icons and fonts worked in the
    CUJ runs, so nothing visible is lost.
*   The explicit `ServiceWorkerRegister` is fine. Registering twice does no harm.

### M5 — Info — Staging state after this run

*   Staging Worker = `phase-3` `8300f07`.
*   `stg-load-1`: 1,800 synthetic rows (540 from the old tool plus 1,260 from this run).
    That's expected for the load crew; leave it.
*   `stg-astro-2`: 0 rows. The auditor used 3 synthetic codes for the live L2 probe (2 were
    spent on the auditor's own malformed requests). Sessions on device `audit-l2` stay until
    they expire.
*   The author's two codes (`stg-astro-1`, `stg-fmo-1`) are **unused** and still valid.
    The auditor issued and spent separate codes for this run.

## Next

1.  **Builder:** fix M1–M3 on `phase-3` (test file and progress report only, unless M2 finds
    an app cause). Run `offline-routes.spec.ts` on **both** projects three times without
    retries and report the counts. Then stop.
2.  **Explanations:** K2 is fixed, so `pregenerate` can run. That needs the Meta key: the
    author runs it, or tells the auditor to. The auditor then reviews every generated
    explanation against its source entry before merge.
3.  **Merge and deploy:** merge `phase-3` in both repos, deploy the backend (staging, then
    production) and the frontend, then smoke-test production with one real crew code. That
    ends the minimum version. Then Phase 4.

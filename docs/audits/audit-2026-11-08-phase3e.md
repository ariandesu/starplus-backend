# Audit: Phase 3 gate, M-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `b9a2a0b`, frontend `phase-3` `902d55a`
**Verdict:** **M1–M3 are done as instructed. The builder's M2 evidence points to a real user
bug, not only a test problem: N1.** Fix N1 and N2, then the Chromium offline test runs
with no skip. Do not merge yet.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| M1 | `serviceWorkers()` assertion removed. WebKit passes both offline tests. |
| M2 | Retry loop removed; `waitForURL` after each `goto`. Chromium loop test is `fixme` with an evidence link. |
| M3 | Test renamed. |
| Offline suite, 3 runs | Each run: 3 passed, 1 skipped (the Chromium `fixme`). Matches the builder's counts. |
| Builder's M2 cause | Confirmed. The built bundle contains `window.addEventListener("online", () => location.reload())`, injected by `@serwist/next` because `reloadOnOnline` defaults to `true`. |

## Findings

### N1 — High — Coming back online reloads the page and wipes a half-done self-check

*   **Test (auditor, staging, real login):** on `/check`, pick blood pressure, go offline,
    type 146 / 92, go back online. **The page reloaded (2 navigations).** The form came back
    on its default (heart rate) and the typed values were gone.
*   This hits the main use case. On the station, the link drops and returns all the time.
    An astronaut who measures during a loss of signal loses the entry when the signal
    returns, and the app gives no warning.
*   It is also the cause of M2. With `reloadOnOnline: false` (the auditor's temporary local
    build, since reverted), the Chromium offline suite passed **5 of 5 runs with no retry
    and no skip**. With the default it failed **3 of 3**.
*   **Fix:**
    *   Set `reloadOnOnline: false` in `withSerwistInit` in `next.config.ts`.
    *   Remove the `test.fixme` on Chromium. Remove the M2 note's "harness" conclusion from
        the progress report, and record the real cause (N1).
    *   Add an e2e test: log in, open `/check`, go offline, type a value, go online, and
        assert the page did not reload and the typed value is still there.
    *   Check that nothing relied on the reload: the outbox must still send queued reports
        after reconnecting. The CUJ test "offline-queued emergency report delivered after
        reconnect" covers that, so run it.

### N2 — Medium — A network failure at login says "That code did not work"

*   `src/app/login/page.tsx` catches every error and shows "That code did not work. Check it
    and try again."
*   The auditor got that message with a valid, unused staging code. The `.next` build on
    disk (rebuilt during the M-fix runs) pointed at the production API, and production's
    CORS blocked `localhost:3100`. The request never reached a server, and the code stayed
    unused. The author hit the same message earlier with valid codes.
*   For a crew member, the same thing happens with no connection: they are told the code is
    wrong. They may then ask for a new one, or type it again until they give up.
*   **Fix:**
    *   In `login()` (`src/lib/session.ts`), tell the cases apart: no response (network,
        CORS, offline) → "Can't reach the server. Check the connection and try again. Your
        code has not been used."; 401 → "That code did not work…"; 429 → "Too many tries.
        Wait a minute."; anything else → "Something went wrong. Try again."
    *   Add unit tests for the four cases.
    *   Show the API host in small text on `/settings` (for example "Server:
        starplus-backend-staging…"), so anyone can see which backend a build talks to.
    *   Add `"build:staging"` to `package.json` with the staging `NEXT_PUBLIC_API_BASE`.
        Use it in every staging gate command in the docs.

### N3 — Info

*   **Staging codes:** the author's two codes (`stg-astro-1`, `stg-fmo-1`) are still unused.
    The auditor used one more `stg-astro-1` code for the N1 test.
*   **`.next` on disk:** rebuilt by the auditor from the committed config against staging,
    so a local `npm run start` on port 3100 now talks to staging.

## Next

1.  **Builder:** fix N1 and N2 on `phase-3`. Then run:
    *   the offline suite three times on both browsers, with no retries and no `fixme`;
    *   the unit tests, typecheck, lint, and a staging build.

    Report the counts, commit, push, do not merge, stop.
2.  **Auditor:** rerun the CUJ suite on both browsers with fresh codes, plus the N1 test.
3.  Then explanations (`pregenerate` with the Meta key and the auditor's review), merge, and
    deploy, as in `audit-2026-11-08-phase3d.md`.

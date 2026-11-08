# Audit: Phase 3 gate, N-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `2ae3ea0`, frontend `phase-3` `69cf0ab`
**Verdict:** **N1 and N2 are fixed, and every gate test passes on both browsers with no
retries and no skips.** One design gap stays open, found from the builder's own note: the
outbox only sends when the user taps "Send now" (P1). Fix P1, then merge.

## Verified

| Item | Evidence (auditor's run, staging build via `npm run build:staging`) |
|---|---|
| N1 | `reloadOnOnline: false`; the reload listener is gone from the built bundle. New `offline-form.spec.ts`: **Chromium pass, WebKit pass** (real staging logins). |
| N2 | `login()` separates no-response, 401, 429 and other errors; 4 unit tests. `/settings` shows the server host. `build:staging` script added. |
| CUJ suite | **Chromium 3/3, WebKit 3/3** with fresh codes; all 4 audit codes show `used_at` in staging D1. |
| Offline suite | **3 runs × both browsers: 4 passed each run, 0 skipped**, no retries. The Chromium flake is gone. |
| Checks | Backend 88 tests, frontend 55 tests, typecheck clean, lint 0 errors (2 warnings), staging build points at staging. |

## Findings

### P1 — High — Nothing syncs on its own; only "Send now" sends

*   `flush()` has exactly one caller: the "Send now" button on `/reports`
    (`src/app/reports/page.tsx:60`). No code sends on app start, after login, when the
    connection returns, after a reading or report is queued, or when the backoff timer
    runs out.
*   The design says:
    *   the outbox "retries with backoff";
    *   readings sync "whenever a link exists";
    *   an emergency report made without a login "is sent under the next login made on that
        tablet".

    None of these happen unless someone opens Reports and taps the button. In practice the
    flight surgeon view stays empty for an astronaut who never does that.
*   This is not a regression: the removed reload never called `flush()` either. The
    builder's note "Outbox flush is button-driven" brought it to light.
*   **Fix:** a small `useOutboxSync` hook (or component), mounted once in the app shell,
    that calls `flush()`:
    *   when the app opens and a session exists;
    *   right after a successful login (this is what sends the waiting emergency report);
    *   on the `online` event;
    *   after `enqueue…` of a reading, result or report;
    *   on a timer at `outbox_next_retry_at` while items wait, using the backoff already in
        `outbox.ts` (5 s base, doubling, 10 min cap, ±20% jitter).

    Guard it with a single in-flight lock so two triggers never send at once, and do not
    send in demo mode (keep the K5 behaviour). Keep "Send now" as a manual push.
*   **Tests:**
    *   unit tests for each trigger and for the lock, with fake timers;
    *   an e2e test (env-gated like the others): log in, go offline, record a reading, go
        online, and without touching Reports, wait for the outbox count to reach 0;
    *   change the CUJ reconnect step so it no longer taps "Send now".

### P2 — Low — Errors after a successful login show raw text

*   In `login()`, anything that throws after the response is read (`res.json()`, IndexedDB
    writes) reaches the screen as its raw message, for example a `QuotaExceededError`.
*   By then the code has been used up, so the user should hear that.
*   **Fix:** wrap the steps after `res.ok` and show "Logged in, but this device could not
    save the session. Ask for a new code if it keeps happening." Add a unit test.

### P3 — Info

*   Staging codes: the author's two codes (`stg-astro-1`, `stg-fmo-1`) are still unused.
    The auditor used 4 more synthetic `stg-astro-1` codes for this run.
*   The `.next` folder on disk is the staging build.

## Next

1.  **Builder:**
    *   fix P1 and P2 on `phase-3`;
    *   run the unit tests, typecheck, lint, `build:staging`, and the offline suite once on
        both browsers;
    *   report, commit, push, do not merge, stop.
2.  **Auditor:** rerun CUJ, offline-form and the new sync test on both browsers with fresh
    codes.
3.  **Explanations:** run `pregenerate` with the Meta key (the author runs it, or tells the
    auditor to), then the auditor reviews each one.
4.  **Merge and deploy:** merge `phase-3`, deploy staging then production, smoke-test.

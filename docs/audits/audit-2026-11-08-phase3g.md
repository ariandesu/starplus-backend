# Audit: Phase 3 gate, P-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `9718cc8`, frontend `phase-3` `df6ce14`
**Verdict:** **Not passing.** P2 is fixed, and the P1 hook is wired correctly. But the CUJ
suite now **fails on both browsers** at the reconnect step: coming back online does not
send, because the backoff gate blocks it (Q1). The builder changed that CUJ step but could
not run it. Do not merge.

## Verified

| Item | Evidence (auditor's run, `build:staging`) |
|---|---|
| Unit tests | Frontend 65/65 on three consecutive runs (no flakiness from fake timers or IDB). Backend 88/88. |
| Typecheck, lint, build | Clean; lint 0 errors (4 warnings, up from 2). Staging build points at staging. |
| P2 | Steps after the response are wrapped; message and unit test present. |
| P1 wiring | `OutboxSync` in the app shell. It sends on open (with a session), on `online`, after each enqueue, after login, and on the retry timer. It has an in-flight lock, and `flush()` keeps the demo-mode guard. |
| `offline-form.spec.ts` | Chromium pass, WebKit pass. |
| `offline-sync.spec.ts` | Chromium pass, WebKit pass. It only passes because one queued reading leads to a short backoff (see Q1). |
| Offline suite | 4/4. |
| **CUJ suite** | **Chromium 2/3, WebKit 2/3.** CUJ 2–5 fails on both. Reproduced on a third Chromium run. |

## Findings

### Q1 — High — Reconnecting does not send; the backoff gate blocks it

*   **CUJ failure:** 30 s after reconnecting, `/reports` still shows 8 items queued with
    "Failed to fetch", plus the emergency report, and "Nothing delivered yet".
*   **Auditor's timing probe (Chromium, staging):**
    1.  Record one reading offline. The automatic send fires at once and fails, which sets
        `outbox_next_retry_at` about 8 s ahead.
    2.  Go online. **No request is made.**
    3.  The batch goes out only when the timer expires.
*   **Cause, in `flush()` (`src/lib/outbox.ts`):**
    *   `if (retryAt !== null && now < retryAt) return outcome;` runs for **every** caller:
        the `online` trigger, the timer, and the **"Send now" button**. So during a backoff,
        "Send now" also does nothing.
    *   Each item queued offline starts an automatic send that is bound to fail, and each
        failure sets a new backoff.
    *   A send aborted by a page navigation ("Failed to fetch") counts as a failure too.
        The CUJ navigates often, so it builds up long waits.
    *   `computeBackoffMs(failures)` uses the number of failed chunks and reports **within
        one send**, not consecutive failed attempts. One send with 3–4 failed items waits
        40–80 s; the design says 5 s base, doubling per attempt.
*   **Fix:**
    1.  Give `flush` an option `{ force?: boolean }`. **"Send now" and the `online` trigger
        pass `force: true`**, which clears the stored backoff and sends at once.
    2.  Automatic triggers (enqueue, app open, timer) do nothing while
        `navigator.onLine === false`. That records no failure and no backoff, and the
        `online` event picks the items up.
    3.  Store a consecutive-failure counter (`outbox_failures` in `settings`). Backoff is
        `computeBackoffMs(outbox_failures)`, with +1 per failed send and a reset to 0 on
        any successful send or a forced send. Use the design's numbers: 5 s base,
        doubling, 10 min cap, ±20% jitter.
    4.  After the in-flight lock is released, if another request came in during the send
        (a "dirty" flag), run one more send. Today, an item queued during a send waits for
        the next trigger. `rescheduleSync` only sets a timer when a retry time is stored, and
        a successful send clears it.
*   **Tests:**
    *   Unit, with fake timers:
        *   forced send ignores and clears the backoff;
        *   automatic triggers skip while offline and record no failure;
        *   consecutive failures double and reset on success;
        *   an enqueue during an in-flight send leads to a second send.
    *   `offline-sync.spec.ts`: after `setOffline(false)`, assert a
        `/api/measurements/batch` request starts **within 3 s** (wait for the request). Do not
        just wait for the outbox to empty.
    *   The CUJ suite as it is now (no "Send now") must pass. It is the test that caught this.

### Q2 — Info

*   Staging codes used in this run: 9 synthetic `stg-astro-1` codes. The author's two codes
    are still unused.
*   The `.next` folder on disk is the staging build of `df6ce14`.

## Next

1.  **Builder:**
    *   fix Q1 (points 1–4) and its tests on `phase-3`;
    *   run the unit tests, typecheck, lint, `build:staging`, and the offline suite on both
        browsers;
    *   report, commit, push, do not merge, stop.

    The builder cannot run the staging-code suites, so say clearly that the CUJ suite was
    not run.
2.  **Auditor:** rerun CUJ, offline-form and offline-sync on both browsers.
3.  Then explanations, merge, and deploy (`audit-2026-11-08-phase3d.md`, Next 2–3).

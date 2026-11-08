# Audit: Phase 3 gate, Q-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `757aac3`, frontend `phase-3` `54c1ef7`
**Verdict:** **Q1 is fixed: data now syncs by itself and promptly after reconnecting.** The
CUJ suite still fails on both browsers (4 of 4 runs), but for a different, smaller reason:
the screens do not update after a background send (R1). Do not merge yet. This should be
the last fix before explanations.

## Verified

| Item | Evidence (auditor's run, `build:staging`) |
|---|---|
| Q1 code | Forced sends for "Send now" and `online`; automatic triggers skip offline; consecutive-failure counter (`outbox_failures`); dirty-flag follow-up. Matches the instructions. |
| Unit tests | Frontend 69/69 on three consecutive runs; backend 88/88. |
| Typecheck, lint, build | Clean; lint 0 errors (2 warnings). Staging build points at staging. |
| `offline-sync.spec.ts` | Chromium pass, WebKit pass. A batch request starts within 3 s of reconnecting. |
| `offline-form.spec.ts` | Chromium pass, WebKit pass. |
| Offline suite | 4/4. |
| CUJ measurements and results | All sent on their own; none left queued at the failure point. |
| **CUJ suite** | **Fails at line 128 on both browsers, 2 runs each**, plus one more Chromium rerun. |

## Findings

### R1 — Medium — Screens do not update after a background send

*   **Auditor's state dump during the CUJ reconnect step (Chromium):**
    *   t+0 s: outbox = 1 emergency report, queued; `outbox_failures=0`, no backoff.
    *   t+10 s: outbox **empty**. The report was sent and stored as delivered.
    *   The Reports screen still showed "report · queued", "1 emergency report waiting —
        log in to send it" and "Nothing delivered yet" until the test timed out.
*   **Cause:** `/reports` re-reads its data only after its own "Send now". The new automatic
    sync delivers in the background and tells no one. The waiting-report banners on the home
    and emergency screens have the same problem.
*   For the crew, this means: "queued, log in to send it" on screen for a report the flight
    surgeon already has. They may send it again, or think the system is broken.
*   **Fix:**
    *   `outbox-sync.ts`: after every send that changed anything (`sent > 0` or
        `failed > 0`, or any item's state or error changed), notify listeners:
        `onSynced(listener)`, the same pattern as `onQueued`. Also notify after
        `enqueue`.
    *   `/reports`, the home banner and the emergency banner subscribe and re-read.
    *   Also re-read on `visibilitychange` to visible (a cheap safety net).
*   **Test:**
    *   The CUJ suite as it is must pass.
    *   Unit test: `onSynced` fires after a send that delivers something, and does not fire
        after a send that did nothing.

### R2 — Low — A forced send that arrives during an automatic send loses its `force`

*   If "Send now" or the `online` event arrives while an automatic send is running, it
    sets `dirty` and returns the running send. The follow-up send runs **without**
    `force`. If the running send failed, it has just set a backoff, and the follow-up is
    blocked by it.
*   It mostly matters when the connection returns mid-send: the reconnect send that Q1 was
    meant to guarantee waits out a backoff instead.
*   **Fix:** keep `dirtyForce = dirtyForce || options.force`, and pass it to the follow-up
    send. Unit test: a forced request during a failing send ends in a forced follow-up that
    sends.

### R3 — Low — "Log in to send it" while logged in

*   The banner text is "1 emergency report waiting — log in to send it" even when a session
    exists and the report is just waiting for the next send.
*   **Fix:** when any session exists, show "1 emergency report waiting — sending when the
    link is up". Keep the current text only when there is no session.

### R4 — Info

*   Staging codes used in this run: 11 synthetic `stg-astro-1` codes. The author's two
    codes are still unused.
*   The `.next` folder on disk is the staging build of `54c1ef7`.

## Next

1.  **Builder:**
    *   fix R1–R3 on `phase-3`;
    *   run the unit tests, typecheck, lint, `build:staging`, and the offline suite on both
        browsers;
    *   report, commit, push, do not merge, stop;
    *   state that the CUJ suite was not run.
2.  **Auditor:** rerun CUJ, offline-form and offline-sync on both browsers.
3.  Then explanations (`pregenerate` + review), merge, and deploy.

# Audit: Phase 3 gate, R-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `1b4afb7`, frontend `phase-3` `16c156c`
**Verdict:** **The Phase 3 test gate passes.** The CUJ suite is green on Chromium and WebKit,
two runs each, with real staging logins. Two small items remain (S1 test race, S2 home
banner). After those, only the explanation review stands between Phase 3 and production.

## Phase 3 gate status

| Gate item (HANDOFF §6) | Status |
|---|---|
| Playwright CUJ suite green on Chromium and WebKit, incl. CUJ 2 under 60 s | **Pass.** Chromium 3/3 ×2, WebKit 3/3 ×2 |
| Filter cases green | **Pass** (K2, audit phase3c) |
| Staging load test of 1,260 rows | **Pass** (audit phase3d: 1,260 accepted, 0 rejected, 3 s; backend code unchanged since, docs only) |
| Every shipped explanation `reviewed` | **Open.** `pregenerate` not run yet |

## Verified this round

| Item | Evidence (auditor's run, `build:staging`) |
|---|---|
| R1 | `onSynced` registry. It fires when the outbox changes (sent/failed counts or an item state/error fingerprint) and after enqueue. `/reports` and the emergency queued screen re-read on it and on `visibilitychange`. The CUJ reconnect step now passes. |
| R2 | `dirtyForce` carries `force` into the follow-up send; unit test present. |
| R3 | Session-aware banner text on `/reports` and the emergency screen; "Report sent" once delivered. |
| Other suites | `offline-form`, `offline-sync`: pass on both browsers. Offline suite 4/4. |
| Checks | Backend 88/88. Typecheck clean, lint 0 errors (3 warnings). Staging build targets only the staging API (the login code moved to a shared chunk; verified). |
| Unit tests | Frontend 72 tests: **3 of 5 full runs green, 2 failed** on one test (S1). |

## Findings

### S1 — Low — Unit test "retries on the backoff timer while items wait" is racy

*   It failed 2 of 5 full-suite runs, and passed 6 of 6 when run on its own. The builder
    called it stable.
*   **Cause:** the test writes `outbox_next_retry_at = now + 50` as soon as the first failed
    call is seen. The first send has not finished yet, so its `finally` (failure counter,
    backoff write, `rescheduleSync`) can run afterwards. That replaces the test's 50 ms with
    a real ~5 s backoff, which is longer than the 2 s wait.
*   **Fix (test only):** wait until the first send is completely done before overriding.
    For example, `await requestOutboxSync()` first, or wait until `outbox_next_retry_at`
    exists and `outbox_failures === "1"`. Then write the 50 ms value and call
    `rescheduleSync()`. Run the full unit suite 10 times and report 10/10.

### S2 — Low — Home screen has no waiting-report banner

*   The design (Outbox section) says: "While such a report waits, the home screen and
    emergency screen show '1 emergency report waiting…'". `src/app/page.tsx` has no banner.
*   **Fix:** add the same session-aware banner to the home screen, subscribed to `onSynced`
    and `visibilitychange`, like `/reports`. Add a unit or e2e check that it appears while a
    report is queued and goes away after delivery.

### S3 — Info

*   Staging codes used in this run: 8 synthetic `stg-astro-1` codes. The author's two codes
    are still unused.
*   The `.next` folder on disk is the staging build of `16c156c`.

## Next

1.  **Builder:**
    *   fix S1 and S2 on `phase-3`;
    *   run the unit suite 10 times, typecheck, lint, `build:staging`, and the offline suite
        on both browsers;
    *   report, commit, push, do not merge, stop.
2.  **Explanations (author's decision):**
    *   Run `pregenerate` with the Meta key (`muse-spark-1.3-contributor`). Only catalog
        and knowledge-base text is sent, with no health values (decision F).
    *   The auditor reviews every generated explanation against its source entry, and marks
        each one `reviewed` or sends it back.
3.  **Merge and deploy:**
    *   merge `phase-3` in both repos;
    *   apply any migration to staging, then production (with a backup);
    *   deploy the Worker; merge the frontend to `main`;
    *   smoke-test production with one real crew code.

    That ends the minimum version.

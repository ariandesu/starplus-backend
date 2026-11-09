# Audit: follow-ups FF1–FF4 (2026-11-09)

**Auditor:** Claude · **Branches:** backend `follow-ups` `430d6b6`, frontend `follow-ups` `d6bfc00`
**Verdict:** **FF1, FF2 and FF3 work. FF4 makes the demo-day problem worse** (GG1): the demo
would be a day behind in Dhaka **all day** instead of 6 hours. The new idle lock can also be
bypassed with `?crew=` (GG2). Do not deploy until GG1 and GG2 are fixed. Both are small.

## Verified (staging `86a6ce48`, fresh staging build, auditor's run)

| Item | Evidence |
|---|---|
| Checks | Backend 127/127; frontend 221/221 ×2; typecheck clean; lint 0 errors; `core/` identical; CI success on both heads; commits by `ariandesu`, no AI lines |
| FF1 logout, idle lock | `active-session.spec.ts` **8/8 on both browsers** (menu and Settings logout; idle vs fresh vs personal device). Shared device idle 2 h → `/history` **locked**. |
| FF2 own reports | `staging-demo.spec.ts` 2/2 on both browsers, including the demo astronaut's Reports page showing **2 delivered**. The sync query returns only `submitted_by = session.crew_id`, delivered or acknowledged, so it does not widen access. |
| FF3 | `/result` without an ID → the latest result, or "No result yet" (e2e) |
| Regression | CUJ 3/3, offline-sync, the real photo flow on both browsers; battery 30/30 |

## Findings

### GG1 — High (demo) — FF4 puts the demo a day behind in Dhaka, all day

*   `demo-seed.ts` dates every day from **UTC midnight of the run time** (`dayStartUtc`)
    and stamps day 0 at 12:00 UTC.
*   **Reset at 18:00 UTC (FF4):** that is 00:00 Dhaka on the **next** date, but the newest
    seeded day is still the UTC date that is ending.
    *   Auditor's check on staging: newest result `2026-11-09T12:00Z` (Dhaka 9 Nov 18:00).
        The next Dhaka day is 10 Nov, so for the **whole 24 h** Progress shows "0 today"
        and the latest result is a day old.
    *   Before FF4 (reset 00:00 UTC) this happened for 6 h a day.
*   **Extra issue (the old schedule):** a reset at 00:00 UTC writes day 0 at 12:00 UTC,
    **12 h in the future**. "Last assessed 12:00" shows before that time.
*   **Fix:**
    *   add `DEMO_TZ = "Asia/Dhaka"` (`wrangler.toml`, staging and production);
    *   the seed computes **"demo today" = the date in `DEMO_TZ` at reset time**;
    *   day N back = that date minus N;
    *   past days are stamped at 08:00 local (`DEMO_TZ`);
    *   **day 0 is stamped at the reset time itself** (never in the future);
    *   keep the reset at **18:00 UTC = 00:00 Dhaka**;
    *   tests, with a fixed `now`:
        *   a reset at 18:00 UTC on 9 Nov → the newest result's **Dhaka date = 10 Nov**,
            `measured_at` ≤ now;
        *   a reset at any hour → no seeded timestamp after `now`;
        *   the 23/3/3/1 mix still holds.

### GG2 — Medium — The idle lock is bypassed by `?crew=`

*   `getActiveCrewId` returns a URL crew with a valid session **before** the idle check.
    Auditor's test: shared device, idle 2 h → `/history` locked, but
    **`/history?crew=demo-astronaut` opens the previous person's history**. Crew IDs are
    easy to guess (`stg-astro-1`, `demo-astronaut`).
*   **Fix:**
    *   on a shared device past the idle limit, `?crew=` must go through the same lock
        (PIN or the profile picker);
    *   after the PIN is entered, refresh `last_active`;
    *   e2e: idle shared device + `?crew=<id>` → locked.

### Info

*   **Logout is device-only.** `logout()` clears the token on the device; the server
    session stays valid until it expires (24 h shared, 30 d personal). That is acceptable
    for now, since the token is gone from the device. A `POST /api/auth/logout` that
    revokes the session is a good later step.
*   Staging codes used this run: 5 synthetic.

## Next

1.  **Builder:**
    *   fix GG1 and GG2 on the `follow-ups` branches;
    *   run all tests and every e2e suite on both browsers;
    *   paste the CI links; commit as ariandesu with accurate titles; push; do not merge;
        stop.
2.  **Auditor:**
    *   rerun the date-boundary check;
    *   rerun the bypass test;
    *   rerun the suites;
    *   then deploy on the author's go-ahead. The backend deploy includes the new
        `DEMO_TZ` var and a re-seed.

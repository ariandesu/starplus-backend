# Audit: active session fix (2026-11-09)

**Auditor:** Claude · **Branch:** frontend `active-session` `b516430` (from `main`)
**Verdict:** **Fixed. Ready to deploy on the author's go-ahead.** The menu and typed addresses
stay logged in on both browsers, online and offline. Four small follow-ups (FF1–FF4)
don't block the deploy.

## Verified (staging build, real demo login, auditor's walk)

| Check | Chromium | WebKit |
|---|---|---|
| Menu: History, Body, Progress, Self-check, Reports, Medicines, Settings, Home | all logged in (was 4 logged-out) | all logged in |
| Typed `/body`, `/history`, `/check`, `/check/voice`, `/import`, `/result` (no `?crew=`) | all logged in | all logged in |
| Reload | logged in | logged in |
| **Offline**, typed `/body` and `/history` | logged in, with data | logged in, with data |

*   **Code:**
    *   one hook, `useActiveCrew()`. It uses `?crew=` only when that crew has a valid
        session on the device; otherwise the stored `active_crew`. It reads only IndexedDB
        and starts with a loading state;
    *   **no page reads `?crew=` directly any more**;
    *   logged-out views offer "Try the demo".
*   **Tests:**
    *   `active-session.spec.ts` 5/5 on both browsers;
    *   CUJ 3/3, offline-sync, offline-form, staging-demo 2/2, the real photo flow, all on
        both browsers;
    *   battery 30/30 ×2 (one earlier run had 1 failure, matching the known
        `surgeon-photos` parallel flake);
    *   unit 215/215;
    *   CI success on `b516430`;
    *   commit by `ariandesu`, no AI co-author lines.

## Follow-ups (do not block this deploy)

### FF1 — Medium — There is no logout button

*   `logout()` exists in `session.ts`, but no screen calls it. The builder confirmed it:
    "No logout UI exists".
*   On a shared tablet (CUJ 1), the next person cannot end the previous crew member's
    session. Now that the stored active crew is used everywhere, they would land in that
    person's data.
*   **Fix:**
    *   a "Log out" item in the menu and on /settings. It calls `logout()`, clears
        `active_crew`, and returns to `/login`;
    *   on a shared device (the "This is a shared device" tick), opening the app after 30
        minutes idle asks for the profile PIN, or shows the profile picker, before using
        the stored crew;
    *   add e2e tests.

### FF2 — Low — The demo astronaut's own Reports page is empty

*   The two seeded reports show in the demo **surgeon's** view.
*   The demo **astronaut's** Reports page says "Nothing waiting. Delivered: nothing",
    because the post-login pull brings measurements and results, not the crew member's
    own delivered reports.
*   **Fix:** include the crew member's own reports in the demo history pull (or the sync
    endpoint), stored as delivered.

### FF3 — Low — `/result` with no result ID loads forever

*   Logged in, `/result` (no `?result=`) shows "Loading the result…" indefinitely.
*   **Fix:** with no `result` parameter, open the latest stored result. If there is none,
    show "No result yet. Start a self-check".

### FF4 — Low — Demo "today" is UTC, the viewer is in Dhaka

*   The demo month ends on the UTC date and resets at 00:00 UTC (06:00 Dhaka). Between
    00:00 and 06:00 Dhaka, Progress shows "0 today", and the latest result looks a day old.
*   **Fix (any one):**
    *   move the reset to 18:00 UTC (00:00 Dhaka);
    *   or seed through "tomorrow UTC" at reset time;
    *   or count "today" for demo sessions as the demo's last seeded day.

## Next

1.  **Deploy on the author's go-ahead** (frontend only; no backend change):
    *   fast-forward `main`;
    *   Vercel builds it;
    *   on the live site, repeat the menu walk with `/login?demo=astronaut`.
2.  **Builder:** FF1–FF4 on a new branch from `main`, then audit.

## Deployed (2026-11-09)

*   **Approved by:** the author ("ok deploy but don't want claude as coauthor").
*   **Merge:** frontend `main` fast-forwarded to `b516430`, 1 commit by `ariandesu`, no
    Claude or co-author lines. Vercel built it.
*   **No backend or database change.**
*   **Live check** (`/login?demo=astronaut` on the production site): menu History, Body,
    Self-check and Home, plus typed `/body`, `/history` and `/check` →
    **0 logged-out views on Chromium and on WebKit**.
*   **Next:** FF1–FF4 above go to the builder on a new branch from `main`.

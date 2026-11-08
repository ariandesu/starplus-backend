# Change request: one-tap demo login (2026-11-08)

**From:** the author, via the auditor. **Why:** judges and testers should try the app
without typing access codes. **Branch:** `demo-login` in each repo, from `main`.

## What to build

### Backend
*   `POST /api/auth/demo` with body `{ "role": "astronaut" | "flight_medical_officer", "device_id": "<id>" }`.
    *   Works only when the env var `DEMO_LOGIN = "on"` (set in `wrangler.toml` for staging
        and production); otherwise 404.
    *   Signs in as fixed demo crew members, created on first use if missing:
        *   `demo-astronaut` (role astronaut, provenance **synthetic**);
        *   `demo-surgeon` (role flight_medical_officer, provenance **synthetic**).
    *   Issues a normal session marked `demo: true`, valid **24 hours**. No access code is
        created or consumed.
    *   Rate-limited like `/api/auth`.
*   **Data fence (required):** a `demo: true` session can only see synthetic data.
    *   `GET /api/reports`, `GET /api/crew/results`, `GET /api/attachments/<id>` and any
        other surgeon read return **only** rows or objects whose submitter or subject
        crew member has provenance `synthetic`.
    *   A demo surgeon must never see a real crew member's data, even after real crew are
        added.
    *   `POST /api/reports/ack` from a demo session only works on synthetic reports.
    *   Writes from a demo session must be stored as `synthetic`; the existing provenance
        check already enforces this.
*   Route tests:
    *   404 when `DEMO_LOGIN` is off;
    *   a demo login works for each role, with a 24 h expiry;
    *   **a demo surgeon gets 0 rows and 403 for a real crew member's report and photo,
        while a normal surgeon still sees them**;
    *   no access-code rows are created.

### Frontend
*   On `/login`, above the code field: a box headed "Trying the demo?" with two buttons,
    "Demo astronaut" and "Demo flight surgeon".
    *   Each calls `/api/auth/demo` and saves the session like a normal login.
    *   Show a banner on every screen while logged in as demo: "Demo account: synthetic
        data only".
*   Keep the code login unchanged for real crew.
*   **Fix the double-submit at the same time:**
    *   after a successful login, keep the button disabled and show "Logged in, opening…"
        until navigation;
    *   clear the code field;
    *   ignore a second submit while one is in flight.
*   Do not confuse this with **Demo mode** (`/demo`), which stays as it is: fully local, no
    server.
*   e2e (staging): tap "Demo astronaut" → home with the banner → self-check → result; tap
    "Demo flight surgeon" → `/surgeon` loads. Precache stays green; offline routes stay
    green.

## Done when
*   All unit tests, typecheck, lint, `build:staging`, and every e2e suite pass on both
    browsers.
*   Accurate commit titles; commit as ariandesu; push; do not merge; stop.
*   The auditor checks the data fence against production-like data, then merges and
    deploys on the author's go-ahead.

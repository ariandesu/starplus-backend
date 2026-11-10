# Change request: Better Auth, username and password logins, demo role cards (2026-11-10, rev 2)

**From:** the author:
*   "Better auth is the way to go".
*   "For demo login give button type options to load profile username and password
    automatically … like https://star-plus.shareflow.workers.dev/".

Rev 1 of this file recommended a smaller fix; **the author chose Better Auth**, and this
revision follows that decision.

**Branches:** `better-auth` in both repos, from `main`. **Severity: High.** Logins are the first
thing judges touch.

## Why (from the audit)

*   Sessions never renew. Demo sessions die after 24 h, and the app then shows a generic
    "Log in to …" while the profile is still on the device. That matches the author's
    report.
*   Every page decides "who is logged in" on its own (15 copies), which is why this class of
    bug keeps returning.
*   The service worker serves pages cache-first, so the first load after a deploy runs the
    previous build.

## Reference: the login the author wants

Seen on `star-plus.shareflow.workers.dev`:
*   a "Select your mission role" heading;
*   **three cards: Astronaut, Flight Medical Officer, Mission Control**;
*   tapping a card fills **Username** and **Password** (masked, with a show toggle);
*   then **Login**;
*   the footnote "Demo environment · credentials are pre-configured for this demo".

Build the same flow in our design (not a copy of that page's art or text).

## Backend (Worker + D1)

1.  **Better Auth** mounted at `/api/auth/*`, created per request from `env`:
    *   **D1** through Better Auth's D1 support (native, or the Kysely D1 dialect);
    *   plugins: **`username`** and **`bearer`**;
    *   `emailAndPassword` enabled with **public sign-up disabled**: accounts come only from
        the admin, from an access code, or from the demo seed.
    *   **Bearer, not cookies.** The frontend (`vercel.app`) and API (`workers.dev`) are
        different sites, so cookies would be third-party and blocked by Safari and iPad.
        *   Send the token as `Authorization: Bearer`.
        *   Add `set-auth-token` to `Access-Control-Expose-Headers`.
        *   Set `trustedOrigins`: the production frontend and `http://localhost:3100`.
    *   **Secret:** `BETTER_AUTH_SECRET` comes from `wrangler secret`, never a file. The
        auditor sets it on staging and production at deploy time; document the name only.
2.  **Users map to crew.**
    *   Extra user fields: `crew_id` (FK to `crew.id`), `role`, `provenance`, `demo`
        (boolean).
    *   Migration **0006**:
        *   creates Better Auth's tables (from the Better Auth CLI schema, committed as SQL);
        *   keeps `crew`, `access_codes` and all data;
        *   retires the old `sessions` table.
    *   **Everyone signs in once after the deploy.** That is acceptable: the demo is one tap,
        and real crew redeem a code.
3.  **Sessions renew while in use.**
    *   Sliding expiry (`expiresIn` / `updateAge`): **personal 30 days**, **demo 7 days**,
        renewed on use.
    *   **Shared device:** 24 h, set with a session hook when the login says `shared`.
    *   Sign-out revokes the session on the server.
4.  **`requireSession` keeps its name and return shape**:
    *   it returns `{ crew_id, role, demo, session_id }`, now from
        `auth.api.getSession({ headers })`;
    *   the 12 call sites stay as they are;
    *   `demo_acks` is keyed by the Better Auth `session_id`.
5.  **Access codes remain the way real crew join.**
    *   `POST /api/auth/redeem-code { code, username, password }` checks the single-use code,
        creates the Better Auth user linked to that crew member, consumes the code, and signs
        in.
    *   Afterwards the crew member uses username and password.
    *   Rate-limit with `RATE_LIMIT_AUTH`.
6.  **Demo accounts** (synthetic, `demo = true`, created by the demo seed and kept by the
    nightly reset):

    | Card | Username | Crew / role |
    |---|---|---|
    | Astronaut | `astronaut01` | `demo-astronaut` (Alex Rivera), astronaut |
    | Flight Medical Officer | `fmo01` | `demo-surgeon`, flight_medical_officer |
    | Mission Control | `mc01` | `demo-mission`, mission_control |

    *   **Passwords** are public by design: shown masked on the page and filled by the cards.
        Store them in a Worker var `DEMO_PASSWORD` (not in git).
    *   **The demo fence** is unchanged (demo users see only `demo-*` crew).
    *   **Demo accounts are shared, so lock them down:**
        *   **block** change-password, change-username, update-user, delete-user and
            **revoke-other-sessions / revoke-sessions** for `demo` users. One visitor
            pressing "sign out everywhere" or changing the password would lock out every
            judge;
        *   each sign-in gets its own session;
        *   sign-in is rate-limited (Better Auth's limiter plus `RATE_LIMIT_DEMO`);
        *   `DEMO_LOGIN=off` disables all three accounts.
    *   Mission Control gets the same dashboard as the surgeon (already role-aware).

## Frontend

7.  **Login page:**
    *   "Select your mission role" with three cards (Astronaut, Flight Medical Officer,
        Mission Control). Tapping a card **fills** Username and Password and focuses
        **Login**;
    *   the password is masked, with a show toggle;
    *   footnote: "Demo environment · these accounts hold synthetic crew data";
    *   below that, "First time? Use your access code" opens the redeem flow (code, then
        choose a username and password);
    *   keep `/login?demo=astronaut|surgeon|mission`: it fills **and** submits, so judges'
        links stay one tap;
    *   keep "This is a shared device".
8.  **Better Auth client** (`createAuthClient` with the username and bearer clients):
    *   store the bearer token and expiry in the device profile (IndexedDB);
    *   send it on every API call;
    *   when online, `getSession` on app open renews it;
    *   offline, use the stored session until it expires.
9.  **One session layer.**
    *   `useSession()` returns `{ status: loading | active | choose | renewing | expired |
        none | error, crew, reason }`.
    *   **One `<RequireSession>` wrapper** replaces the 15 per-page checks and renders the
        logged-out, choose, expired and error views.
    *   Profile picker and shared-device PIN keep working as today.
10. **Expired or 401:**
    *   **demo** profile → sign in again **silently** with that role's demo credentials,
        pull history, then show the page (no tap, no "Log in");
    *   **real** profile → "Your session for <name> ended. Sign in again", with the username
        filled in. Keep the local data.
11. **Log out** signs out on the server (best effort offline), then clears the device as
    today.
12. **Service worker:**
    *   page navigations go **network-first when online** (3-second timeout), then the
        precache, then the `documents` cache;
    *   static assets stay precached;
    *   keep the "Updated. Reload" bar.

## Tests

*   **Backend:**
    *   sign-in with username and password → bearer token works on `/api/crew/roster`
        (surgeon) and `/api/sync` (astronaut);
    *   public sign-up is refused;
    *   `redeem-code` creates the user, consumes the code, and a second use fails;
    *   sliding renewal extends expiry; a revoked or expired session → 401 everywhere;
    *   **demo users cannot** change password or username, update or delete themselves, or
        revoke sessions;
    *   the demo fence holds for all three demo accounts;
    *   `DEMO_LOGIN=off` → demo sign-in refused;
    *   CORS exposes `set-auth-token`;
    *   all existing route tests are adapted and green.
*   **Frontend unit:**
    *   `useSession` statuses;
    *   card fill;
    *   silent demo re-sign-in on 401 or expiry;
    *   real expiry → expired view.
*   **e2e (both browsers, against staging):**
    *   each card fills the fields → Login → the right home (astronaut Home, or the surgeon
        dashboard for FMO and Mission Control with **4 crew cards**);
    *   `/login?demo=surgeon` → dashboard with no tap;
    *   role switch astronaut → FMO → astronaut keeps the right person;
    *   **expired demo session** seeded → `/history` shows data with no tap;
    *   expired real session → "Your session … ended";
    *   redeem an access code → choose username and password → log out → log in with them;
    *   per-session acknowledge still holds (two demo logins);
    *   **service worker:** a changed build is live on the **first** load; offline still
        loads cached pages;
    *   all existing suites green (CUJ, offline, photos, demo-parity, active and adopt
        session).

## Done when

*   Everything above passes on both browsers **against staging**; CI green (paste the links).
*   Accurate commit titles; commit as ariandesu; push; do not merge; stop.
*   **Do not** commit `BETTER_AUTH_SECRET` or `DEMO_PASSWORD`; list them in the report.
*   **The auditor then:**
    *   sets the secrets on staging, applies 0006, and deploys;
    *   walks all three cards on both browsers;
    *   ages a demo session past expiry and confirms the silent re-sign-in;
    *   tries the demo lock-downs;
    *   checks the fence;
    *   then deploys to production on the author's go-ahead: back up first and stop if the
        backup fails; migration 0006; the secrets.
*   **Timing:** the hackathon starts 2026-11-14. If this is not audited green by the end of
    2026-11-12, the auditor will say so, and production stays on the current login.

# Change request: the demo shows everything a real astronaut and flight surgeon see (2026-11-09)

**From:** the author. "I want demo login to show every data, every thing, as a real
astronaut and flight surgeon will see." **Basis:** the auditor walked every screen on
production as the demo astronaut and the demo surgeon (2026-11-09).
**Branches:** `demo-parity` in both repos, from `main`, **after** `adopt-session`
(`request-2026-11-09-adopt-session.md`) is merged.

## What the walk found

| Screen | Demo astronaut | Demo surgeon |
|---|---|---|
| Home | status, reminder ✔ | "No check-in yet": the surgeon's own empty data |
| Self-check, result, history, body map, medicines, settings, emergency | populated ✔ | history and body map: "No data yet" |
| Progress | 4/4, 30-day streak ✔; **crew progress 0%** (server excludes synthetic data) | 0/4, crew 0% |
| Reports | 2 delivered, titled with raw IDs ("seed-dem…") | empty |
| `/surgeon` | correctly refused | **only a list of 2 reports from one astronaut, shown by raw ID** ("From demo-astronaut"). **No crew roster, no per-crew status, no trends** |

The surgeon gap is in the **real product**, not only the demo. `GET /api/crew/results` and
`getCrewResults()` exist, but no screen uses them.

## Part A: a real flight-surgeon dashboard (for every surgeon, demo or not)

1.  **Backend `GET /api/crew/roster`** (`flight_medical_officer`, `mission_control`).
    *   One row per astronaut: `crew_id`, `name`, latest `overall_status`, `last_check_in`,
        check-in days in the last 7, the count of **unacknowledged** reports, and the
        latest reading per vital (value, unit, status).
    *   **The demo fence applies:** a demo session sees only synthetic crew.
    *   Route tests: fields and order (critical first, then watch, then oldest check-in);
        fence (a demo surgeon never sees a real crew member).
2.  **`/surgeon` becomes a dashboard:**
    *   **Crew board:** one card per astronaut, showing name, status colour and word,
        "last check-in 3 h ago", 7-day check-ins, open reports (badge), and the key vitals.
        Critical first.
    *   **Crew detail** (`/surgeon/crew?id=…`):
        *   result timeline from `/api/crew/results`;
        *   latest per-measure status with reason, citation and baseline;
        *   trend charts (the same chart component as History);
        *   that astronaut's reports, with photos;
        *   "Acknowledge".
    *   **Reports inbox:** all reports; filters "Open" and "All"; each titled
        "<kind> · <crew name> · <time>" (**no raw IDs**); acknowledge from the inbox.
    *   Works offline from the last fetch (cache the roster and details in IndexedDB),
        with "Last updated …".
3.  **Role-aware navigation:**
    *   surgeon or mission-control sessions get Dashboard (`/surgeon`), Crew, Reports,
        Emergency, Medicines, Settings;
    *   Home for those roles opens the dashboard;
    *   astronaut-only items (self-check, personal history, body map, progress) are hidden
        for them;
    *   astronauts are unchanged.

## Part B: a realistic demo crew

1.  **Four synthetic astronauts**, each with a clear story, seeded by `resetAndSeedDemo`
    (Worker, Dhaka dates, nothing in the future), from different people in the synthetic
    CSV with the same steady-plus-scripted-events method:

    | ID | Name | Story |
    |---|---|---|
    | `demo-astronaut` | Alex Rivera (the one-tap astronaut) | as today: mostly nominal, critical 3 days ago, **watch** today |
    | `demo-crew-2` | Sam Okafor | all nominal, 30-day streak, every patch |
    | `demo-crew-3` | Mia Chen | **critical today** (low SpO₂), an **open emergency report with a photo** |
    | `demo-crew-4` | Leo Haas | joined 3 days ago: "insufficient" (grey) then nominal; no baseline yet |

2.  **Reports:** a routine report from each of Alex, Sam and Mia. Mia's emergency report is
    **open**; Alex's past one is **acknowledged by the demo surgeon**.
3.  **Crew progress for demo sessions** is computed over the demo crew only, so it shows a
    realistic figure. Real sessions are unchanged: real crew only, with the existing tests.
4.  The demo astronaut's Reports page shows readable titles: kind, date, status.
5.  The daily reset rebuilds all four, keeps sessions, and touches only `demo-*` rows.

## Part C: wording

*   Remove "synthetic", "demo points" and similar from **inside** the screens, so they read
    exactly as a real crew member's do.
*   **Keep one slim top banner** on every screen during a demo session: "Demo:
    synthetic crew data". This is required for honesty with judges and matches the
    disclosure. It must not be removable.

## Tests

*   **Backend:**
    *   roster route and fence;
    *   seed: 4 crew members with the story statuses (Alex latest watch; Mia latest
        critical; Leo first 3 days insufficient; Sam all nominal);
    *   demo crew progress > 0; real crew progress unchanged.
*   **Frontend unit:** role-aware nav; report titles with no raw IDs.
*   **e2e (staging, env-gated):**
    *   `/login?demo=surgeon` → the dashboard shows **4 crew cards, Mia first (critical)**;
    *   open Mia → timeline, charts, the emergency report with a **loaded** photo →
        acknowledge → the badge clears;
    *   the reports inbox has no raw IDs;
    *   `/login?demo=astronaut` → every screen populated, crew progress > 0, no "synthetic"
        text except the banner;
    *   offline: the dashboard loads from cache.
*   All existing suites stay green on both browsers; CI green.

## Done when

*   Everything above passes.
*   Accurate commit titles; commit as ariandesu; push; do not merge; stop.
*   The auditor walks every screen for both roles on staging, checks the fence against the
    real fence-test crew member, then deploys on the author's go-ahead.

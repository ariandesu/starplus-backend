# Design deviations

Proposed entries need the author's approval before they take effect. Anything
touching HANDOFF section 5 needs approval before merging (none below does).

## 2026-11-08 — demo scenes run on staging, not in demo mode (proposed)

*   **Design section:** `docs/demo-script.md` (Phase 0, item 10); Critical User Journeys
    CUJ 1, 2, 4, 6, 7, 8; "Storage, sync and identity" (outbox disabled in demo mode).
*   **What the design says:** the three-minute script lists CUJ 1 (emergency in a
    blackout), CUJ 2 (self-check), CUJ 4 (estimate entry), CUJ 7 (report delivered
    and acknowledged), CUJ 6 (model swap) and CUJ 8 (demo mode), with every scene
    using minimum-version features.
*   **What is proposed instead:** record scenes CUJ 1, 2, 4, 6 and 7 against
    **staging**, with a staging crew whose 30-day history is loaded with
    `tools/load-import.ts` (provenance `synthetic`, staging only). The comms-link
    simulation toggle in settings works in every mode. Only CUJ 8 uses demo mode.
*   **Why:** the outbox is disabled in demo mode, so CUJ 7 (report delivered and
    acknowledged) cannot play there. CUJ 2 needs 30 days of history, which the
    demo store does not guarantee. The comms-link simulation is described as a
    demo-mode behaviour, while CUJ 1 (Mars blackout with no login) needs it too.
*   **Rule impact:** none. No safety limit, model, schema, API or secrets change.
    Demo data stays out of crew tables per rule 6 (staging crew rows carry
    provenance `synthetic`).
*   **Status:** proposed — waiting for author approval. `docs/demo-script.md` is
    unchanged until approved.

# Design deviations

Proposed entries need the author's approval before they take effect. Anything
touching HANDOFF section 5 needs approval before merging.

## 2026-11-08 — `POST /api/auth` also returns the crew's provenance (APPROVED 2026-11-08)

*   **Design section:** API contract (`POST /api/auth` response).
*   **What the design says:** `200 {token, crew_id, role, expires_at}`.
*   **What is implemented instead:** `200 {token, crew_id, role, expires_at, provenance}`,
    where `provenance` is the crew member's `crew.provenance`.
*   **Why:** the G2 provenance-mismatch rule rejects real-provenance records from synthetic
    crew members, so the device must label new records with its crew's provenance. Nothing
    else on the device can know it.
*   **Rule impact:** additive response field only. Old clients ignore it. No safety-limit,
    model, schema or secrets change.
*   **Status:** APPROVED by the author 2026-11-08 (Phase 3 G-items).

## 2026-11-08 — limit entries gain an optional `max` bound (APPROVED 2026-11-08)

*   **Design section:** Fixed implementation decisions ("Catalog limit shape")
    and the Safety limits table.
*   **What the design says:** limits are `{level, op, value, source}`; a value
    matching any critical entry is critical, else any watch entry is watch.
*   **What is implemented instead:** entries may carry an optional numeric
    `max`; a value matches only if the comparison holds and
    (`max` undefined or value ≤ `max`). No limit value, level or source
    changed. Bounded watch bands use it: heart rate 111–130, respiratory
    21–24, SpO2 92–93, systolic 91–100.
*   **Why:** the specified shape cannot express the table's bounded bands. A
    bare `{>=, 92}` watch ray also matches 97, which the table leaves nominal.
    This is additive and backward compatible; the loader still accepts the
    specified shape.
*   **Rule impact:** safety-limit evaluation is involved, so this needs the
    author's approval before merge. No limit value, level or citation changed.
*   **Status:** APPROVED by the author 2026-11-08. The `max` bound stays.
    Condition: the 25-value boundary check in `core/test/content.test.ts`
    ("limit boundaries match the design table") guards the bounded bands.

## 2026-11-08 — pregenerate reads MODEL_API_KEY from the environment (implemented per HANDOFF §3)

*   **Design section:** Phase 3 item 65 (`tools/pregenerate.ts` reads the key from `../.secrets/meta-model-api-key`).
*   **What the design says:** read the Meta key from a workspace file.
*   **What is implemented instead:** `tools/pregenerate.ts` reads `MODEL_API_KEY` from the
    process environment and refuses to run without it. Nothing is ever read from
    `.secrets/` or committed.
*   **Why:** HANDOFF §3 (Contributor-mode warning: Meta may train on everything the builder
    sends) requires the key in the shell environment, never in a workspace file.
*   **Rule impact:** none beyond strengthening rule 11 (no secrets in the repo).
*   **Status:** implemented per HANDOFF instruction; no generated explanations ship until
    the author runs it with their own key in their own shell.

## 2026-11-08 — demo scenes run on staging, not in demo mode (APPROVED 2026-11-08)

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
*   **Status:** APPROVED by the author 2026-11-08. `docs/demo-script.md`
    updated to match.

## 2026-11-08 — `tools/prompts/result-template.md` removed (documented)

*   **Design section:** Phase 3 item 65.
*   **What the design says:** pregenerate reads `tools/prompts/result-template.md`.
*   **What is implemented instead:** the prompt file is removed. Per-entry
    explanations (`tools/prompts/explain-entry.md`) already produce standard and
    simple sections; on the device, result explanations are filled from reviewed
    knowledge-base entries with `core/explain/templates.ts`. A separate
    result-template prompt had no consumer and no cache entry to live in.
*   **Rule impact:** none (build-time tooling only, no shipped content changes).

## 2026-11-08 — explain-entry prompt keeps safety qualifiers; PROMPT_VERSION unchanged (audited)

*   **Design section:** Phase 3 item 65 (`tools/pregenerate.ts`, `tools/prompts/explain-entry.md`).
*   **What the review found:** the prompt's ban on words like "normal" made the model drop
    safety-critical qualifiers ("no normal breathing", "no reply sooner than…").
*   **What changed:** the prompt now requires keeping every qualifier word for word
    ("normal", "normally", "at least", "no sooner than", "only if", "never",
    "do not", "at once"); the ban on "normal"/"fine" applies only to describing
    the reader's own results. `core/explain/filters.ts` gained a must-keep check
    (phrases present in the source must appear at least as often in the output)
    and only flags "normal"/"fine" as softening when the source lacks them.
    `PROMPT_VERSION` stays `"1"` so the 27 reviewed cache entries keep their keys.
*   **Rule impact:** none (build-time tooling only; shipped cache unchanged).

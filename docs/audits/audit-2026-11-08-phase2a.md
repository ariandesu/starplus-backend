# Audit: Phase 1 close-out and Phase 2 (first half) — 2026-11-08

**Auditor:** Claude · **State audited:** backend `main` `e9b2928`, `phase-2` `1562113`;
frontend `main` `b05bd21`, `phase-2` `ebacbbe`
**Verdict:** Phase 1 is **closed and accepted**. Phase 2 so far is technically sound, but
the first-aid content needs work before any screen shows it (C1–C3), and one client gap
must be fixed (S1).

## Phase 1 close-out — verified

| Check | Result |
|---|---|
| Production `/api/health` | 200, `d1: "ok"`, environment `production` |
| Staging `/api/health` | 200, `d1: "ok"`, environment `staging` |
| Protected routes (reports, crew results, batch, admin) without a token | 401 on both |
| Staging admin route | 503 "API_KEY secret is not configured" (expected until the author sets it) |
| CORS | Preflight from the app's origin allowed; a foreign origin gets no allow header |
| Legacy routes | `/api/astronauts` still 200 |
| Migrations | Production reports nothing pending (0003 applied); backups exist for both environments in `backups/` |
| CI | Green on both `main` branches; commits by `ariandesu`, no AI lines |

Nit: a GET with a request body returns 404 instead of the route. Harmless; browsers never
send one.

## Phase 2 — what the auditor checked

*   Backend `phase-2`: 33 knowledge-base entries (19 measures, 9 first-aid, 5 hazards), a
    3-medicine formulary with no doses, `core/src/content.ts` validator, citation check in
    CI. CI green.
*   Frontend `phase-2`: `db.ts`, `session.ts`, `outbox.ts`, `api.ts`. The auditor ran
    48 tests: pass. Typecheck: clean. The CI failure is only the cross-repo `core` check,
    which is expected until backend `phase-2` merges.

## Findings

### C1 — High — First aid ignores microgravity

The CPR, unresponsive-person, fainting and anaphylaxis steps are written for Earth: "heel
of the hand on the centre of the chest", "recovery position", "lay the person flat with
legs raised". In microgravity, compressions push the rescuer away, and "flat" and
"recovery position" do not apply. This is the challenge's own headline scenario (crewmate
collapses halfway to Mars), and judges from NASA and the Brazilian Space Agency will notice.

**Fix:** add a setting-specific block to each affected protocol. It is shown when the
setting is `iss` or `mars_transit` (in flight).
*   CPR: restrain the patient on a rigid surface (the crew medical restraint system on the
    ISS). Use a published microgravity compression method: the Evetts-Russomano method,
    or the handstand method against the opposite wall. Cite the published studies:
    Rehnberg et al. 2014 (*Aviation, Space, and Environmental Medicine*) for
    Evetts-Russomano, and the 2023 European Society of Aerospace Medicine guideline for
    CPR in space (Hinkelbein et al., *Resuscitation*).
*   Recovery position, legs raised: replace with "restrain the person so they cannot
    drift; turn the head to the side if vomiting" and the guideline's own wording.

Moon base and rover (partial gravity) use the Earth steps, with a note from the same
guideline. If the builder cannot find and cite these sources exactly, the author must
supply them. Do not paraphrase from memory.

### C2 — High — A medication timing instruction is in first-aid text

`firstaid-anaphylaxis` says "a second dose may be given after 5 to 15 minutes". That is
dosing guidance generated as text, which decision G forbids unless it is quoted word for
word with its citation.

**Fix:** either quote the source sentence exactly with a specific citation, or replace it
with "a second dose only as directed by the crew medical officer or mission protocol". Add
a content test that rejects dose patterns (numbers next to mg, mL, units, "dose", "every N
minutes" for medicines) in KB text unless the entry carries a `quoted_source`. Carbohydrate
amounts (15 g of sugar) are not medication; leave them with their ADA citation.

### C3 — Medium — Citations cannot be verified

Citations are free text such as "American Heart Association Guidelines for CPR". There is
no document title, year or URL. Some are self-references ("App design: baseline scoring
only"). The validator accepts any non-empty string, so the citation test proves almost
nothing.

**Fix:** citations become `{title, publisher, year, url}`, all required. A separate
`design_note` field holds statements like "no published single-reading limit", which are
not citations. Update `content.ts` and the test. Use specific documents:
*   2020 AHA Guidelines for CPR and ECC, Part 3 (Adult BLS);
*   American Red Cross First Aid/CPR/AED Participant's Manual (latest edition);
*   NEWS2 (RCP 2017);
*   ADA Standards of Care (current year, Section 6);
*   DailyMed label URLs for each medicine;
*   NASA-STD-3001 Vol. 1 Rev. B.

Also: `firstaid-unresponsive` says "look, listen and feel". The AHA dropped that wording
in 2010. Use "check for normal breathing for no more than 10 seconds".

### S1 — Medium — Shared-device logins are never requested

The server supports 24-hour shared sessions (Phase 1, P2), but `login()` never sends
`shared`, and nothing sets `shared_device` to true. On a crew tablet, every login gets 30
days.

**Fix:** a "This is a shared device" setting, stored per device; `login()` sends
`shared: true` when it is set; a test asserts the request body.

### S2 — Low — The PIN hash is the same on every device

`sha256("starplus-pin:" + pin)` is the same on every device. The design already says the
PIN is a screen lock only, so this is low. Still, add a random per-device salt to the
hash.

### W1 — Low — Workflow: a frontend phase branch can never be green before the backend merges

The cross-repo check compares against backend `main`. **Fix:** compare against the
backend branch with the same name when it exists, otherwise `main`. This keeps
"merge only when green" meaningful for the frontend.

## Author actions — done by the auditor on the author's instruction (2026-11-08)

*   Staging `API_KEY` set (stored in `Starplus v2/.secrets/starplus-staging-api-key`);
    admin routes now return 401 without it.
*   Staging crew created, all `provenance: synthetic`: `stg-astro-1`, `stg-astro-2`
    (astronauts), `stg-fmo-1` (flight medical officer).
*   Five single-use codes issued (two each for `stg-astro-1` and `stg-fmo-1`, one for
    `stg-astro-2`) into `Starplus v2/.secrets/staging-access-codes.txt`, mode 600. They
    were never printed.
*   Live check with a throwaway crew (`stg-verify`, revoked afterwards): login 200;
    `shared: true` gives a 24.0-hour session; a reused code is refused (401); `/api/sync`
    with the token returns 200; the surgeon-only `/api/reports` returns 403 for an
    astronaut; after revoke, the token gets 401.
*   Production crew and codes: not created (real people only, author's choice).

## Follow-up check (2026-11-08, after the screens were built)

*   Frontend `phase-2` now has login, self-check, result, emergency and reports routes,
    the app shell with the emergency control, a self-hosted font, the manifest, and a
    Serwist service worker. The auditor's run: 48 tests pass, typecheck and lint clean,
    `next build --webpack` succeeds. The offline CUJ 1 spec passes per the builder.
*   The model panel is grey, labelled "advisory only", and shows the disagreement text as
    designed.
*   **C1, C2, C3, S1, S2 and W1 are not done.** The emergency screen now shows the
    Earth-only CPR steps and the generated epinephrine timing line. These fixes must land
    before the Phase 2 gate and before any demo recording.
*   No new tests cover the screens yet (the test count is unchanged at 48). The Phase 3
    Playwright suite must cover them.

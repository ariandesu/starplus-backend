# Audit: Phase 6, AA-fixes (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-6` `7f1daa4`, frontend `phase-6` `d3ba326`
**Verdict:** **AA1, AA2 and AA4 pass. AA3 does not work in real use:** a real flight-surgeon
session never sees the photo, because the attachment GET has **no CORS header** (BB1). The
builder's `surgeon-photos` test fakes both API responses, so it could not catch this. Fix
BB1–BB3 (all small), then Phase 6 can merge.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| **AA1 probe, rerun** | Owner upload 201 → owner retry **200** → attacker overwrite (PNG) **409**, (SVG) **400** → SVG under a new ID **400** → text labelled PNG **400** → 4 MB body **413**. Victim and flight surgeon GET 200 `image/png` with `nosniff` and `sandbox; default-src 'none'`; attacker GET 403. |
| **AA4** | A PNG sent as an emergency photo arrived as `image/jpeg` (762 B): always re-encoded. The builder's e2e checks there is no APP1/EXIF. |
| **AA2** | `docs/disclosure.md` now has the dated timeline (all work 2026-11-07 to 12, before the event, from existing repos), the true roles (Claude as an AI: design, audits, deploys, explanation review; Muse Code / `muse-spark-1.3-contributor`: code and explanations), the AI review, and Meta's training use. See BB2 for 3 small corrections. |
| Checks | Backend 112/112; frontend 206/206 ×2; citations ok; typecheck clean; lint 0 errors; `core/` identical; CI success on both heads; fresh `build:staging` |
| Browser suites | CUJ 3/3 and offline-sync on **Chromium and WebKit** (real staging logins); camera 4/4; emergency-photo 2/2; surgeon-photos 2/2 (mocked); bluetooth-voice 6/6; import 6/6; offline routes 4/4 |
| Staging | Auditor redeployed `phase-6` to **staging only** (`9b6aaa75`). Production is untouched (`cfd33b7a`). |

## Findings

### BB1 — High — Flight surgeon cannot load any photo (missing CORS header)

*   **Real flow on staging:**
    1.  Astronaut `stg-astro-1` sends an emergency report with a photo. The report and
        payload are stored with `attachments: [{id, image/jpeg, 762}]`.
    2.  Flight surgeon `stg-fmo-1` opens `/surgeon`: the report text is shown, but
        **`photo-thumb` never appears**.
*   **Cause:** `handleGetAttachment` returns `new Response(object.body, {headers})` without
    the CORS headers the `json()`/`error()` helpers add.
    *   `curl` with `Origin: http://localhost:3100`: `/api/reports` has
        `access-control-allow-origin`, but `/api/attachments/<id>` has **none**.
    *   The browser blocks the fetch.
    *   The same will happen on production with the Vercel origin.
*   **Fix:**
    *   build the attachment response with the same CORS function the JSON helpers use
        (allowed origin, `Vary: Origin`);
    *   route test: GET with an allowed `Origin` carries `access-control-allow-origin`, and
        a foreign origin does not;
    *   **e2e without mocks:** an env-gated test (`STARPLUS_STAGING_CODE_ASTRO` +
        `STARPLUS_STAGING_CODE_FMO`) where the astronaut sends a photo report and the
        flight surgeon sees a loaded thumbnail (`naturalWidth > 0`). Keep the mocked test for
        the 404 "expired" case only.

### BB2 — Low — Three corrections to the disclosure

*   **Claude also wrote code before the handoff.** On 2026-11-07/08, at the author's
    request, Claude fixed the existing repos (frontend styling and build, backend
    validation and routes) and deployed them, then handed the build over. Say so under
    "Who did what". Claude also ran `pregenerate` with the author's key for the
    explanations.
*   "nothing came from NASA or any space agency" contradicts the earlier section's 28 NASA
    OSDR glucose values. **Fix:** "No data row came from NASA or any space agency; 28
    published OSDR values were used only as a plausibility reference."
*   **Origin of the pre-existing repos:** their first commits are dated 2026-11-07. Only
    the author knows how they were made. **Author:** confirm or correct that sentence
    before submission.

### BB3 — Low — The surgeon view shows the oldest 500 reports, not the newest

*   `/surgeon` calls `GET /api/reports` with no cursor. The server returns
    `ORDER BY received_at ASC LIMIT 500`. Once a crew passes 500 reports, new emergency
    reports would not appear. Staging has 55 today.
*   **Fix (choose one):**
    *   the surgeon view pages with the existing `since` cursor until the reply is shorter
        than 500;
    *   or add `?order=desc` for the surgeon view and show the newest 500.

    Add a route test with 501 reports.

### Info

*   The `head`-then-`put` check has a tiny race between two simultaneous uploads with the
    same ID. Acceptable. An R2 conditional put would close it if wanted.
*   Staging codes used this run: 7 synthetic codes (6 `stg-astro-1`, 1 `stg-fmo-1` for
    the CORS check), plus 1 `stg-fmo-1` for the photo flow. The author's own two codes are
    still unused.

## Next

1.  **Builder:**
    *   fix BB1–BB3 on `phase-6`;
    *   run all unit tests, citations, typecheck, lint, `build:staging`, and every e2e
        suite on both browsers;
    *   report with accurate commit titles, commit as ariandesu, push, do not merge, stop.
2.  **Auditor:** rerun the real astronaut → surgeon photo flow and all suites.
3.  **Author:** confirm the disclosure (BB2, last point).
4.  **Then:** merge and deploy on the author's go-ahead, and tag `freeze-2026-11-12` in both
    repos. The build is complete.

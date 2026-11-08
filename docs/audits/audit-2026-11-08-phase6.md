# Audit: Phase 6 gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-6` `9168f70`, frontend `phase-6` `8df6ec6`
**Verdict:** **Not ready to merge.** The camera screens, offline photo delivery and tests
are solid. But the attachment store lets one crew member **overwrite another's photo**
with a scripted SVG (AA1). The disclosure document misstates when the work was done and
who did what (AA2), and that document goes to the judges. Fix AA1–AA4. The freeze tags
wait until after merge and deploy, which is correct.

## Verified

| Item | Evidence (auditor's run) |
|---|---|
| Infrastructure | R2 `starplus-attachments` and `-staging` exist, each with a 90-day expire rule; **public access disabled**, no custom domains. **Nothing was deployed by the builder**: production is still `cfd33b7a` (Phase 5). The report's "8aa88105, unchanged since Phase 5" is wrong; ignore it. |
| Checks | Backend 110/110; frontend 205/205 ×2; citations ok; typecheck clean; lint 0 errors; `core/` identical; CI success on both heads |
| Browser suites (fresh `build:staging`) | CUJ 3/3 and offline-sync on **Chromium and WebKit** (real staging logins); camera 4/4; bluetooth-voice 6/6; import 6/6; offline routes 4/4 |
| **Emergency photo, end to end** (auditor deployed `phase-6` to **staging only**, `12a802d9`) | Report with a PNG queued **offline** → reconnect → `POST /api/attachments 201`, then `POST /api/reports 201` |
| Camera heart rate | `source: camera_hr`, `is_estimate: 1`. The baseline pool takes only `is_estimate === 0`, so it never enters a baseline, even if confirmed (design). |
| OCR | Tesseract.js loaded on demand (`await import`); editable preview; no default measure |
| Attachment access | GET is allowed for the sender and `flight_medical_officer` only; others get 403 |

## Findings

### AA1 — High — A photo can be overwritten by another crew member, and any bytes pass as an image

*   **Auditor's route probe:**
    1.  Crew A uploads a PNG. Crew B's GET → 403 (correct).
    2.  Crew B uploads **to the same ID** with `image/svg+xml` and a script → **201**.
    3.  Now B's GET → **200 image/svg+xml**, A's GET → **403**, and the flight surgeon is
        served B's SVG.
    4.  Plain text labelled `image/png` → **201**.
*   The ID is chosen by the client. A random UUID is hard to guess, but evidence in a
    medical report must not be replaceable by anyone. And `image/*` lets in SVG, which can
    run script wherever it is opened as a document (for example a `blob:` URL opened in a
    tab).
*   **Fix (`src/reports.ts`):**
    *   **No overwrite.** `head` the key first:
        *   if it exists with the same `submitted_by` and the same size → 200, an idempotent
            retry;
        *   otherwise → **409**;
        *   or use an R2 conditional `put` (`onlyIf` with no etag match).
    *   **Allowlist** `image/jpeg`, `image/png`, `image/webp` only.
    *   **Check the magic bytes** match the claimed type (JPEG `FF D8 FF`, PNG
        `89 50 4E 47`, WebP `RIFF….WEBP`); otherwise 400.
    *   Reject before parsing when `Content-Length` > 3 MB (base64 overhead), so huge bodies
        are never read.
    *   **GET headers:** `X-Content-Type-Options: nosniff`,
        `Content-Security-Policy: sandbox; default-src 'none'`,
        `Content-Disposition: inline; filename="<id>"`.
    *   Route tests for each case, including the exact probe above.

### AA2 — High — The disclosure document is inaccurate (it goes to the judges)

*   "Everything in `starplus-backend/` and `starplus-frontend/` was built for this event" is
    **false**:
    *   both repos existed before (Phase 0 refactored an existing dashboard and Worker,
        migrations 0001–0002);
    *   all of this work is happening **2026-11-07 to 2026-11-12, before the 2026-11-14
        event**.

    This is the eligibility question the author still has open with the Local Event
    organiser. The disclosure must state it plainly, not hide it.
*   "Claude … for software development: design, code, tests and docs" is **wrong**. The
    actual roles:
    *   **Claude** (Anthropic): design (with the EGM review workflow), the build handoff,
        every phase audit, staging and production deploys on the author's approval, and the
        explanation review.
    *   **Muse Code with `muse-spark-1.3-contributor`** (Meta): wrote the code, tests and
        progress reports from the approved design.
    *   **`muse-spark-1.3-contributor`** also generated the explanations at build time.
*   "every entry was reviewed by a human" is **false**. The 33 explanations were reviewed
    by **Claude, an AI**, on the author's instruction (`docs/audits/review-2026-11-08-explanations.md`).
    No human clinician reviewed them.
*   Add that Contributor mode lets Meta use the submitted prompts and content for training.
    Only public knowledge-base text was sent (decision F).
*   **Fix:** rewrite `docs/disclosure.md` with these facts and a dated timeline:
    *   design 2026-11-08;
    *   Phases 0–6, 2026-11-08 to 2026-11-12;
    *   model swap 2026-11-13.

    The author must read it before submission. Also check both READMEs for the same claims.

### AA3 — Medium — No one can see an attached photo in the app

*   No screen shows attachments: the surgeon view and reports list neither show nor link
    them. The photo reaches R2, but the flight surgeon has no way to view it.
*   **Fix:**
    *   in the surgeon view's report detail, list each attachment as a thumbnail;
    *   fetch with the bearer token → `blob` → an `<img src>` with an object URL, revoked on
        unmount;
    *   never open a blob URL in a new tab;
    *   show "Photo expired (90 days)" on 404;
    *   add an e2e test (FMO session) and a role test (astronaut cannot see another's photo).

### AA4 — Medium — Photos keep their metadata (including GPS)

*   `compressImage` returns the original file when it is already ≤ 2 MB. Phone photos carry
    EXIF data (location, device, time), and HEIC or other types pass through.
*   **Fix:**
    *   **always** re-encode through a canvas to JPEG (quality 0.85, longest side at most
        1,600 px). That removes metadata and gives a single allowed type;
    *   add a unit test that the output starts with `FF D8 FF` and has no EXIF `APP1`
        marker.

### AA5 — Info

*   Not creating the `freeze-2026-11-12` tags before audit, merge and deploy is right.
*   Staging now runs `phase-6` (`12a802d9`) with the staging bucket; production does not.
*   Staging codes used this run: 5 synthetic `stg-astro-1` codes.

## Next

1.  **Builder:**
    *   fix AA1–AA4 on `phase-6`;
    *   run all unit tests, citations, typecheck, lint, `build:staging`, and every e2e suite
        on both browsers;
    *   report with accurate commit titles, commit as ariandesu, push, do not merge, stop.
2.  **Auditor:** rerun the attachment probe, a photo end to end with a surgeon view, and
    all suites.
3.  **Author:** read and approve `docs/disclosure.md`.
4.  **Then:** merge and deploy on the author's go-ahead, then tag `freeze-2026-11-12` in
    both repos. That completes the build.

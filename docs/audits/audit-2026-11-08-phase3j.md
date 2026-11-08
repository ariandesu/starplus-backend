# Audit: Phase 3 gate, T-fixes and explanations (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `9e80e96`, frontend `phase-3` `5571717`
**Verdict:** **All four Phase 3 gate items are met.** The last one becomes true when the
reviewed cache is committed. Two leftover items from the previous round (S1, S2) and two
small new ones remain. Then the branch is ready to merge, and production deploy needs the
author's go-ahead.

## Phase 3 gate status

| Gate item (HANDOFF §6) | Status |
|---|---|
| CUJ suite green on Chromium and WebKit, incl. CUJ 2 < 60 s | **Pass.** This round: Chromium 3/3 ×2. WebKit 3/3 in 4 of 5 runs; 1 run hit U1 (test timing). |
| Every shipped explanation `reviewed` | **Pass once committed.** 33/33 reviewed (`review-2026-11-08-explanations.md`, round 2). The file is uncommitted, SHA-256 prefix `e1ffa448f3791b23`. |
| Filter cases green | **Pass.** 11 eval cases, including the 3 new must-reject cases (core tests). |
| Staging load test, 1,260 rows | **Pass** (phase3d; backend data path unchanged since). |

## Verified this round

| Item | Evidence |
|---|---|
| Committed cache | `e75dc79` is byte-identical to the auditor's reviewed file; the frontend copy is identical. |
| T1 | `getExplanation` recomputes the pregenerate key and returns text only for `reviewed`. The AI label shows only on AI text; otherwise "From the cited source". 4 unit tests. |
| T2 | Prompt keeps qualifiers. Must-keep filter. "normal"/"fine" only flagged when absent from the source. 3 must-reject eval cases. `PROMPT_VERSION` unchanged; deviation logged. Round-2 generation produced 6/6 faithful entries. |
| T3 | `pregenerate` skips and continues, writes after each entry, exits non-zero on skips. Seen working in the auditor's run ("0 skipped" per entry). |
| Checks | Backend 88/88. Frontend 76/76 on 5 of 5 runs. Typecheck clean, lint 0 errors. The staging build has no production URL. |
| Other suites | `offline-form`, `offline-sync`: pass on both browsers. Offline suite 4/4. |

## Findings

### S1, S2 — carried over from `audit-2026-11-08-phase3i.md`, not done

*   **S1:** the racy unit test "retries on the backoff timer while items wait". It passed 5/5
    this round, but the race is still in the code.
*   **S2:** the home screen still has no waiting-report banner (`src/app/page.tsx`).

### U1 — Low — WebKit CUJ reload can hit an in-flight navigation

*   1 of 5 WebKit CUJ runs failed at `cuj.spec.ts:108`, `page.reload()`: "Navigation
    canceled by policy check". The next 3 runs passed.
*   Just before, "confirm reading stands" calls `router.push` to a **new** result URL. The
    test waits for the heading (already on screen from the old result) and reloads offline.
    If that client navigation has not finished, WebKit cancels the reload.
*   **Fix (test):**
    *   before confirming, record the current URL;
    *   after confirming, `await page.waitForURL((url) => url.href !== before &&
        url.searchParams.has("result"))`;
    *   then reload.

    Run WebKit CUJ 5 times locally if you can; otherwise the auditor will.

### U2 — Low — Must-keep phrase matching has no gap limit

*   `countOccurrences` lets any number of words fall between the words of a phrase. So
    "no … sooner … than" can match words from different sentences and hide a dropped
    qualifier.
*   **Fix:** allow at most 3 words between the words of a phrase, and only within one
    sentence (no `.`, `;` or `!` in between). Add a unit test where the words are spread
    across two sentences and must not count.

## Next

1.  **Builder:**
    *   **commit `starplus-backend/core/content/explain-cache.json` exactly as it is in the
        working tree** (33/33 reviewed, SHA-256 prefix `e1ffa448f3791b23`). Then run
        `sync-core` so the frontend gets it and the checksum updates;
    *   fix S1, S2, U1, U2;
    *   run all unit tests (frontend 10 times), typecheck, lint, `build:staging`, and the
        offline suite on both browsers;
    *   report, commit, push, do not merge, stop.
2.  **Auditor:** rerun CUJ (5 runs per browser), offline-form and offline-sync. Confirm the
    shipped cache hash and that the "AI-written" label shows on an approved entry.
3.  **Merge and production deploy:** this needs the author's go-ahead. Merge `phase-3` in
    both repos, deploy the Worker (staging, then production), merge the frontend to `main`,
    and smoke-test production with one real crew code.

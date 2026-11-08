# Audit: Phase 3 final gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `0113d93`, frontend `phase-3` `4ed649d`
**Verdict:** **Phase 3 passes, with one blocking housekeeping fix (V1).** Backend CI is red
because the U2 filter change was not re-synced. After V1, `phase-3` is ready to merge.
Production deploy waits for the author's go-ahead.

## Phase 3 gate (HANDOFF §6), final

| Gate item | Status |
|---|---|
| CUJ suite green on Chromium and WebKit, incl. CUJ 2 < 60 s | **Pass.** **Chromium 5/5, WebKit 5/5**, real staging logins. The U1 fix holds (it failed 1/5 before). |
| Every shipped explanation `reviewed` | **Pass.** 33/33. The shipped cache is byte-identical in both repos (SHA-256 prefix `e1ffa448f3791b23`). In the app, offline, "Explain more simply" for heart rate shows the reviewed text, the NEWS2 citation and the AI label. |
| Filter cases green | **Pass** in the backend core tests (11 eval cases plus the U2 test). |
| Staging load test, 1,260 rows | **Pass** (phase3d). |

## Verified this round

| Item | Evidence |
|---|---|
| S1 | The test waits until `outbox_failures` is `"1"` before overriding. Frontend unit 80/80 on 5 of 5 auditor runs (builder: 10 of 10). |
| S2 | `WaitingBanner` on the home screen; session-aware shared text; `onSynced` + `visibilitychange`; 3 render tests. |
| U1 | CUJ waits for the new result URL before the offline reload; WebKit 5/5. |
| U2 | At most 3 words between a phrase's words, within one sentence; unit test. |
| Other suites | `offline-form`, `offline-sync`: pass on both browsers. Offline suite 4/4. |
| Build | Frontend typecheck clean, lint 0 errors. The staging build has no production URL. |
| Authorship | All commits by `ariandesu`; no AI co-author lines. |

## Findings

### V1 — High (blocks merge) — `core/` out of sync; backend CI red

*   Backend `npm test`: **1 failed / 89**, in `core-checksum.test.ts`.
    `core/explain/filters.ts` hashes to `a5bcc0cb…`, but `core.sha256` lists `dfb5faf4…`.
    It fails every run.
*   **GitHub Actions:** backend `phase-3` at `0113d93` = **failure**.
*   The frontend's `core/explain/filters.ts` is the **pre-U2 version**, which matches the old
    checksum. So `filters.ts` was changed again after `sync-core` ran (the "retry later
    starts" fix) and never re-synced.
*   The builder's report said "backend 88 green". The suite has 89 tests and one failed.
*   Runtime impact is nil (the filter runs only in `pregenerate`). But the sync contract is
    broken, and the cross-repo check would pass the wrong file.
*   **Fix:**
    *   run `tools/sync-core.sh` from the backend, and commit `core/` in **both** repos;
    *   check that `core/` is byte-identical in both repos, e.g.
        `diff -r starplus-backend/core starplus-frontend/core`;
    *   confirm CI is green on `phase-3` in both repos, and paste the run links in the
        report.

### V2 — Info

*   `audit-2026-11-08-phase3i.md` was not copied into `starplus-backend/docs/audits/`. The
    report said phase3h was copied; phase3j and the review were.
*   The frontend commit `4ed649d` is titled "T1-T3" but holds S1, S2 and U1. Name the next
    commit after what it holds.
*   The catalog's label for temperature is "Core body temperature". The round-1 rejection
    of "core" was stricter than it needed to be. The round-2 text is faithful either way;
    nothing to do.
*   Staging codes used this run: 16 synthetic `stg-astro-1` codes. The author's two codes
    are still unused.

## Next

1.  **Builder:**
    *   fix V1;
    *   copy `audit-2026-11-08-phase3i.md` and this audit into the backend's
        `docs/audits/`;
    *   report the CI run links; commit, push, do not merge, stop.
2.  **Auditor:** confirm CI green and `core/` identical in both repos.
3.  **Author's go-ahead, then merge and deploy:**
    *   backend: back up production D1; apply any new migrations to staging, then
        production; `wrangler deploy` (staging, then production);
    *   frontend: merge `phase-3` → `main` (Vercel builds);
    *   smoke test: `/api/health`, the home page, one real crew login and self-check on
        production, and "Explain more simply" showing the AI label.

    That ends the minimum version.

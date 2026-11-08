# Audit: Phase 3 gate rerun (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `547d303`, frontend `phase-3` `f0c3747`
**Verdict:** **Still not passing.** K2–K5 are fixed. **K1 is not**: its test checks the wrong
thing. A new Medium bug (L2) appeared in the server's duplicate handling. Do not merge.

## Verified fixed

| Item | Evidence (auditor's run) |
|---|---|
| K2 number filter | Rejects "400", "15", "3", "92.5", "2 mg" when absent from the source; passes "92 to 93 percent… 91 or below"; no longer flags "symptoms", "today" or "abnormal"; still flags "This is normal." |
| K3 load tool | `--name value` and `--name=value` both work; rows map into the past; `by_reason` reported; `--person` added; **0 rejected** of 1,260 |
| K4 gate docs | Corrected |
| K5 demo pause | "Sending paused in demo mode" on the reports screen; test added |
| K6 | Unused prompt removed |
| Checks | Backend 87 tests, citations ok, typecheck and lint clean. Frontend 53 tests, typecheck and lint clean, staging build ok. CI green |

## Findings

### L1 — High — K1 still fails in real use; the offline test is misleading

*   **CUJ suite against staging:** Chromium and WebKit **both fail** at the offline reload of
    `/result?crew=stg-astro-1&result=<id>`. WebKit's error: `no-response` from the service
    worker. CUJ 1 and CUJ 8 pass on both browsers.
*   **Auditor's probe:**

    | Navigation | Result |
    |---|---|
    | `/result` offline, never visited | 200 |
    | `/check?crew=x`, `/result?id=abc`, `/result?crew=a&result=b`, `/reports?crew=x` offline, never visited | all **fail** |
    | Same address visited online first (a full page load), then reloaded offline | works |

*   **Why:** the new handler in `src/app/sw.ts` only looks in its own `documents` cache,
    which holds only documents fetched through that handler during a full online load. The
    documents precached at install sit in Serwist's precache under their plain paths, and
    nothing looks them up for a query-string address. In the real flow, `/result?...` is
    reached by an in-app navigation, so it is never fetched as a document and never cached.
*   `offline-routes.spec.ts` passes because it loads every address online before going
    offline. It does not test the failing case.
*   **Fix:**
    *   Serve navigations from the precache by path. Either set
        `precacheOptions: { ignoreURLParametersMatching: [/.*/] }` in the `Serwist`
        constructor, or in the handler fall back to `serwist.matchPrecache(url.pathname)`
        before failing. Make sure the custom navigation route is registered **before**
        `defaultCache`'s routes, or is part of `runtimeCaching` ahead of them.
    *   Rewrite the offline test:
        *   Install the service worker from `/` only.
        *   Go offline, then load each route **with a query it has never seen**.
        *   Also cover the in-app path: navigate client-side to `/result?...`, go offline,
            reload.

### L2 — Medium — A duplicate `client_id` from another crew member is silently accepted

*   **Evidence:** the load test into the new crew member `stg-load-1` returned 720
    `duplicates` and 540 accepted. The tool derives each `client_id` from the person and row
    number, not the crew, so it reproduced the IDs of the 720 rows loaded earlier under
    `stg-astro-2`. The server's `ON CONFLICT(client_id) DO NOTHING` treats a row owned by a
    **different** crew member as a duplicate. The new rows are dropped, and the client is
    told they are stored.
*   **Fix:**
    *   Server: on conflict, check the existing row's `crew_id`. If it differs, reject the
        item with a new reason `client_id_conflict`. Add a route test.
    *   Tool: include the crew ID in the seed for `client_id`.

### L3 — Info — Staging data state

*   `stg-astro-2`: the 720 load-test rows were deleted on staging by the auditor with the
    author's OK (2026-11-08; 720 changes, 0 rows remain). Production untouched.
*   `stg-load-1` (created by the auditor, synthetic): 540 rows from this run.
*   Codes left (unused): `stg-astro-1` ×1, `stg-fmo-1` ×1, `stg-load-1` ×0. More can be
    issued for the rerun.

## Next

Fix L1 and L2, then stop. The auditor reruns the CUJ suite on both browsers and the load test.

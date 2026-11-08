# Audit: Phase 3 gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-3` `d69bf38`, frontend `phase-3` `e63bcec`
**Verdict:** **Phase 3 does not pass its gate yet.** The work is broad and mostly sound, but
two High defects (K1, K2) break core promises: the offline self-check, and the LLM safety
filter. Fix K1–K4, then rerun. Do not merge `phase-3`.

## Verified

| Check | Result |
|---|---|
| H1 staging CORS | Live: staging allows `http://localhost:3100`; production does not; a foreign origin is refused on both |
| Auditor's run | Backend 86 tests, citations ok, typecheck and lint clean. Frontend 52 tests, typecheck and lint clean, build against staging succeeds |
| CI on `phase-3` | Green in both repos; commits by `ariandesu`, no AI lines |
| Deviation log | Auth `provenance` addition and the `pregenerate` env-key change recorded |
| Demo isolation | Demo crew in its own store; outbox does not send while demo mode is on |
| Surgeon view | Client gate on role; server enforces it too (403 for astronauts, verified in Phase 2) |
| **CUJ suite, Chromium, real staging login** | CUJ 1 (offline emergency) **pass**; CUJ 8 (demo mode) **pass**; CUJ 2–5 **fail** (K1) |
| **Staging load test, 1,260 rows** | Ran in 2 s; **720 accepted, 540 rejected** (K3) |
| WebKit | Not run; blocked by K1 |
| Explanations | Not generated yet (needs the Meta key and a review) |

## Findings

### K1 — High — Pages with a query string do not load offline

The auditor's probe, after the service worker was installed:

| Address, offline | Result |
|---|---|
| `/emergency` | 200 |
| `/check` | 200 |
| `/check?crew=x` | **fails** |
| `/result` | **fails** |
| `/result?id=abc` | **fails** |
| `/reports?crew=x` | **fails** |

The app opens these addresses itself during a self-check, so CUJs 2, 4 and 5 do not work
offline. That breaks Goal 4. The CUJ suite failed at exactly this point (`page.reload`
offline on the result page).

**Fix:**
*   Precache every app route, including `/result`.
*   Match navigations by path, ignoring the query string (Serwist precache `ignoreSearch`,
    or a navigation route that serves the cached document for the path).
*   Add an offline test that loads each route, with and without a query string, after the
    service worker is installed.

### K2 — High — The LLM output filter lets invented numbers through

`filterExplanation` rejects digits only when the source has no digits at all. Almost every
entry has numbers, so invented numbers pass. Probe against the SpO2 entry:

*   "Take 400 more readings at 15 percent." passed.
*   "A low reading 3 times means you should rest." passed.

It also matches words inside other words: "symptoms" is flagged for `ms`, "today" for
`day`, and "abnormal" for "normal".

**Fix:**
*   Extract every number in the output (integers, decimals, ranges) and reject any that
    does not appear in the source.
*   Match unit, dose, route, time and softening words on word boundaries.
*   Add these probe sentences to `tools/eval/cases.json` as must-reject or must-pass cases.

Do not run `pregenerate` until this is fixed.

### K3 — Medium — The load tool loses rows and pollutes a demo crew member

*   540 of 1,260 rows were rejected. These are most likely the in-flight and post-flight rows:
    the phase-day mapping seems to put them in the future, and the server rejects future
    timestamps. The tool also never prints why rows were rejected.
*   The documented command loads 180 synthetic people's rows into one test astronaut. The
    auditor's run did this to `stg-astro-2`, which now holds 720 heart-rate readings from
    180 different synthetic people. That baseline is meaningless for demo recording.

**Fix:**
*   Map every row into the past, ending at "now".
*   Print rejection counts by reason.
*   Load into a dedicated crew member (`stg-load-1`, synthetic) created by the author.
*   For the demo crew, load one person's history only: `--person=<id>`.
*   Clean `stg-astro-2`: a staging-only `DELETE FROM measurements WHERE crew_id =
    'stg-astro-2'`, run by the author or the builder with the author's OK.

### K4 — Medium — Gate commands in the progress report are wrong

*   The CUJ command sets `NEXT_PUBLIC_API_BASE` to the **production** URL while using a
    **staging** code, so it can never log in.
*   The load-test command uses `--name value`, but the tool only accepts `--name=value`.
*   Each Playwright project (Chromium, WebKit) needs its own single-use code. Say so.

Correct the report, and make the tool accept both argument forms.

### K5 — Low — Demo mode pauses real deliveries

The `demo_mode` flag is device-wide, so real queued reports stop sending while demo mode is
on. Make sure leaving demo mode clears the flag. Show "sending paused in demo mode" on the
reports screen. Add a test.

### K6 — Info

*   `tools/prompts/result-template.md` is not used by `pregenerate`. Either wire it in, or
    remove it and document where the result explanations come from.
*   Codes left (unused): `stg-astro-1` ×3, `stg-fmo-1` ×1, `stg-astro-2` ×0. The auditor
    issued three extra synthetic staging codes for this run.

## After K1–K4

1.  The auditor reruns the CUJ suite on Chromium and WebKit against staging, and reruns the
    load test into `stg-load-1`.
2.  Explanations: after K2, run `pregenerate` with the author's key, then review. This is
    the author's step, or the auditor's on the author's instruction.
3.  Merge, deploy staging then production, smoke-test. That ends the minimum version.

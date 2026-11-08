# Audit: Phase 2 gate (2026-11-08)

**Auditor:** Claude · **Branches:** backend `phase-2` `f83fba3`, frontend `phase-2` `aba9132`
**Verdict:** **Phase 2 passes its gate — approved to merge.** Two medium items (G1, G2)
go into Phase 3, not before the merge.

## Verified

| Check | Result |
|---|---|
| C1 microgravity first aid | In-flight variants for CPR, unresponsive, fainting and anaphylaxis: restraint on a rigid surface, Evetts-Russomano or handstand compressions, no recovery position or leg raise; partial-gravity note. Cited to Rehnberg et al. 2014 (DOI 10.3357/asem.3854.2014) and Hinkelbein et al. 2020 (DOI 10.1186/s13049-020-00793-y) |
| C2 dosing | Generated epinephrine timing removed ("only as directed by the crew medical officer or mission protocol"); dose-pattern test in place |
| C3 citations | Structured `{title, publisher, year, url}` (e.g. 2020 AHA Part 3, DOI 10.1161/CIR.0000000000000916; Red Cross manual 2016); "look, listen and feel" replaced |
| S1, S2, W1 | Builder-reported and covered by tests; CI on `phase-2` green with the branch-aware core check |
| Auditor's run | Backend: typecheck and lint clean, 79 tests, citation check "ok". Frontend: typecheck and lint clean, 52 tests, `next build --webpack` succeeds |
| Commits | `ariandesu`, no AI lines |
| **Live gate on staging** (auditor ran it with the codes; codes never left the author's machine) | 4/4 pass: astronaut login with `shared: true` gives about a 24-hour session; a batch is accepted and syncs back; an emergency report is delivered; the flight medical officer logs in and sees it |

Used codes were removed from `.secrets/staging-access-codes.txt`. One unused code remains
each for `stg-astro-1`, `stg-astro-2` and `stg-fmo-1`.

## Findings (fix in Phase 3)

### G1 — Medium — The live gate tests the API, not the app's outbox

`gate-live.spec.ts` posts to the API directly. It proves the server path but not that the
app's outbox delivers, which was the gate's intent ("outbox delivers to staging").
**Fix in Phase 3:** the Playwright CUJ suite (item 68) must drive the real screens against
staging: log in through `/login`, complete `/check`, go offline, queue a report from
`/emergency`, come back online, and assert the reports screen shows "delivered". Use
`crypto.randomUUID()` rather than fixed IDs, so reruns don't collide with earlier data.

### G2 — Medium — Provenance is not checked against the crew member

The gate filed a `provenance: real` measurement under the synthetic crew member
`stg-astro-1`, and the server accepted it. The design (rule 6) requires synthetic data never
to mix with real records.
**Fix:** batch ingest rejects an item whose provenance does not match its crew member's
(new reject reason `provenance_mismatch`: synthetic crew accept only `synthetic` or
`simulated_device`; real crew accept `real` or `simulated_device`). Add a route test.
Delete the gate's stray `real` row on staging, or leave it; it is staging only.

### G3 — Low — Confirm the in-flight CPR screen keeps rate and depth

The in-flight CPR variant text does not repeat "100 to 120 per minute, 5 to 6 cm". The
Hinkelbein guideline keeps the same targets. Confirm the emergency screen shows the in-flight
block **together with** the Earth compression targets, or add them to the variant.

### G4 — Info

`next build` warns that it ignored a stray `package-lock.json` in the author's home
folder (`/Users/mahirfaisal/package-lock.json`). Harmless; the author can delete that
file.

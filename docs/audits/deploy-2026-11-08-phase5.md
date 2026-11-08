# Deploy record: Phase 5 to production (2026-11-08)

**Approved by:** the author ("yes deploy but without claude as coauthor"). **Performed
by:** the auditor. **Result:** **live and smoke-tested.**

## What was done

| Step | Detail |
|---|---|
| Pre-checks | CI success on both `phase-5` heads (backend `ba03321`, frontend `95c149f`). |
| Authorship | Both merges were **fast-forwards**, with no merge commit. All 9 Phase 5 commits are by `ariandesu` (some with the GitHub no-reply address), with no Claude or co-author lines. |
| Backup | Production D1 exported to `Starplus v2/backups/prod-d1-2026-11-08-pre-phase5.sql`. |
| Migrations | None pending (0001–0003 applied). |
| Backend | `main` fast-forwarded to `ba03321`. Staging deployed (`640f0742`), health ok, `/api/crew/progress` → 0% (all staging crew are synthetic, correctly excluded). **Production deployed (`cfd33b7a`)**, health ok. CORS allows the live site only. **Rollback target: `a9e528fc`.** |
| Frontend | `main` fast-forwarded to `95c149f`; Vercel production build done. `/check/bluetooth`, `/check/voice`, `/progress`, `/medicines` return 200 and are in the production service worker's precache. |

## Production smoke test (Chromium, live site, crew `smoke-prod-1`, synthetic)

1.  Login with a new single-use code: ok.
2.  "Other ways" shows "Connect a Bluetooth device" and "Speak a reading".
3.  Bluetooth **Simulator** → 120/80 → "Your result".
4.  Voice (fake speech engine saying "blood pressure one thirty five over eighty five") →
    preview **135 / 85** → saved → "Your result".
5.  The outbox emptied by itself. In production D1:
    *   BLE 120/80, provenance `simulated_device`;
    *   voice 135/85, provenance `synthetic` (the crew member's own).
6.  `/progress`: 0/4 today and 0% crew progress. Correct: the test crew member is synthetic
    and earns nothing, and production has no real crew yet. `GET /api/crew/progress` 200.
7.  `/medicines` shows the cited formulary with "per flight surgeon / mission protocol".

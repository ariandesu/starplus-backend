# Deploy record: Phase 4 to production (2026-11-08)

**Approved by:** the author ("yes deploy", with no Claude co-author). **Performed by:** the
auditor. **Result:** **live and smoke-tested.**

## What was done

| Step | Detail |
|---|---|
| Pre-checks | CI success on both `phase-4` heads (backend `6fbcdfd`, frontend `2e1fee1`). |
| Authorship | Both merges were **fast-forwards**, with no merge commit. All 6 Phase 4 commits are by `ariandesu`, with no Claude or co-author lines. |
| Backup | Production D1 exported to `Starplus v2/backups/prod-d1-2026-11-08-pre-phase4.sql`. |
| Migrations | None pending. |
| Backend | `main` fast-forwarded to `6fbcdfd` and pushed. Phase 4 changed **only docs** in the backend (audits, progress report), so the Worker was **not redeployed**. Production stays on version `a9e528fc` (Phase 3), health ok. |
| Frontend | `main` fast-forwarded to `2e1fee1` and pushed; the Vercel production build completed. `/check/questionnaire`, `/check/reaction`, `/import` and `/body` return 200 and are in the production service worker's precache. |

## Production smoke test (Chromium, live site, crew `smoke-prod-1`, synthetic)

1.  Login with a new single-use code: ok.
2.  The self-check page shows the "Other ways" links (questionnaire, import).
3.  Questionnaire (sleep 7 h, mood 60, stress 40, sleep quality 70) → "Your result".
4.  Reaction test (random delay, 1 practice + 5 taps) → median → "Your result".
5.  CSV import of 2 rows: preview **1 accepted, 1 rejected `out_of_bounds`** (heart rate
    999) → "Imported 1 reading".
6.  The outbox emptied by itself (`/api/measurements/batch` 200).
7.  `/body` shows the body map, and Body is in the navigation.

Production D1 for `smoke-prod-1` now holds:
*   `questionnaire`: mood, sleep hours, sleep quality, stress (1 each);
*   `test`: reaction time ×1;
*   `import`: heart rate ×1;
*   `manual`: heart rate ×1 (from Phase 3).

All synthetic.

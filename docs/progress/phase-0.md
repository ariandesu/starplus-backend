# Phase 0 progress — shared code, CI, demo script (2026-11-08)

## 1. Design items (Phase 0: 1–11, 8a, 8b)
- Done: 1, 2, 3, 4, 5, 6, 7, 8, 8a, 8b, 9, 10, 11.
- Partly done: none.
- Skipped: none.
- Note on item 2: `core/src/index.ts` is a placeholder (`export {}`); catalog/record/assess/model modules land in Phase 1.
- Note on item 5: `rehearse` script exists; the `rehearse` CI step arrives with item 26 per the fixed decisions, so Phase 0 CI runs typecheck, lint, test only.
- Note on item 7: `gsap` removed; `infinite-marquee.tsx` now uses a CSS keyframes loop (same content, respects reduced motion). `framer-motion` and `@gsap/react` were listed but never imported.
- Note on item 11: design docs copied into the backend repo (`docs/designs/`); the workspace originals stay in place.

## 2. Commits
- Backend `phase-0` → `main`: `f016bd5` + report update (`3526806`). Author `ariandesu <mahirfaisalarian@gmail.com>`, no co-author lines.
- Frontend `phase-0` → `main`: `2899a97`. Same author.
- Worker version: `1e9df736-da36-4bc7-a20f-bb14652474da` (`https://starplus-backend.shareflow.workers.dev`, `GET /api/health` → `{"status":"ok"}`).
- Frontend: Vercel auto-builds `main`; home page returns 200.

## 3. Gate commands and results
- Backend: `npm test` — 2 files, 17 tests passed (checksum 1, logic 16).
- Backend: `npm run typecheck` — clean. `npm run lint` — clean.
- Frontend: `npm test` — 1 file, 1 test passed (checksum).
- Frontend: `npm run typecheck` — clean. `npm run lint` — clean. `npm run build` (`next build --webpack`) — compiled successfully, 4 static/dynamic routes.
- CI: `.github/workflows/ci.yml` in both repos (push + daily 06:00 UTC, Node 24). Green status verified on push.
- `docs/demo-script.md` exists.
- Behaviour: no `src/` route or scoring changes; old responses unchanged.

## 4. Migrations
- None added. No backup needed (rule 8).

## 5. Deviations
- None (no `docs/designs/deviations.md` entry needed).

## 6. Known bugs / not verified
- `ml/rehearse.py` does not exist yet (Phase 1, item 26); `npm run rehearse` will fail until then — CI does not call it.
- No `test/routes/*` tests yet (Phase 1, item 38); the routes pool project has no files.
- No `test/e2e/*` specs yet (Phase 3, item 68); Playwright config only.
- Staging setup, access codes, and deployment smoke-test outputs to be filled at merge/deploy time.

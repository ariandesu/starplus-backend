import type { Env } from "./env.ts";
import { json } from "./http.ts";
import { requireSession, sessionError } from "./auth.ts";

export const PROGRESS_WINDOW_DAYS = 7;

export async function handleCrewProgress(
  request: Request,
  env: Env,
  requestId: string
): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut", "flight_medical_officer"]);
  if (!session.ok) return sessionError(session, request, requestId);

  const today = new Date().toISOString().slice(0, 10);
  const windowStart = new Date(Date.parse(`${today}T00:00:00Z`) - (PROGRESS_WINDOW_DAYS - 1) * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const latest = (await env.DB.prepare(
    `SELECT r.crew_id, r.overall_status FROM results r
     JOIN crew c ON c.id = r.crew_id
     WHERE c.provenance = ? AND c.role = 'astronaut'
       AND r.client_id = (
         SELECT r2.client_id FROM results r2
         WHERE r2.crew_id = r.crew_id
         ORDER BY r2.assessed_at DESC, r2.client_id DESC
         LIMIT 1
       )`
  ).bind(session.demo ? "synthetic" : "real").all<{ crew_id: string; overall_status: string }>()).results;

  const fractions: number[] = [];
  for (const row of latest) {
    if (row.overall_status === "watch" || row.overall_status === "critical") continue;
    const active = (await env.DB.prepare(
      `SELECT COUNT(DISTINCT substr(assessed_at, 1, 10)) AS days FROM results
       WHERE crew_id = ? AND substr(assessed_at, 1, 10) >= ? AND substr(assessed_at, 1, 10) <= ?`
    )
      .bind(row.crew_id, windowStart, today)
      .first<{ days: number }>());
    fractions.push(Math.min(active?.days ?? 0, PROGRESS_WINDOW_DAYS) / PROGRESS_WINDOW_DAYS);
  }

  const readiness_pct =
    fractions.length === 0
      ? 0
      : Math.round((fractions.reduce((sum, fraction) => sum + fraction, 0) / fractions.length) * 1000) /
        10;
  return json({ window_days: PROGRESS_WINDOW_DAYS, readiness_pct }, request, requestId);
}

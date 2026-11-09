import type { Env } from "./env.ts";
import { error, json } from "./http.ts";
import { requireSession, sessionError } from "./auth.ts";

const CREW_ROLES = ["flight_medical_officer", "mission_control"];

async function fencedCrewIds(env: Env, demo: boolean): Promise<Array<{ id: string; name: string }>> {
  const { results } = await env.DB.prepare(
    "SELECT id, name FROM crew WHERE role = 'astronaut' AND provenance = ? ORDER BY id ASC"
  )
    .bind(demo ? "synthetic" : "real")
    .all<{ id: string; name: string }>();
  return results;
}

async function demoSubjectOk(env: Env, crew_id: string): Promise<boolean> {
  const subject = await env.DB.prepare("SELECT provenance FROM crew WHERE id = ?")
    .bind(crew_id)
    .first<{ provenance: string }>();
  return !!subject && subject.provenance === "synthetic";
}

export async function handleCrewResults(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const session = await requireSession(request, env, CREW_ROLES);
  if (!session.ok) return sessionError(session, request, requestId);
  const crew_id = url.searchParams.get("crew_id");
  if (!crew_id) return error(400, "crew_id is required", request, requestId);
  if (session.demo && !(await demoSubjectOk(env, crew_id))) {
    return json({ results: [], cursor: null }, request, requestId);
  }
  const since = url.searchParams.get("since");
  const pipe = since?.indexOf("|") ?? -1;
  const sinceReceived = pipe === -1 ? (since ?? "") : since!.slice(0, pipe);
  const sinceClient = pipe === -1 ? "" : since!.slice(pipe + 1);
  const { results } = await env.DB.prepare(
    `SELECT * FROM results WHERE crew_id = ?
     AND ((received_at > ?) OR (received_at = ? AND client_id > ?))
     ORDER BY received_at ASC, client_id ASC LIMIT 500`
  )
    .bind(crew_id, sinceReceived, sinceReceived, sinceClient)
    .all();
  const rows = results as Array<{ received_at: string; client_id: string }>;
  const head = rows.length > 0 ? rows[rows.length - 1] : null;
  return json(
    { results, cursor: head ? `${head.received_at}|${head.client_id}` : null },
    request,
    requestId
  );
}

export async function handleCrewMeasurements(
  request: Request,
  env: Env,
  requestId: string,
  url: URL
): Promise<Response> {
  const session = await requireSession(request, env, CREW_ROLES);
  if (!session.ok) return sessionError(session, request, requestId);
  const crew_id = url.searchParams.get("crew_id");
  if (!crew_id) return error(400, "crew_id is required", request, requestId);
  if (session.demo && !(await demoSubjectOk(env, crew_id))) {
    return json({ measurements: [], cursor: null }, request, requestId);
  }
  const since = url.searchParams.get("since");
  const pipe = since?.indexOf("|") ?? -1;
  const sinceReceived = pipe === -1 ? (since ?? "") : since!.slice(0, pipe);
  const sinceClient = pipe === -1 ? "" : since!.slice(pipe + 1);
  const { results } = await env.DB.prepare(
    `SELECT * FROM measurements WHERE crew_id = ?
     AND ((received_at > ?) OR (received_at = ? AND client_id > ?))
     ORDER BY received_at ASC, client_id ASC LIMIT 500`
  )
    .bind(crew_id, sinceReceived, sinceReceived, sinceClient)
    .all();
  const rows = results as Array<{ received_at: string; client_id: string }>;
  const head = rows.length > 0 ? rows[rows.length - 1] : null;
  return json(
    { measurements: results, cursor: head ? `${head.received_at}|${head.client_id}` : null },
    request,
    requestId
  );
}

interface RosterVital {
  metric: string;
  value: number | string | null;
  unit: string;
  status: string;
}

export interface RosterRow {
  crew_id: string;
  name: string;
  overall_status: string | null;
  last_check_in: string | null;
  checkin_days_7d: number;
  open_reports: number;
  vitals: RosterVital[];
}

function statusRank(status: string | null): number {
  if (status === "critical") return 0;
  if (status === "watch") return 1;
  return 2;
}

export async function handleCrewRoster(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, CREW_ROLES);
  if (!session.ok) return sessionError(session, request, requestId);
  const crews = await fencedCrewIds(env, session.demo);
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const rows: RosterRow[] = [];
  for (const crew of crews) {
    const latest = await env.DB.prepare(
      "SELECT overall_status, assessed_at, per_measure_json FROM results WHERE crew_id = ? ORDER BY assessed_at DESC, client_id DESC LIMIT 1"
    )
      .bind(crew.id)
      .first<{ overall_status: string; assessed_at: string; per_measure_json: string }>();
    const days = await env.DB.prepare(
      "SELECT COUNT(DISTINCT substr(assessed_at, 1, 10)) AS days FROM results WHERE crew_id = ? AND assessed_at >= ?"
    )
      .bind(crew.id, cutoff)
      .first<{ days: number }>();
    const open = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM reports WHERE submitted_by = ? AND status = 'delivered'"
    )
      .bind(crew.id)
      .first<{ n: number }>();
    let vitals: RosterVital[] = [];
    if (latest) {
      try {
        const entries = JSON.parse(latest.per_measure_json) as Array<{
          metric: string;
          status: string;
          values: { value: number | string | null; unit: string };
        }>;
        vitals = entries.map((entry) => ({
          metric: entry.metric,
          value: entry.values.value,
          unit: entry.values.unit,
          status: entry.status,
        }));
      } catch {
        vitals = [];
      }
    }
    rows.push({
      crew_id: crew.id,
      name: crew.name,
      overall_status: latest?.overall_status ?? null,
      last_check_in: latest?.assessed_at ?? null,
      checkin_days_7d: days?.days ?? 0,
      open_reports: open?.n ?? 0,
      vitals,
    });
  }
  rows.sort((a, b) => {
    const rank = statusRank(a.overall_status) - statusRank(b.overall_status);
    if (rank !== 0) return rank;
    if (!a.last_check_in && !b.last_check_in) return a.crew_id < b.crew_id ? -1 : 1;
    if (!a.last_check_in) return 1;
    if (!b.last_check_in) return -1;
    if (a.last_check_in !== b.last_check_in) return a.last_check_in < b.last_check_in ? -1 : 1;
    return a.crew_id < b.crew_id ? -1 : 1;
  });
  return json({ crew: rows }, request, requestId);
}

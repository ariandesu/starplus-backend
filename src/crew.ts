import type { Env } from "./env.ts";
import { error, json } from "./http.ts";
import { requireSession, sessionError } from "./auth.ts";

export async function handleCrewResults(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const session = await requireSession(request, env, ["flight_medical_officer"]);
  if (!session.ok) return sessionError(session, request, requestId);
  const crew_id = url.searchParams.get("crew_id");
  if (!crew_id) return error(400, "crew_id is required", request, requestId);
  if (session.demo) {
    const subject = await env.DB.prepare("SELECT provenance FROM crew WHERE id = ?")
      .bind(crew_id)
      .first<{ provenance: string }>();
    if (!subject || subject.provenance !== "synthetic") {
      return json({ results: [], cursor: null }, request, requestId);
    }
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

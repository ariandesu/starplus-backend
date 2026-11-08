import { isUUID } from "@starplus/core";
import type { Env } from "./env.ts";
import { error, json } from "./http.ts";
import { requireSession, sessionError } from "./auth.ts";

export const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024;

const REPORT_COLUMNS = [
  "client_id",
  "device_id",
  "submitted_by",
  "subject_crew_id",
  "subject_label",
  "kind",
  "created_at",
  "received_at",
  "payload_json",
  "summary_text",
  "summary_edited",
  "status",
  "acknowledged_by",
  "acknowledged_at",
];

export async function handlePostReport(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut", "flight_medical_officer", "mission_control"]);
  if (!session.ok) return sessionError(session, request, requestId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  if (typeof body !== "object" || body === null) {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  const item = body as Record<string, unknown>;
  if (!isUUID(item.client_id)) return error(400, "Invalid report", request, requestId);
  if (typeof item.device_id !== "string" || item.device_id.length === 0) {
    return error(400, "Invalid report", request, requestId);
  }
  if (item.subject_crew_id !== null && item.subject_crew_id !== undefined && typeof item.subject_crew_id !== "string") {
    return error(400, "Invalid report", request, requestId);
  }
  if (item.subject_label !== null && item.subject_label !== undefined && typeof item.subject_label !== "string") {
    return error(400, "Invalid report", request, requestId);
  }
  if (item.kind !== "emergency" && item.kind !== "routine") {
    return error(400, "Invalid report", request, requestId);
  }
  if (typeof item.created_at !== "string" || Number.isNaN(Date.parse(item.created_at))) {
    return error(400, "Invalid report", request, requestId);
  }
  if (item.payload_json === undefined) return error(400, "Invalid report", request, requestId);
  if (item.summary_text !== null && item.summary_text !== undefined && typeof item.summary_text !== "string") {
    return error(400, "Invalid report", request, requestId);
  }
  const summary_edited = item.summary_edited ?? 0;
  if (summary_edited !== 0 && summary_edited !== 1) return error(400, "Invalid report", request, requestId);

  const now = new Date().toISOString();
  const row = {
    client_id: item.client_id,
    device_id: item.device_id,
    submitted_by: session.crew_id,
    subject_crew_id: item.subject_crew_id ?? null,
    subject_label: item.subject_label ?? null,
    kind: item.kind,
    created_at: item.created_at,
    received_at: now,
    payload_json: typeof item.payload_json === "string" ? item.payload_json : JSON.stringify(item.payload_json),
    summary_text: item.summary_text ?? null,
    summary_edited,
    status: "delivered",
    acknowledged_by: null,
    acknowledged_at: null,
  };
  const inserted = await env.DB.prepare(
    `INSERT INTO reports (${REPORT_COLUMNS.join(", ")}) VALUES (${REPORT_COLUMNS.map(() => "?").join(", ")})
     ON CONFLICT(client_id) DO NOTHING RETURNING client_id`
  )
    .bind(...REPORT_COLUMNS.map((column) => (row as Record<string, unknown>)[column] ?? null))
    .run();
  const existing = await env.DB.prepare("SELECT * FROM reports WHERE client_id = ?").bind(item.client_id).first();
  return json({ report: existing, duplicate: inserted.meta.changes === 0 }, request, requestId, inserted.meta.changes === 0 ? 200 : 201);
}

export async function handleGetReports(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const session = await requireSession(request, env, ["flight_medical_officer", "mission_control"]);
  if (!session.ok) return sessionError(session, request, requestId);
  const since = url.searchParams.get("since");
  const { results } = since
    ? await env.DB.prepare("SELECT * FROM reports WHERE received_at > ? ORDER BY received_at ASC, client_id ASC LIMIT 500")
        .bind(since)
        .all()
    : await env.DB.prepare("SELECT * FROM reports ORDER BY received_at ASC, client_id ASC LIMIT 500").all();
  return json({ reports: results }, request, requestId);
}

export async function handleAckReport(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, ["flight_medical_officer"]);
  if (!session.ok) return sessionError(session, request, requestId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  const client_id = (body as Record<string, unknown> | null)?.client_id;
  if (typeof client_id !== "string") return error(400, "client_id is required", request, requestId);
  const now = new Date().toISOString();
  const updated = await env.DB.prepare(
    "UPDATE reports SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ? WHERE client_id = ?"
  )
    .bind(session.crew_id, now, client_id)
    .run();
  if (updated.meta.changes === 0) return error(404, "Unknown report", request, requestId);
  return json({ acknowledged: client_id }, request, requestId);
}

export async function handlePostAttachment(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut", "flight_medical_officer", "mission_control"]);
  if (!session.ok) return sessionError(session, request, requestId);
  if (!env.ATTACHMENTS) return error(503, "Attachments unavailable", request, requestId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  const item = (body as Record<string, unknown> | null) ?? {};
  if (!isUUID(item.id)) return error(400, "Invalid attachment", request, requestId);
  if (typeof item.report_client_id !== "string" || !isUUID(item.report_client_id)) {
    return error(400, "Invalid attachment", request, requestId);
  }
  if (typeof item.content_type !== "string" || !item.content_type.startsWith("image/")) {
    return error(400, "Invalid attachment", request, requestId);
  }
  if (typeof item.data_base64 !== "string" || item.data_base64.length === 0) {
    return error(400, "Invalid attachment", request, requestId);
  }
  let bytes: Uint8Array;
  try {
    const binary = atob(item.data_base64);
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return error(400, "Invalid attachment", request, requestId);
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return error(413, "Attachment exceeds 2 MB", request, requestId);
  await env.ATTACHMENTS.put(`attachments/${item.id}`, bytes, {
    httpMetadata: { contentType: item.content_type },
    customMetadata: { submitted_by: session.crew_id, report_client_id: item.report_client_id },
  });
  return json({ id: item.id, size: bytes.byteLength }, request, requestId, 201);
}

export async function handleGetAttachment(
  request: Request,
  env: Env,
  requestId: string,
  id: string
): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut", "flight_medical_officer", "mission_control"]);
  if (!session.ok) return sessionError(session, request, requestId);
  if (!env.ATTACHMENTS) return error(503, "Attachments unavailable", request, requestId);
  if (!isUUID(id)) return error(400, "Invalid attachment id", request, requestId);
  const object = await env.ATTACHMENTS.get(`attachments/${id}`);
  if (!object) return error(404, "Unknown attachment", request, requestId);
  const submittedBy = object.customMetadata?.submitted_by;
  if (submittedBy !== session.crew_id && session.role !== "flight_medical_officer") {
    return error(403, "Forbidden", request, requestId);
  }
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

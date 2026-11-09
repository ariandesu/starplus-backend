import { PROVENANCES, ROLES } from "@starplus/core";
import type { Env } from "./env.ts";
import { error, json, readJsonObject } from "./http.ts";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SESSION_TTL_MS = 30 * 24 * 3_600_000;
const SHARED_SESSION_TTL_MS = 24 * 3_600_000;

export type SessionCheck =
  | { ok: true; crew_id: string; role: string; demo: boolean; session_hash: string }
  | { ok: false; status: 401 | 403 };

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => CROCKFORD[byte % 32]).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function requireSession(
  request: Request,
  env: Env,
  roles: string[]
): Promise<SessionCheck> {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return { ok: false, status: 401 };
  const tokenHash = await sha256Hex(match[1]);
  const row = await env.DB.prepare(
    "SELECT crew_id, role, expires_at, revoked, demo FROM sessions WHERE token_hash = ?"
  )
    .bind(tokenHash)
    .first<{ crew_id: string; role: string; expires_at: string; revoked: number; demo: number }>();
  if (!row || row.revoked !== 0 || row.expires_at <= new Date().toISOString()) {
    return { ok: false, status: 401 };
  }
  if (!roles.includes(row.role)) return { ok: false, status: 403 };
  return { ok: true, crew_id: row.crew_id, role: row.role, demo: row.demo === 1, session_hash: tokenHash };
}

export function sessionError(check: { status: 401 | 403 }, request: Request, requestId: string): Response {
  return error(check.status, check.status === 401 ? "Unauthorized" : "Forbidden", request, requestId);
}

export async function handleAdminCrew(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = body?.role;
  const provenance = body?.provenance;
  if (id.length === 0 || name.length === 0 || !(ROLES as readonly string[]).includes(role as string) || !(PROVENANCES as readonly string[]).includes(provenance as string)) {
    return error(400, "Invalid crew member", request, requestId);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO crew (id, name, role, provenance, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, provenance = excluded.provenance`
  )
    .bind(id, name, role, provenance, now)
    .run();
  const crew = await env.DB.prepare("SELECT * FROM crew WHERE id = ?").bind(id).first();
  return json({ crew }, request, requestId, 201);
}

export async function handleAdminCodes(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const crew_id = body?.crew_id;
  if (typeof crew_id !== "string" || crew_id.length === 0) {
    return error(400, "crew_id is required", request, requestId);
  }
  const crew = await env.DB.prepare("SELECT id FROM crew WHERE id = ?").bind(crew_id).first();
  if (!crew) return error(404, `Unknown crew_id '${crew_id}'`, request, requestId);
  const code = randomCode();
  await env.DB.prepare("INSERT INTO access_codes (code_hash, crew_id, created_at, revoked) VALUES (?, ?, ?, 0)")
    .bind(await sha256Hex(code), crew_id, new Date().toISOString())
    .run();
  return json({ code }, request, requestId, 201);
}

export async function handleAdminRevoke(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const crew_id = body?.crew_id;
  if (typeof crew_id !== "string" || crew_id.length === 0) {
    return error(400, "crew_id is required", request, requestId);
  }
  const sessions = await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE crew_id = ? AND revoked = 0")
    .bind(crew_id)
    .run();
  const codes = await env.DB.prepare("UPDATE access_codes SET revoked = 1 WHERE crew_id = ? AND revoked = 0")
    .bind(crew_id)
    .run();
  return json(
    { revoked_sessions: sessions.meta.changes, revoked_codes: codes.meta.changes },
    request,
    requestId
  );
}

export async function handleAuth(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const code = body?.code;
  const device_id = body?.device_id;
  if (typeof code !== "string" || typeof device_id !== "string" || device_id.length === 0) {
    return error(401, "Unauthorized", request, requestId);
  }
  const row = await env.DB.prepare(
    "SELECT code_hash, crew_id, used_at, revoked FROM access_codes WHERE code_hash = ?"
  )
    .bind(await sha256Hex(code))
    .first<{ code_hash: string; crew_id: string; used_at: string | null; revoked: number }>();
  if (!row || row.revoked !== 0 || row.used_at !== null) {
    return error(401, "Unauthorized", request, requestId);
  }
  const crew = await env.DB.prepare("SELECT id, name, role, provenance FROM crew WHERE id = ?")
    .bind(row.crew_id)
    .first<{ id: string; name: string; role: string; provenance: string }>();
  if (!crew) return error(401, "Unauthorized", request, requestId);
  const token = randomToken();
  const now = new Date();
  const ttl = body !== null && body.shared === true ? SHARED_SESSION_TTL_MS : SESSION_TTL_MS;
  const expires_at = new Date(now.getTime() + ttl).toISOString();
  await env.DB.batch([
    env.DB.prepare("UPDATE access_codes SET used_at = ? WHERE code_hash = ?").bind(now.toISOString(), row.code_hash),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, crew_id, role, device_id, created_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, ?, 0)"
    ).bind(await sha256Hex(token), crew.id, crew.role, device_id, now.toISOString(), expires_at),
  ]);
  return json({ token, crew_id: crew.id, name: crew.name, role: crew.role, expires_at, provenance: crew.provenance }, request, requestId);
}

export const DEMO_CREW: Record<string, { id: string; role: string; name: string }> = {
  astronaut: { id: "demo-astronaut", role: "astronaut", name: "Demo astronaut" },
  surgeon: { id: "demo-surgeon", role: "flight_medical_officer", name: "Demo flight surgeon" },
};

const DEMO_SESSION_TTL_MS = 24 * 3_600_000;

export async function handleDemoAuth(request: Request, env: Env, requestId: string): Promise<Response> {
  if (env.DEMO_LOGIN !== "on") return error(404, "Not found", request, requestId);
  const body = await readJsonObject(request);
  const role = body?.role;
  const device_id = body?.device_id;
  if (role !== "astronaut" && role !== "flight_medical_officer") {
    return error(400, "Invalid role", request, requestId);
  }
  if (typeof device_id !== "string" || device_id.length === 0) {
    return error(400, "Invalid device", request, requestId);
  }
  const crew = role === "astronaut" ? DEMO_CREW.astronaut : DEMO_CREW.surgeon;
  const now = new Date();
  const expires_at = new Date(now.getTime() + DEMO_SESSION_TTL_MS).toISOString();
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO crew (id, name, role, provenance, created_at) VALUES (?, ?, ?, 'synthetic', ?)
       ON CONFLICT (id) DO NOTHING`
    ).bind(crew.id, crew.name, crew.role, now.toISOString()),
    env.DB.prepare(
      "INSERT INTO sessions (token_hash, crew_id, role, device_id, created_at, expires_at, revoked, demo) VALUES (?, ?, ?, ?, ?, ?, 0, 1)"
    ).bind(await sha256Hex(token), crew.id, crew.role, device_id, now.toISOString(), expires_at),
  ]);
  return json(
    { token, crew_id: crew.id, name: crew.name, role: crew.role, expires_at, provenance: "synthetic", demo: true },
    request,
    requestId
  );
}

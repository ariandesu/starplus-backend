import {
  handleAdminCodes,
  handleAdminCrew,
  handleAdminRevoke,
  handleAuth,
} from "./auth";
import { handleCrewResults } from "./crew";
import type { Env } from "./env";
import { checkAuth, error, json, preflight, readJsonObject } from "./http";
import { handleBatch, handleSync } from "./sync";
import { handleAckReport, handleGetReports, handlePostReport } from "./reports";
import { checkApiLimit, checkAuthLimit } from "./ratelimit";
import { parseLimit, validateAstronaut, validateId, validateVitals } from "./validate";
import { recomputeWatchSignals } from "./watch";

const VITALS_COLUMNS =
  "id, astronaut_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c, timestamp";

async function astronautExists(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM astronauts WHERE id = ?").bind(id).first()) !== null;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return preflight(request);

  // ---- Health ----
  if (path === "/api/health") {
    if (method !== "GET") return error(405, "Method not allowed", request, requestId);
    try {
      await env.DB.prepare("SELECT 1").first();
    } catch {
      return error(503, "D1 unavailable", request, requestId);
    }
    return json({ status: "ok", d1: "ok", service: "starplus-backend", environment: env.ENVIRONMENT }, request, requestId);
  }

  // ---- Admin ----
  if (path === "/api/admin/crew") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    const denied = checkAuth(request, env.API_KEY, requestId);
    if (denied) return denied;
    return handleAdminCrew(request, env, requestId);
  }
  if (path === "/api/admin/codes") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    const denied = checkAuth(request, env.API_KEY, requestId);
    if (denied) return denied;
    return handleAdminCodes(request, env, requestId);
  }
  if (path === "/api/admin/revoke") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    const denied = checkAuth(request, env.API_KEY, requestId);
    if (denied) return denied;
    return handleAdminRevoke(request, env, requestId);
  }
  if (path === "/api/auth") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkAuthLimit(request, env, requestId);
    if (limited) return limited;
    return handleAuth(request, env, requestId);
  }

  // ---- Self-check batch and sync ----
  if (path === "/api/measurements/batch") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    return handleBatch(request, env, requestId);
  }
  if (path === "/api/sync") {
    if (method !== "GET") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    return handleSync(request, env, requestId, url);
  }

  // ---- Reports ----
  if (path === "/api/reports") {
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    if (method === "POST") return handlePostReport(request, env, requestId);
    if (method === "GET") return handleGetReports(request, env, requestId, url);
    return error(405, "Method not allowed", request, requestId);
  }
  if (path === "/api/reports/ack") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    return handleAckReport(request, env, requestId);
  }

  // ---- Flight surgeon ----
  if (path === "/api/crew/results") {
    if (method !== "GET") return error(405, "Method not allowed", request, requestId);
    const limited = await checkApiLimit(request, env, requestId);
    if (limited) return limited;
    return handleCrewResults(request, env, requestId, url);
  }

  // ---- Astronauts ----
  if (path === "/api/astronauts") {
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM astronauts ORDER BY created_at ASC, id ASC").all();
      return json({ astronauts: results }, request, requestId);
    }
    if (method === "POST") {
      const denied = checkAuth(request, env.API_KEY, requestId);
      if (denied) return denied;
      const body = await readJsonObject(request);
      if (!body) return error(400, "Body must be a JSON object", request, requestId);
      const v = validateAstronaut(body);
      if (!v.ok) return error(400, "Invalid astronaut", request, requestId, v.errors);
      const a = v.value;
      // Upsert so a crew member's name, role or status can be updated by re-posting.
      await env.DB.prepare(
        `INSERT INTO astronauts (id, name, role, status) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, status = excluded.status`
      )
        .bind(a.id, a.name, a.role, a.status)
        .run();
      const row = await env.DB.prepare("SELECT * FROM astronauts WHERE id = ?").bind(a.id).first();
      return json({ astronaut: row }, request, requestId, 201);
    }
    return error(405, "Method not allowed", request, requestId);
  }

  // ---- Vitals ----
  if (path === "/api/vitals") {
    if (method === "GET") {
      const limit = parseLimit(url.searchParams.get("limit"), 50, 500);
      const filter = url.searchParams.get("astronaut_id");
      if (filter !== null) {
        const errs: string[] = [];
        if (!validateId(filter, "astronaut_id", errs)) return error(400, "Invalid query", request, requestId, errs);
      }
      const stmt = filter
        ? env.DB.prepare(
            `SELECT ${VITALS_COLUMNS} FROM vitals WHERE astronaut_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`
          ).bind(filter, limit)
        : env.DB.prepare(`SELECT ${VITALS_COLUMNS} FROM vitals ORDER BY timestamp DESC, id DESC LIMIT ?`).bind(limit);
      const { results } = await stmt.all();
      return json({ vitals: results }, request, requestId);
    }
    if (method === "POST") {
      const denied = checkAuth(request, env.API_KEY, requestId);
      if (denied) return denied;
      const body = await readJsonObject(request);
      if (!body) return error(400, "Body must be a JSON object", request, requestId);
      const v = validateVitals(body);
      if (!v.ok) return error(400, "Invalid vitals reading", request, requestId, v.errors);
      const r = v.value;
      if (!(await astronautExists(env.DB, r.astronaut_id)))
        return error(404, `Unknown astronaut_id '${r.astronaut_id}'. Create it with POST /api/astronauts first.`, request, requestId);

      const inserted = await env.DB.prepare(
        `INSERT INTO vitals (astronaut_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c, timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          r.astronaut_id,
          r.heart_rate,
          r.blood_pressure_systolic,
          r.blood_pressure_diastolic,
          r.oxygen_saturation,
          r.temperature_c,
          r.timestamp
        )
        .run();
      await env.DB.prepare("UPDATE astronauts SET last_checkin = MAX(COALESCE(last_checkin, ''), ?) WHERE id = ?")
        .bind(r.timestamp, r.astronaut_id)
        .run();

      const signals = await recomputeWatchSignals(env.DB, r.astronaut_id);
      return json(
        {
          success: true,
          id: inserted.meta.last_row_id,
          watch_signals: signals.map((s) => ({ signal_type: s.signal_type, status: s.status })),
        },
        request,
        requestId,
        201
      );
    }
    return error(405, "Method not allowed", request, requestId);
  }

  const vitalsMatch = path.match(/^\/api\/vitals\/([^/]+)$/);
  if (vitalsMatch) {
    if (method !== "GET") return error(405, "Method not allowed", request, requestId);
    const errs: string[] = [];
    const id = validateId(decodeURIComponent(vitalsMatch[1]), "astronaut_id", errs);
    if (!id) return error(400, "Invalid astronaut_id", request, requestId, errs);
    const limit = parseLimit(url.searchParams.get("limit"), 50, 500);
    const { results } = await env.DB.prepare(
      `SELECT ${VITALS_COLUMNS} FROM vitals WHERE astronaut_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`
    )
      .bind(id, limit)
      .all();
    return json({ vitals: results }, request, requestId);
  }

  // ---- WATCH signals ----
  if (path === "/api/watch-signals") {
    if (method !== "GET") return error(405, "Method not allowed", request, requestId);
    const filter = url.searchParams.get("astronaut_id");
    if (filter !== null) {
      const errs: string[] = [];
      if (!validateId(filter, "astronaut_id", errs)) return error(400, "Invalid query", request, requestId, errs);
    }
    // Most severe first, then most recently updated.
    const order = `ORDER BY CASE status WHEN 'critical' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, updated_at DESC`;
    const stmt = filter
      ? env.DB.prepare(`SELECT * FROM watch_signals WHERE astronaut_id = ? ${order}`).bind(filter)
      : env.DB.prepare(`SELECT * FROM watch_signals ${order}`);
    const { results } = await stmt.all();
    return json({ watch_signals: results }, request, requestId);
  }

  if (path === "/api/watch-signals/recompute") {
    if (method !== "POST") return error(405, "Method not allowed", request, requestId);
    const denied = checkAuth(request, env.API_KEY, requestId);
    if (denied) return denied;
    return json({ recomputed: await recomputeAll(env.DB) }, request, requestId);
  }

  return error(404, "Not found", request, requestId);
}

async function recomputeAll(db: D1Database): Promise<number> {
  const { results } = await db.prepare("SELECT id FROM astronauts").all<{ id: string }>();
  let count = 0;
  for (const { id } of results) {
    try {
      count += (await recomputeWatchSignals(db, id)).length;
    } catch (e) {
      console.error("recompute failed", id, e);
    }
  }
  return count;
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (e) {
      console.error("Unhandled error", request.method, new URL(request.url).pathname, e);
      const requestId = crypto.randomUUID();
      return error(500, "Internal server error", request, requestId);
    }
  },

  // The 72h window slides even when no new readings arrive, so recompute on a schedule.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recomputeAll(env.DB).then((n) => console.log(`Recomputed ${n} WATCH signals`)));
  },
} satisfies ExportedHandler<Env>;

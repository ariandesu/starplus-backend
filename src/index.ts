import { checkAuth, error, json, preflight, readJsonObject } from "./http";
import { parseLimit, validateAstronaut, validateId, validateVitals } from "./validate";
import { recomputeWatchSignals } from "./watch";

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  /** Secret (`wrangler secret put API_KEY`). Required for every write. */
  API_KEY?: string;
}

const VITALS_COLUMNS =
  "id, astronaut_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c, timestamp";

async function astronautExists(db: D1Database, id: string): Promise<boolean> {
  return (await db.prepare("SELECT 1 FROM astronauts WHERE id = ?").bind(id).first()) !== null;
}

async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method;

  if (method === "OPTIONS") return preflight();

  // ---- Health ----
  if (path === "/api/health") {
    if (method !== "GET") return error(405, "Method not allowed");
    return json({ status: "ok", service: "starplus-backend", environment: env.ENVIRONMENT });
  }

  // ---- Astronauts ----
  if (path === "/api/astronauts") {
    if (method === "GET") {
      const { results } = await env.DB.prepare("SELECT * FROM astronauts ORDER BY created_at ASC, id ASC").all();
      return json({ astronauts: results });
    }
    if (method === "POST") {
      const denied = checkAuth(request, env.API_KEY);
      if (denied) return denied;
      const body = await readJsonObject(request);
      if (!body) return error(400, "Body must be a JSON object");
      const v = validateAstronaut(body);
      if (!v.ok) return error(400, "Invalid astronaut", v.errors);
      const a = v.value;
      // Upsert so a crew member's name, role or status can be updated by re-posting.
      await env.DB.prepare(
        `INSERT INTO astronauts (id, name, role, status) VALUES (?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, status = excluded.status`
      )
        .bind(a.id, a.name, a.role, a.status)
        .run();
      const row = await env.DB.prepare("SELECT * FROM astronauts WHERE id = ?").bind(a.id).first();
      return json({ astronaut: row }, 201);
    }
    return error(405, "Method not allowed");
  }

  // ---- Vitals ----
  if (path === "/api/vitals") {
    if (method === "GET") {
      const limit = parseLimit(url.searchParams.get("limit"), 50, 500);
      const filter = url.searchParams.get("astronaut_id");
      if (filter !== null) {
        const errs: string[] = [];
        if (!validateId(filter, "astronaut_id", errs)) return error(400, "Invalid query", errs);
      }
      const stmt = filter
        ? env.DB.prepare(
            `SELECT ${VITALS_COLUMNS} FROM vitals WHERE astronaut_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`
          ).bind(filter, limit)
        : env.DB.prepare(`SELECT ${VITALS_COLUMNS} FROM vitals ORDER BY timestamp DESC, id DESC LIMIT ?`).bind(limit);
      const { results } = await stmt.all();
      return json({ vitals: results });
    }
    if (method === "POST") {
      const denied = checkAuth(request, env.API_KEY);
      if (denied) return denied;
      const body = await readJsonObject(request);
      if (!body) return error(400, "Body must be a JSON object");
      const v = validateVitals(body);
      if (!v.ok) return error(400, "Invalid vitals reading", v.errors);
      const r = v.value;
      if (!(await astronautExists(env.DB, r.astronaut_id)))
        return error(404, `Unknown astronaut_id '${r.astronaut_id}'. Create it with POST /api/astronauts first.`);

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
        201
      );
    }
    return error(405, "Method not allowed");
  }

  const vitalsMatch = path.match(/^\/api\/vitals\/([^/]+)$/);
  if (vitalsMatch) {
    if (method !== "GET") return error(405, "Method not allowed");
    const errs: string[] = [];
    const id = validateId(decodeURIComponent(vitalsMatch[1]), "astronaut_id", errs);
    if (!id) return error(400, "Invalid astronaut_id", errs);
    const limit = parseLimit(url.searchParams.get("limit"), 50, 500);
    const { results } = await env.DB.prepare(
      `SELECT ${VITALS_COLUMNS} FROM vitals WHERE astronaut_id = ? ORDER BY timestamp DESC, id DESC LIMIT ?`
    )
      .bind(id, limit)
      .all();
    return json({ vitals: results });
  }

  // ---- WATCH signals ----
  if (path === "/api/watch-signals") {
    if (method !== "GET") return error(405, "Method not allowed");
    const filter = url.searchParams.get("astronaut_id");
    if (filter !== null) {
      const errs: string[] = [];
      if (!validateId(filter, "astronaut_id", errs)) return error(400, "Invalid query", errs);
    }
    // Most severe first, then most recently updated.
    const order = `ORDER BY CASE status WHEN 'critical' THEN 0 WHEN 'watch' THEN 1 ELSE 2 END, updated_at DESC`;
    const stmt = filter
      ? env.DB.prepare(`SELECT * FROM watch_signals WHERE astronaut_id = ? ${order}`).bind(filter)
      : env.DB.prepare(`SELECT * FROM watch_signals ${order}`);
    const { results } = await stmt.all();
    return json({ watch_signals: results });
  }

  if (path === "/api/watch-signals/recompute") {
    if (method !== "POST") return error(405, "Method not allowed");
    const denied = checkAuth(request, env.API_KEY);
    if (denied) return denied;
    return json({ recomputed: await recomputeAll(env.DB) });
  }

  return error(404, "Not found");
}

async function recomputeAll(db: D1Database): Promise<number> {
  const { results } = await db.prepare("SELECT id FROM astronauts").all<{ id: string }>();
  let count = 0;
  for (const { id } of results) count += (await recomputeWatchSignals(db, id)).length;
  return count;
}

export default {
  async fetch(request, env): Promise<Response> {
    try {
      return await handle(request, env);
    } catch (e) {
      console.error("Unhandled error", request.method, new URL(request.url).pathname, e);
      return error(500, "Internal server error");
    }
  },

  // The 72h window slides even when no new readings arrive, so recompute on a schedule.
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(recomputeAll(env.DB).then((n) => console.log(`Recomputed ${n} WATCH signals`)));
  },
} satisfies ExportedHandler<Env>;

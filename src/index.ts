import type { ExecutionEnvironment } from "cloudflare:workers";

export interface Env {
  DB: D1Database;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // Health check
    if (path === "/api/health") {
      return Response.json({ status: "ok", service: "starplus-backend" }, {
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // List astronauts
    if (path === "/api/astronauts" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM astronauts ORDER BY created_at DESC"
        ).all();
        return Response.json({ astronauts: results }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return Response.json({ error: "Failed to fetch astronauts" }, { status: 500 });
      }
    }

    // Get vitals for astronaut
    const vitalsMatch = path.match(/^\/api\/vitals\/([^/]+)$/);
    if (vitalsMatch && request.method === "GET") {
      const astronautId = vitalsMatch[1];
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM vitals WHERE astronaut_id = ? ORDER BY timestamp DESC LIMIT 50"
        ).bind(astronautId).all();
        return Response.json({ vitals: results }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return Response.json({ error: "Failed to fetch vitals" }, { status: 500 });
      }
    }

    // Get WATCH signals
    if (path === "/api/watch-signals" && request.method === "GET") {
      try {
        const { results } = await env.DB.prepare(
          "SELECT * FROM watch_signals ORDER BY created_at DESC"
        ).all();
        return Response.json({ watch_signals: results }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return Response.json({ error: "Failed to fetch watch signals" }, { status: 500 });
      }
    }

    // Submit vitals reading
    if (path === "/api/vitals" && request.method === "POST") {
      try {
        const body = await request.json();
        const { astronaut_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c } = body;

        if (!astronaut_id) {
          return Response.json({ error: "astronaut_id is required" }, { status: 400 });
        }

        await env.DB.prepare(
          `INSERT INTO vitals (astronaut_id, heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          astronaut_id,
          heart_rate ?? null,
          blood_pressure_systolic ?? null,
          blood_pressure_diastolic ?? null,
          oxygen_saturation ?? null,
          temperature_c ?? null
        ).run();

        return Response.json({ success: true }, {
          headers: { "Access-Control-Allow-Origin": "*" },
        });
      } catch (e) {
        return Response.json({ error: "Failed to submit vitals" }, { status: 500 });
      }
    }

    return Response.json({ error: "Not found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;

import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_PHOTO_ID } from "../../src/demo.ts";
import { DEMO_TTL_MS } from "../../src/better-auth.ts";
import { tzDateKey } from "../../src/demo-seed.ts";
import type { Env } from "../../src/env.ts";
import { DEMO_PASSWORD, resetDemo, signInCrew, signInDemo, signInDemoForRole } from "./helpers";

let sequence = 700;
const uuid = () => `cccccccc-dddd-4eee-8000-${String(sequence++).padStart(12, "0")}`;

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });

const measurement = (crew_id: string, client_id: string) => ({
  client_id,
  crew_id,
  metric: "heart_rate",
  value_num: 72,
  value_text: null,
  unit: "bpm",
  measured_at: "2026-11-08T10:00:00Z",
  received_at: "",
  source: "manual",
  device_id: "device-demo",
  capture_id: null,
  is_estimate: 0,
  confirmed_by_user: 0,
  provenance: "real",
  setting: "iss",
  phase: "inflight",
  phase_day: 21,
  supersedes_client_id: null,
  voided: 0,
  catalog_version: "1",
  schema_version: 1,
});

const assessment = (crew_id: string, client_id: string) => ({
  client_id,
  crew_id,
  assessed_at: "2026-11-08T10:05:00Z",
  overall_status: "nominal",
  per_measure: [],
  model_advice: null,
  model_id: "none",
  model_version: "none",
  catalog_version: "1",
  kb_version: "none",
  inputs_hash: "abc",
  received_at: "",
});

const batch = (token: string, items: unknown[], results: unknown[]) =>
  SELF.fetch("https://example.com/api/measurements/batch", {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ schema_version: 1, catalog_version: "1", items, results }),
  });

describe("demo accounts", () => {
  beforeAll(async () => {
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "real-astro", name: "Real", role: "astronaut", provenance: "real" }),
    });
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: "real-fmo", name: "Real FMO", role: "flight_medical_officer", provenance: "real" }),
    });
  });

  it("signs all three demo cards in with a 7-day session", async () => {
    for (const [account, crew_id, role] of [
      ["astronaut01", "demo-astronaut", "astronaut"],
      ["fmo01", "demo-surgeon", "flight_medical_officer"],
      ["mc01", "demo-mission", "mission_control"],
    ] as const) {
      const res = await SELF.fetch("https://example.com/api/auth/sign-in/username", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.1" },
        body: JSON.stringify({ username: account, password: DEMO_PASSWORD }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { user: Record<string, unknown> };
      expect(body.user).toMatchObject({ crew_id, role, demo: true, provenance: "synthetic" });
      const token = res.headers.get("set-auth-token")!;
      const session = await env.DB.prepare('SELECT expiresAt FROM "session" WHERE token = ?')
        .bind(decodeURIComponent(token.split(".")[0]))
        .first<{ expiresAt: string }>();
      // Token is signed; fall back to the newest session row for the account.
      const row =
        session ??
        (await env.DB.prepare(
          `SELECT s.expiresAt FROM "session" s JOIN "user" u ON u.id = s.userId
           WHERE u.username = ? ORDER BY s.createdAt DESC LIMIT 1`
        )
          .bind(account)
          .first<{ expiresAt: string }>());
      const ttl = Date.parse(row!.expiresAt) - Date.now();
      expect(ttl).toBeGreaterThan(DEMO_TTL_MS - 120_000);
      expect(ttl).toBeLessThan(DEMO_TTL_MS + 120_000);
    }
  });

  it("gives mission control the surgeon dashboard data", async () => {
    const token = await signInDemo("mc01");
    const roster = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: authHeaders(token),
    });
    expect(roster.status).toBe(200);
    const body = (await roster.json()) as { crew: Array<{ crew_id: string }> };
    expect(body.crew.every((row) => row.crew_id.startsWith("demo-"))).toBe(true);
  });

  it("fences all three demo accounts to demo crew", async () => {
    for (const token of [await signInDemo("fmo01"), await signInDemo("mc01")]) {
      const results = await SELF.fetch("https://example.com/api/crew/results?crew_id=real-astro", {
        headers: authHeaders(token),
      });
      expect(((await results.json()) as { results: unknown[] }).results).toHaveLength(0);
      const measurements = await SELF.fetch("https://example.com/api/crew/measurements?crew_id=real-astro", {
        headers: authHeaders(token),
      });
      expect(((await measurements.json()) as { measurements: unknown[] }).measurements).toHaveLength(0);
    }
    const astro = await signInDemo("astronaut01");
    const astroResults = await SELF.fetch("https://example.com/api/crew/results?crew_id=real-astro", {
      headers: authHeaders(astro),
    });
    expect(astroResults.status).toBe(403);
    await astroResults.text();
    const roster = await SELF.fetch("https://example.com/api/crew/roster", { headers: authHeaders(astro) });
    expect(roster.status).toBe(403);
    await roster.text();
  });

  it("allows demo users only sign-in, get-session and sign-out — cookie and bearer", async () => {
    const attempts: Array<[string, string, unknown]> = [
      ["POST", "/api/auth/change-password", { currentPassword: DEMO_PASSWORD, newPassword: "hijacked-123" }],
      ["POST", "/api/auth/change-email", { newEmail: "hijacked@example.com" }],
      ["POST", "/api/auth/update-user", { name: "Hijacked", username: "hijacked01" }],
      ["POST", "/api/auth/delete-user", {}],
      ["POST", "/api/auth/revoke-sessions", {}],
      ["POST", "/api/auth/revoke-other-sessions", {}],
      ["POST", "/api/auth/revoke-session", {}],
      ["GET", "/api/auth/list-sessions", undefined],
    ];
    for (const transport of ["cookie", "bearer"] as const) {
      const res = await SELF.fetch("https://example.com/api/auth/sign-in/username", {
        method: "POST",
        headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.3" },
        body: JSON.stringify({ username: "astronaut01", password: DEMO_PASSWORD }),
      });
      expect(res.status).toBe(200);
      const token = res.headers.get("set-auth-token");
      const setCookies = res.headers.getSetCookie?.() ?? [];
      const cookie = setCookies.map((value) => value.split(";")[0]).join("; ");
      await res.text();
      expect(token).toBeTruthy();
      const headers: Record<string, string> =
        transport === "cookie"
          ? { Cookie: cookie, Origin: "http://localhost:3100" }
          : { Authorization: `Bearer ${token}` };

      const mine = await SELF.fetch("https://example.com/api/auth/get-session", { headers });
      expect(mine.status, transport).toBe(200);
      const body = (await mine.json()) as { user: { username: string; role: string } };
      expect(body.user).toMatchObject({ username: "astronaut01", role: "astronaut" });

      for (const [method, path, payload] of attempts) {
        const blocked = await SELF.fetch(`https://example.com${path}`, {
          method,
          headers: { ...headers, "Content-Type": "application/json" },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
        });
        expect(blocked.status, `${transport} ${path}`).toBe(403);
        await blocked.text();
      }

      const out = await SELF.fetch("https://example.com/api/auth/sign-out", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: "{}",
      });
      expect(out.status, transport).toBe(200);
      await out.text();
    }

    // The published demo password still works after all of that.
    const stillWorks = await signInDemo("astronaut01");
    const sync = await SELF.fetch("https://example.com/api/sync", { headers: authHeaders(stillWorks) });
    expect(sync.status).toBe(200);
    await sync.text();
  });

  it("turns email sign-in off for demo and real accounts", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.4" },
      body: JSON.stringify({ email: "fmo01@demo.starplus.local", password: DEMO_PASSWORD }),
    });
    expect(res.status).toBe(404);
    await res.text();
    const real = await SELF.fetch("https://example.com/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.4" },
      body: JSON.stringify({ email: "someone@example.com", password: "test-password-123" }),
    });
    expect(real.status).toBe(404);
    await real.text();
  });

  it("stores demo passwords as PBKDF2 hashes", async () => {
    await signInDemo("astronaut01");
    const row = await env.DB.prepare(
      `SELECT a.password FROM "account" a JOIN "user" u ON u.id = a.userId WHERE u.username = ?`
    )
      .bind("astronaut01")
      .first<{ password: string }>();
    expect(row?.password).toMatch(/^pbkdf2\$sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  });

  it("fences demo reads and acks to synthetic data", async () => {
    const realToken = await signInCrew("real-astro");
    const fmoToken = await signInCrew("real-fmo");
    const reportId = uuid();
    const posted = await SELF.fetch("https://example.com/api/reports", {
      method: "POST",
      headers: authHeaders(realToken),
      body: JSON.stringify({
        client_id: reportId,
        device_id: "device-demo",
        kind: "emergency",
        created_at: "2026-11-08T11:00:00Z",
        payload_json: { steps: ["checked response"] },
      }),
    });
    expect(posted.status).toBe(201);
    const batched = await batch(realToken, [measurement("real-astro", uuid())], [assessment("real-astro", uuid())]);
    expect(batched.status).toBe(200);

    const demoToken = await signInDemo("fmo01");
    const demoReports = await SELF.fetch("https://example.com/api/reports", { headers: authHeaders(demoToken) });
    expect(demoReports.status).toBe(200);
    expect(((await demoReports.json()) as { reports: unknown[] }).reports).toHaveLength(0);

    const demoResults = await SELF.fetch("https://example.com/api/crew/results?crew_id=real-astro", {
      headers: authHeaders(demoToken),
    });
    expect(((await demoResults.json()) as { results: unknown[] }).results).toHaveLength(0);

    const demoAck = await SELF.fetch("https://example.com/api/reports/ack", {
      method: "POST",
      headers: authHeaders(demoToken),
      body: JSON.stringify({ client_id: reportId }),
    });
    expect(demoAck.status).toBe(403);

    const fmoReports = await SELF.fetch("https://example.com/api/reports", { headers: authHeaders(fmoToken) });
    expect(((await fmoReports.json()) as { reports: unknown[] }).reports.length).toBeGreaterThan(0);
    const fmoResults = await SELF.fetch("https://example.com/api/crew/results?crew_id=real-astro", {
      headers: authHeaders(fmoToken),
    });
    expect(((await fmoResults.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });

  it("demo reset keeps accounts and sessions, reseeds 30 days, spares real rows", async () => {
    const realToken = await signInCrew("real-astro");
    const realItem = uuid();
    const seeded = await batch(realToken, [measurement("real-astro", realItem)], []);
    expect(seeded.status).toBe(200);

    const demoToken = await signInDemo("astronaut01");
    const demoItem = uuid();
    const demoSeeded = await batch(demoToken, [{ ...measurement("demo-astronaut", demoItem), provenance: "synthetic" }], []);
    expect(demoSeeded.status).toBe(200);

    const reset = await resetDemo();
    expect(reset.status).toBe(200);
    const outcome = (await reset.json()) as {
      reset: Record<string, number>;
      seeded: { measurements: number; results: number; reports: number };
    };
    expect(outcome.seeded.measurements).toBeGreaterThan(400);
    expect(outcome.seeded.results).toBe(98);

    const after = await SELF.fetch("https://example.com/api/sync", { headers: authHeaders(realToken) });
    const synced = (await after.json()) as { measurements: Array<{ client_id: string }> };
    expect(synced.measurements.map((item) => item.client_id)).toContain(realItem);
    expect(synced.measurements.map((item) => item.client_id)).not.toContain(demoItem);

    const demoAfter = await SELF.fetch("https://example.com/api/sync", { headers: authHeaders(demoToken) });
    expect(demoAfter.status).toBe(200);
    const demoSynced = (await demoAfter.json()) as {
      measurements: Array<{ client_id: string; measured_at: string }>;
      reports_status: Array<{ client_id: string; status: string }>;
      reports: Array<{ client_id: string; submitted_by: string; kind: string; status: string }>;
    };
    const demoTimeZone = (env as unknown as Env).DEMO_TZ ?? "UTC";
    const demoDays = new Set(
      demoSynced.measurements.map((item) => tzDateKey(Date.parse(item.measured_at), demoTimeZone))
    );
    expect(demoDays.size).toBe(30);
    expect(demoSynced.measurements.map((item) => item.client_id)).not.toContain(demoItem);
    expect(demoSynced.reports_status.map((item) => item.client_id).sort()).toEqual(["seed-demo-report-routine"]);
    expect(demoSynced.reports.every((item) => item.submitted_by === "demo-astronaut")).toBe(true);

    const reloginFmo = await signInDemo("fmo01");
    const demoPhoto = await SELF.fetch(`https://example.com/api/attachments/${DEMO_PHOTO_ID}`, {
      headers: authHeaders(reloginFmo),
    });
    expect(demoPhoto.status).toBe(200);
    await demoPhoto.arrayBuffer();
    const demoReports = await SELF.fetch("https://example.com/api/reports", { headers: authHeaders(reloginFmo) });
    expect(((await demoReports.json()) as { reports: unknown[] }).reports).toHaveLength(4);
  });

  it("stores demo acknowledgements per session", async () => {
    const reset = await resetDemo();
    expect(reset.status).toBe(200);
    const sessionA = await signInDemoForRole("flight_medical_officer");
    const ack = await SELF.fetch("https://example.com/api/reports/ack", {
      method: "POST",
      headers: authHeaders(sessionA),
      body: JSON.stringify({ client_id: "seed-demo-report-emergency" }),
    });
    expect(ack.status).toBe(200);

    const seenByA = (await (
      await SELF.fetch("https://example.com/api/reports", { headers: authHeaders(sessionA) })
    ).json()) as { reports: Array<{ client_id: string; status: string }> };
    expect(seenByA.reports.find((row) => row.client_id === "seed-demo-report-emergency")?.status).toBe("acknowledged");
    const rosterA = (await (
      await SELF.fetch("https://example.com/api/crew/roster", { headers: authHeaders(sessionA) })
    ).json()) as { crew: Array<{ crew_id: string; open_reports: number }> };
    expect(rosterA.crew.find((row) => row.crew_id === "demo-crew-3")?.open_reports).toBe(1);

    const sessionB = await signInDemoForRole("flight_medical_officer");
    const seenByB = (await (
      await SELF.fetch("https://example.com/api/reports", { headers: authHeaders(sessionB) })
    ).json()) as { reports: Array<{ client_id: string; status: string }> };
    expect(seenByB.reports.find((row) => row.client_id === "seed-demo-report-emergency")?.status).toBe("delivered");
    const rosterB = (await (
      await SELF.fetch("https://example.com/api/crew/roster", { headers: authHeaders(sessionB) })
    ).json()) as { crew: Array<{ crew_id: string; open_reports: number }> };
    expect(rosterB.crew.find((row) => row.crew_id === "demo-crew-3")?.open_reports).toBe(2);
  });
});

import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { DEMO_PHOTO_ID } from "../../src/demo.ts";

let sequence = 700;
const uuid = () => `cccccccc-dddd-4eee-8000-${String(sequence++).padStart(12, "0")}`;
const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.1" });
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const demoLogin = (role: string) =>
  SELF.fetch("https://example.com/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.1" },
    body: JSON.stringify({ role, device_id: "device-demo" }),
  });

async function loginAs(crewId: string): Promise<string> {
  const issued = await SELF.fetch("https://example.com/api/admin/codes", {
    method: "POST",
    headers: { ...adminHeaders(), "CF-Connecting-IP": "10.5.0.1" },
    body: JSON.stringify({ crew_id: crewId }),
  });
  const { code } = (await issued.json()) as { code: string };
  const authed = await SELF.fetch("https://example.com/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.1" },
    body: JSON.stringify({ code, device_id: "device-demo" }),
  });
  return ((await authed.json()) as { token: string }).token;
}

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

describe("demo login", () => {
  beforeAll(async () => {
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ id: "real-astro", name: "Real", role: "astronaut", provenance: "real" }),
    });
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ id: "real-fmo", name: "Real FMO", role: "flight_medical_officer", provenance: "real" }),
    });
  });

  it("signs in each role with a 24 h demo session", async () => {
    for (const [role, crew_id] of [["astronaut", "demo-astronaut"], ["flight_medical_officer", "demo-surgeon"]] as const) {
      const before = Date.now();
      const res = await demoLogin(role);
      expect(res.status).toBe(200);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body).toMatchObject({ crew_id, role, provenance: "synthetic", demo: true });
      const ttl = Date.parse(body.expires_at as string) - before;
      expect(ttl).toBeGreaterThan(23 * 3_600_000);
      expect(ttl).toBeLessThanOrEqual(24 * 3_600_000 + 5000);
    }
  });

  it("fences demo reads and acks to synthetic data", async () => {
    const realToken = await loginAs("real-astro");
    const fmoToken = await loginAs("real-fmo");
    const reportId = uuid();
    const posted = await SELF.fetch("https://example.com/api/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${realToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: reportId,
        device_id: "device-demo",
        kind: "emergency",
        created_at: "2026-11-08T11:00:00Z",
        payload_json: { steps: ["checked response"] },
      }),
    });
    expect(posted.status).toBe(201);
    const batched = await SELF.fetch("https://example.com/api/measurements/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${realToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: 1,
        catalog_version: "1",
        items: [measurement("real-astro", uuid())],
        results: [assessment("real-astro", uuid())],
      }),
    });
    expect(batched.status).toBe(200);
    const photoId = uuid();
    const stored = await SELF.fetch("https://example.com/api/attachments", {
      method: "POST",
      headers: { Authorization: `Bearer ${realToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: photoId, report_client_id: reportId, content_type: "image/png", data_base64: PNG_1PX }),
    });
    expect(stored.status).toBe(201);
    await stored.text();

    const demo = (await (await demoLogin("flight_medical_officer")).json()) as { token: string };
    const demoReports = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(demoReports.status).toBe(200);
    expect(((await demoReports.json()) as { reports: unknown[] }).reports).toHaveLength(0);

    const demoResults = await SELF.fetch(`https://example.com/api/crew/results?crew_id=real-astro`, {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(demoResults.status).toBe(200);
    expect(((await demoResults.json()) as { results: unknown[] }).results).toHaveLength(0);

    const demoPhoto = await SELF.fetch(`https://example.com/api/attachments/${photoId}`, {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(demoPhoto.status).toBe(403);
    await demoPhoto.text();

    const demoAck = await SELF.fetch("https://example.com/api/reports/ack", {
      method: "POST",
      headers: { Authorization: `Bearer ${demo.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: reportId }),
    });
    expect(demoAck.status).toBe(403);

    const fmoReports = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(((await fmoReports.json()) as { reports: unknown[] }).reports.length).toBeGreaterThan(0);
    const fmoPhoto = await SELF.fetch(`https://example.com/api/attachments/${photoId}`, {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(fmoPhoto.status).toBe(200);
    await fmoPhoto.arrayBuffer();
    const fmoResults = await SELF.fetch(`https://example.com/api/crew/results?crew_id=real-astro`, {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(((await fmoResults.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });

  it("demo reset touches only demo rows", async () => {
    const realToken = await loginAs("real-astro");
    const realItem = uuid();
    const seeded = await SELF.fetch("https://example.com/api/measurements/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${realToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: 1,
        catalog_version: "1",
        items: [measurement("real-astro", realItem)],
        results: [],
      }),
    });
    expect(seeded.status).toBe(200);

    const demo = (await (await demoLogin("astronaut")).json()) as { token: string };
    const demoItem = uuid();
    const demoSeeded = await SELF.fetch("https://example.com/api/measurements/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${demo.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        schema_version: 1,
        catalog_version: "1",
        items: [{ ...measurement("demo-astronaut", demoItem), provenance: "synthetic" }],
        results: [],
      }),
    });
    expect(demoSeeded.status).toBe(200);
    const demoPhoto = await SELF.fetch("https://example.com/api/attachments", {
      method: "POST",
      headers: { Authorization: `Bearer ${demo.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ id: DEMO_PHOTO_ID, report_client_id: uuid(), content_type: "image/png", data_base64: PNG_1PX }),
    });
    expect(demoPhoto.status).toBe(201);
    await demoPhoto.text();

    const reset = await SELF.fetch("https://example.com/api/admin/demo-reset", {
      method: "POST",
      headers: adminHeaders(),
    });
    expect(reset.status).toBe(200);

    const after = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${realToken}` },
    });
    const synced = (await after.json()) as { measurements: Array<{ client_id: string }> };
    expect(synced.measurements.map((item) => item.client_id)).toContain(realItem);
    expect(synced.measurements.map((item) => item.client_id)).not.toContain(demoItem);

    const relogin = (await (await demoLogin("astronaut")).json()) as { token: string };
    const reloginFmo = (await (await demoLogin("flight_medical_officer")).json()) as { token: string };
    const gonePhoto = await SELF.fetch(`https://example.com/api/attachments/${DEMO_PHOTO_ID}`, {
      headers: { Authorization: `Bearer ${relogin.token}` },
    });
    expect(gonePhoto.status).toBe(404);
    await gonePhoto.text();
    const goneReports = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${reloginFmo.token}` },
    });
    expect(((await goneReports.json()) as { reports: unknown[] }).reports).toHaveLength(0);
  });
});

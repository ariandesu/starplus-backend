import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { signInCrew, signInDemoForRole } from "./helpers";

const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.5.0.1" });
let sequence = 100;
const uuid = () => `eeeeeeee-ffff-4eee-8000-${String(sequence++).padStart(12, "0")}`;
const DAY = 86_400_000;

function isoAt(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

async function createCrew(id: string, role: string, provenance: string): Promise<void> {
  const res = await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id, name: id, role, provenance }),
  });
  expect(res.status).toBe(201);
}

const loginAs = (crewId: string): Promise<string> => signInCrew(crewId);

const demoLogin = (role: string) => signInDemoForRole(role).then((token) => Response.json({ token }));

const assessment = (crew_id: string, daysAgo: number, overall_status: string) => ({
  client_id: uuid(),
  crew_id,
  assessed_at: isoAt(daysAgo),
  overall_status,
  per_measure: [],
  model_advice: null,
  model_id: "none",
  model_version: "none",
  catalog_version: "1",
  kb_version: "none",
  inputs_hash: "abc",
  received_at: "",
});

let fmoToken = "";
let demoToken = "";
const synthReport = uuid();

describe("demo fence is the demo crew", () => {
  beforeAll(async () => {
    await createCrew("fence-fmo", "flight_medical_officer", "real");
    await createCrew("fence-synth", "astronaut", "synthetic");
    await createCrew("fence-real", "astronaut", "real");
    fmoToken = await loginAs("fence-fmo");
    const synthToken = await loginAs("fence-synth");
    const realToken = await loginAs("fence-real");
    const batch = async (token: string, crewId: string) => {
      const posted = await SELF.fetch("https://example.com/api/measurements/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          schema_version: 1,
          catalog_version: "1",
          items: [],
          results: [0, 1, 2, 3, 4, 5, 6].map((daysAgo) => assessment(crewId, daysAgo, "nominal")),
        }),
      });
      expect(posted.status).toBe(200);
    };
    await batch(synthToken, "fence-synth");
    await batch(realToken, "fence-real");
    const report = await SELF.fetch("https://example.com/api/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${synthToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: synthReport,
        device_id: "device-fence",
        subject_crew_id: "fence-synth",
        kind: "emergency",
        created_at: isoAt(0),
        payload_json: {},
      }),
    });
    expect(report.status).toBe(201);
    demoToken = ((await (await demoLogin("flight_medical_officer")).json()) as { token: string }).token;
  });

  it("hides synthetic non-demo crew from the demo roster", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    expect(res.status).toBe(200);
    const ids = (((await res.json()) as { crew: Array<{ crew_id: string }> }).crew).map((row) => row.crew_id);
    expect(ids).not.toContain("fence-synth");
  });

  it("hides synthetic non-demo crew from demo progress", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    expect(res.status).toBe(200);
    // Only the seeded demo crew counts; with an empty demo seed here it is 0,
    // while the 7 nominal days of fence-synth must not leak in.
    expect(((await res.json()) as { readiness_pct: number }).readiness_pct).toBe(0);
  });

  it("hides synthetic non-demo crew from demo results and measurements", async () => {
    const results = await SELF.fetch("https://example.com/api/crew/results?crew_id=fence-synth", {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    expect(((await results.json()) as { results: unknown[] }).results).toHaveLength(0);
    const measurements = await SELF.fetch("https://example.com/api/crew/measurements?crew_id=fence-synth", {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    expect(((await measurements.json()) as { measurements: unknown[] }).measurements).toHaveLength(0);
  });

  it("hides synthetic non-demo reports from the demo list and refuse demo acks", async () => {
    const res = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${demoToken}` },
    });
    const ids = (((await res.json()) as { reports: Array<{ client_id: string }> }).reports).map((row) => row.client_id);
    expect(ids).not.toContain(synthReport);
    const ack = await SELF.fetch("https://example.com/api/reports/ack", {
      method: "POST",
      headers: { Authorization: `Bearer ${demoToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: synthReport }),
    });
    expect(ack.status).toBe(403);
  });

  it("leaves real sessions untouched", async () => {
    const roster = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    const ids = (((await roster.json()) as { crew: Array<{ crew_id: string }> }).crew).map((row) => row.crew_id);
    expect(ids).toContain("fence-real");
    const results = await SELF.fetch("https://example.com/api/crew/results?crew_id=fence-synth", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(((await results.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
    const listed = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    const listedIds = (((await listed.json()) as { reports: Array<{ client_id: string }> }).reports).map(
      (row) => row.client_id
    );
    expect(listedIds).toContain(synthReport);
    const ack = await SELF.fetch("https://example.com/api/reports/ack", {
      method: "POST",
      headers: { Authorization: `Bearer ${fmoToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: synthReport }),
    });
    expect(ack.status).toBe(200);
    const progress = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(((await progress.json()) as { readiness_pct: number }).readiness_pct).toBe(100);
  });
});

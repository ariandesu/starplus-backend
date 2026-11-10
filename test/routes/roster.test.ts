import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { signInCrew, signInDemoForRole } from "./helpers";

const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.4.0.1" });
let sequence = 900;
const uuid = () => `dddddddd-dddd-4eee-8000-${String(sequence++).padStart(12, "0")}`;
const DAY = 86_400_000;

function isoAt(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

async function createCrew(id: string, role: string, provenance: string, name?: string): Promise<void> {
  const res = await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id, name: name ?? id, role, provenance }),
  });
  expect(res.status).toBe(201);
}

const loginAs = (crewId: string): Promise<string> => signInCrew(crewId);

const assessment = (crew_id: string, daysAgo: number, overall_status: string, vitals: unknown[] = []) => ({
  client_id: uuid(),
  crew_id,
  assessed_at: isoAt(daysAgo),
  overall_status,
  per_measure: vitals,
  model_advice: null,
  model_id: "none",
  model_version: "none",
  catalog_version: "1",
  kb_version: "none",
  inputs_hash: "abc",
  received_at: "",
});

async function postResults(token: string, results: unknown[]) {
  const res = await SELF.fetch("https://example.com/api/measurements/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.4.0.1" },
    body: JSON.stringify({ schema_version: 1, catalog_version: "1", items: [], results }),
  });
  expect(res.status).toBe(200);
}

const demoLogin = (role: string) => signInDemoForRole(role).then((token) => Response.json({ token }));

let fmoToken = "";
let mcToken = "";
let astroToken = "";

describe("crew roster", () => {
  beforeAll(async () => {
    await createCrew("roster-fmo", "flight_medical_officer", "real");
    await createCrew("roster-mc", "mission_control", "real");
    await createCrew("roster-astro", "astronaut", "real");
    await createCrew("roster-critical", "astronaut", "real", "Critical Crew");
    await createCrew("roster-watch", "astronaut", "real", "Watch Crew");
    await createCrew("roster-nominal", "astronaut", "real", "Nominal Crew");
    fmoToken = await loginAs("roster-fmo");
    mcToken = await loginAs("roster-mc");
    astroToken = await loginAs("roster-astro");
    const tokenCritical = await loginAs("roster-critical");
    const tokenWatch = await loginAs("roster-watch");
    const tokenNominal = await loginAs("roster-nominal");
    const vitals = [
      { metric: "heart_rate", status: "nominal", reason_code: "within_limits", values: { value: 66, unit: "bpm" } },
    ];
    await postResults(tokenCritical, [assessment("roster-critical", 1, "nominal"), assessment("roster-critical", 0, "critical", vitals)]);
    await postResults(tokenWatch, [assessment("roster-watch", 2, "nominal"), assessment("roster-watch", 0, "watch")]);
    await postResults(tokenNominal, [assessment("roster-nominal", 5, "nominal"), assessment("roster-nominal", 0, "nominal")]);
    const posted = await SELF.fetch("https://example.com/api/reports", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenCritical}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: uuid(),
        device_id: "device-roster",
        subject_crew_id: "roster-critical",
        kind: "routine",
        created_at: isoAt(0),
        payload_json: {},
      }),
    });
    expect(posted.status).toBe(201);
  });

  it("lists astronauts with status, check-ins, reports and vitals, critical first", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      crew: Array<{
        crew_id: string;
        name: string;
        overall_status: string | null;
        last_check_in: string | null;
        checkin_days_7d: number;
        open_reports: number;
        vitals: Array<{ metric: string; value: number; unit: string; status: string }>;
      }>;
    };
    const ids = body.crew.filter((row) => row.crew_id.startsWith("roster-")).map((row) => row.crew_id);
    expect(ids).toEqual(["roster-critical", "roster-watch", "roster-nominal", "roster-astro"]);
    const critical = body.crew.find((row) => row.crew_id === "roster-critical")!;
    expect(critical.name).toBe("Critical Crew");
    expect(critical.overall_status).toBe("critical");
    expect(critical.checkin_days_7d).toBe(2);
    expect(critical.open_reports).toBe(1);
    expect(critical.vitals).toEqual([{ metric: "heart_rate", value: 66, unit: "bpm", status: "nominal" }]);
    const nominal = body.crew.find((row) => row.crew_id === "roster-nominal")!;
    expect(nominal.overall_status).toBe("nominal");
    expect(nominal.checkin_days_7d).toBe(2);
    expect(nominal.open_reports).toBe(0);
    const astro = body.crew.find((row) => row.crew_id === "roster-astro")!;
    expect(astro.overall_status).toBeNull();
    expect(astro.last_check_in).toBeNull();
    expect(astro.checkin_days_7d).toBe(0);
  });

  it("lets mission control read the roster but refuses astronauts", async () => {
    const mc = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${mcToken}` },
    });
    expect(mc.status).toBe(200);
    const astro = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${astroToken}` },
    });
    expect(astro.status).toBe(403);
    const anon = await SELF.fetch("https://example.com/api/crew/roster");
    expect(anon.status).toBe(401);
  });

  it("fences demo sessions to synthetic crew", async () => {
    await demoLogin("astronaut");
    const demo = (await (await demoLogin("flight_medical_officer")).json()) as { token: string };
    const res = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { crew: Array<{ crew_id: string }> };
    expect(body.crew.length).toBeGreaterThan(0);
    expect(body.crew.every((row) => row.crew_id.startsWith("demo-"))).toBe(true);
  });

  it("fences crew measurements to synthetic crew for demo sessions", async () => {
    const demo = (await (await demoLogin("flight_medical_officer")).json()) as { token: string };
    const real = await SELF.fetch("https://example.com/api/crew/measurements?crew_id=roster-critical", {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(real.status).toBe(200);
    expect(((await real.json()) as { measurements: unknown[] }).measurements).toHaveLength(0);
    const surgeon = await SELF.fetch("https://example.com/api/crew/measurements?crew_id=roster-critical", {
      headers: { Authorization: `Bearer ${fmoToken}` },
    });
    expect(surgeon.status).toBe(200);
  });

  it("lets mission control read crew results", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/results?crew_id=roster-critical", {
      headers: { Authorization: `Bearer ${mcToken}` },
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { results: unknown[] }).results.length).toBeGreaterThan(0);
  });
});

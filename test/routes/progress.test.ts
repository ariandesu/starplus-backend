import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { signInCrew, signInDemoForRole } from "./helpers";

let sequence = 500;
const uuid = () => `bbbbbbbb-cccc-4ddd-8eee-${String(sequence++).padStart(12, "0")}`;
const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.2.0.1" });
const DAY = 86_400_000;

function isoAt(daysAgo: number): string {
  return new Date(Date.now() - daysAgo * DAY).toISOString();
}

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

async function createCrew(crewId: string, provenance: string): Promise<void> {
  const res = await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id: crewId, name: crewId, role: "astronaut", provenance }),
  });
  expect(res.status).toBe(201);
}

const loginAs = (crewId: string): Promise<string> => signInCrew(crewId);

async function postResults(token: string, results: unknown[]) {
  const res = await SELF.fetch("https://example.com/api/measurements/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.2.0.1" },
    body: JSON.stringify({ schema_version: 1, catalog_version: "1", items: [], results }),
  });
  expect(res.status).toBe(200);
}

const demoLogin = (role: string) => signInDemoForRole(role).then((token) => Response.json({ token }));

let tokenA = "";

describe("crew progress", () => {
  beforeAll(async () => {
    await createCrew("progress-crew-daily", "real");
    await createCrew("progress-crew-synth", "synthetic");
    await createCrew("progress-crew-watch", "real");
    tokenA = await loginAs("progress-crew-daily");
    const tokenSynth = await loginAs("progress-crew-synth");
    const tokenWatch = await loginAs("progress-crew-watch");
    await postResults(
      tokenA,
      [0, 1, 2, 3, 4, 5, 6, 7].map((daysAgo) => assessment("progress-crew-daily", daysAgo, "nominal"))
    );
    await postResults(tokenSynth, [assessment("progress-crew-synth", 0, "nominal")]);
    await postResults(tokenWatch, [
      assessment("progress-crew-watch", 1, "nominal"),
      assessment("progress-crew-watch", 0, "watch"),
    ]);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress");
    expect(res.status).toBe(401);
  });

  it("caps a daily checker at 100 over the 7-date window", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window_days: number; readiness_pct: number };
    expect(body.window_days).toBe(7);
    expect(body.readiness_pct).toBe(100);
  });

  it("ignores synthetic crew and crews whose latest result is watch", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const body = (await res.json()) as { readiness_pct: number };
    expect(body.readiness_pct).toBe(100);
  });

  it("computes demo crew progress over synthetic crew for demo sessions", async () => {
    const demo = (await (await demoLogin("astronaut")).json()) as { token: string };
    await postResults(
      demo.token,
      [0, 1, 2, 3, 4, 5, 6].map((daysAgo) => assessment("demo-astronaut", daysAgo, "nominal"))
    );
    const res = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${demo.token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { readiness_pct: number };
    expect(body.readiness_pct).toBeGreaterThan(0);
  });
});

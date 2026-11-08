import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

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

async function loginAs(crewId: string): Promise<string> {
  await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id: crewId, name: crewId, role: "astronaut", provenance: "real" }),
  });
  const issued = await SELF.fetch("https://example.com/api/admin/codes", {
    method: "POST",
    headers: { ...adminHeaders(), "CF-Connecting-IP": "10.2.0.1" },
    body: JSON.stringify({ crew_id: crewId }),
  });
  const { code } = (await issued.json()) as { code: string };
  const authed = await SELF.fetch("https://example.com/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.2.0.1" },
    body: JSON.stringify({ code, device_id: "device-progress" }),
  });
  return ((await authed.json()) as { token: string }).token;
}

async function postResults(token: string, results: unknown[]) {
  const res = await SELF.fetch("https://example.com/api/measurements/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.2.0.1" },
    body: JSON.stringify({ schema_version: 1, catalog_version: "1", items: [], results }),
  });
  expect(res.status).toBe(200);
}

let tokenA = "";

describe("crew progress", () => {
  beforeAll(async () => {
    tokenA = await loginAs("progress-crew-a");
    const tokenB = await loginAs("progress-crew-b");
    await postResults(tokenA, [
      assessment("progress-crew-a", 0, "nominal"),
      assessment("progress-crew-a", 2, "nominal"),
      assessment("progress-crew-a", 4, "nominal"),
    ]);
    await postResults(tokenB, [
      assessment("progress-crew-b", 0, "watch"),
      assessment("progress-crew-b", 1, "watch"),
      assessment("progress-crew-b", 2, "watch"),
      assessment("progress-crew-b", 3, "watch"),
      assessment("progress-crew-b", 4, "watch"),
      assessment("progress-crew-b", 5, "watch"),
      assessment("progress-crew-b", 6, "watch"),
    ]);
  });

  it("rejects unauthenticated requests", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress");
    expect(res.status).toBe(401);
  });

  it("averages check-in days over 7 days excluding watch and critical crews", async () => {
    const res = await SELF.fetch("https://example.com/api/crew/progress", {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { window_days: number; readiness_pct: number };
    expect(body.window_days).toBe(7);
    expect(body.readiness_pct).toBeCloseTo((3 / 7) * 100, 1);
  });
});

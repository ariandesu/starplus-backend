import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

let sequence = 100;
const uuid = () => `aaaaaaaa-bbbb-4ccc-8ddd-${String(sequence++).padStart(12, "0")}`;

const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.2" });
let token = "";

const measurement = (over: Record<string, unknown> = {}) => ({
  client_id: uuid(),
  crew_id: "batch-crew",
  metric: "heart_rate",
  value_num: 72,
  value_text: null,
  unit: "bpm",
  measured_at: "2026-11-08T10:00:00Z",
  received_at: "",
  source: "manual",
  device_id: "device-1",
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
  ...over,
});

const assessment = (over: Record<string, unknown> = {}) => ({
  client_id: uuid(),
  crew_id: "batch-crew",
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
  ...over,
});

const batch = (items: unknown[], results: unknown[] = []) =>
  SELF.fetch("https://example.com/api/measurements/batch", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.2" },
    body: JSON.stringify({ schema_version: 1, catalog_version: "1", items, results }),
  });

describe("batch sync", () => {
  beforeAll(async () => {
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ id: "batch-crew", name: "Batch", role: "astronaut", provenance: "real" }),
    });
    const issued = await SELF.fetch("https://example.com/api/admin/codes", {
      method: "POST",
      headers: { ...adminHeaders(), "CF-Connecting-IP": "10.1.0.2" },
      body: JSON.stringify({ crew_id: "batch-crew" }),
    });
    const { code } = (await issued.json()) as { code: string };
    const authed = await SELF.fetch("https://example.com/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.2" },
      body: JSON.stringify({ code, device_id: "device-1" }),
    });
    token = ((await authed.json()) as { token: string }).token;
    expect(token.length).toBeGreaterThan(0);
  });

  it("accepts a batch and replays it as duplicates", async () => {
    const items = [measurement(), measurement({ value_num: 74 })];
    const results = [assessment()];
    const first = await batch(items, results);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as { accepted: string[]; duplicates: string[]; rejected: unknown[]; max_items: number };
    expect(firstBody.accepted).toHaveLength(3);
    expect(firstBody.rejected).toHaveLength(0);
    expect(firstBody.max_items).toBe(100);

    const replay = await batch(items, results);
    const replayBody = (await replay.json()) as { accepted: string[]; duplicates: string[]; rejected: unknown[] };
    expect(replayBody.accepted).toHaveLength(0);
    expect(replayBody.duplicates).toHaveLength(3);
    expect(replayBody.rejected).toHaveLength(0);
  });

  it("rejects cross-astronaut writes and bad items with reasons", async () => {
    const items = [
      measurement({ crew_id: "someone-else" }),
      measurement({ metric: "nope" }),
      measurement({ value_num: 400 }),
      measurement({ provenance: "fake" }),
      measurement({ measured_at: new Date(Date.now() + 2 * 86_400_000).toISOString() }),
      measurement({ catalog_version: "-1" }),
      measurement({ client_id: "bad" }),
    ];
    const res = await batch(items);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { accepted: string[]; rejected: Array<{ client_id: string; reason: string }> };
    expect(body.accepted).toHaveLength(0);
    const reasons = Object.fromEntries(body.rejected.map((entry) => [entry.client_id, entry.reason]));
    expect(reasons[items[0].client_id]).toBe("wrong_crew");
    expect(reasons[items[1].client_id]).toBe("unknown_metric");
    expect(reasons[items[2].client_id]).toBe("out_of_bounds");
    expect(reasons[items[3].client_id]).toBe("missing_provenance");
    expect(reasons[items[4].client_id]).toBe("future_timestamp");
    expect(reasons[items[5].client_id]).toBe("catalog_version_too_old");
    expect(body.rejected.find((entry) => entry.reason === "invalid_schema")).toBeDefined();
  });

  it("rejects unpaired blood pressure", async () => {
    const sys = measurement({ metric: "blood_pressure_systolic", value_num: 146, unit: "mmHg", capture_id: "cap-bad" });
    const res = await batch([sys]);
    const body = (await res.json()) as { rejected: Array<{ reason: string }> };
    expect(body.rejected[0].reason).toBe("bp_pair_invalid");
  });

  it("rejects provenance that does not match the crew member", async () => {
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ id: "synth-crew", name: "Synth", role: "astronaut", provenance: "synthetic" }),
    });
    const issued = await SELF.fetch("https://example.com/api/admin/codes", {
      method: "POST",
      headers: { ...adminHeaders(), "CF-Connecting-IP": "10.1.0.4" },
      body: JSON.stringify({ crew_id: "synth-crew" }),
    });
    const { code } = (await issued.json()) as { code: string };
    const authed = await SELF.fetch("https://example.com/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.4" },
      body: JSON.stringify({ code, device_id: "device-s" }),
    });
    const synthToken = ((await authed.json()) as { token: string }).token;
    const send = (items: unknown[]) =>
      SELF.fetch("https://example.com/api/measurements/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${synthToken}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.4" },
        body: JSON.stringify({ schema_version: 1, catalog_version: "1", items, results: [] }),
      });
    const mixed = await send([
      measurement({ crew_id: "synth-crew", provenance: "real" }),
      measurement({ crew_id: "synth-crew", provenance: "synthetic" }),
    ]);
    expect(mixed.status).toBe(200);
    const body = (await mixed.json()) as { accepted: string[]; rejected: Array<{ client_id: string; reason: string }> };
    expect(body.accepted).toHaveLength(1);
    expect(body.rejected).toHaveLength(1);
    expect(body.rejected[0].reason).toBe("provenance_mismatch");
  });

  it("delivers synced rows to a second device", async () => {
    const inserted = await batch([measurement(), measurement({ value_num: 74 })]);
    expect(inserted.status).toBe(200);
    const res = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { measurements: unknown[]; cursor: string | null };
    expect(body.measurements.length).toBeGreaterThan(0);
    expect(body.cursor).toContain("|");
  });
});

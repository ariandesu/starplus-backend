import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { signInCrew } from "./helpers";

const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.3" });
let astroToken = "";
let surgeonToken = "";
let reportId = "";

const post = (path: string, body: unknown, token: string) =>
  SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const loginAs = (crewId: string): Promise<string> => signInCrew(crewId);

describe("reports", () => {
  beforeAll(async () => {
    for (const [id, role] of [["rep-astro", "astronaut"], ["rep-surgeon", "flight_medical_officer"], ["rep-mc", "mission_control"]] as const) {
      await SELF.fetch("https://example.com/api/admin/crew", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ id, name: id, role, provenance: "real" }),
      });
    }
    astroToken = await loginAs("rep-astro");
    surgeonToken = await loginAs("rep-surgeon");
  });

  it("posts, lists and acknowledges a report", async () => {
    reportId = "bbbbbbbb-cccc-4ddd-8eee-000000000001";
    const posted = await post(
      "/api/reports",
      {
        client_id: reportId,
        device_id: "device-r",
        subject_crew_id: "rep-astro",
        kind: "emergency",
        created_at: "2026-11-08T11:00:00Z",
        payload_json: { steps: ["checked response"] },
      },
      astroToken
    );
    expect(posted.status).toBe(201);

    const duplicate = await post(
      "/api/reports",
      {
        client_id: reportId,
        device_id: "device-r",
        subject_crew_id: "rep-astro",
        kind: "emergency",
        created_at: "2026-11-08T11:00:00Z",
        payload_json: { steps: ["checked response"] },
      },
      astroToken
    );
    expect(duplicate.status).toBe(200);

    const listed = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${surgeonToken}` },
    });
    expect(listed.status).toBe(200);
    const { reports } = (await listed.json()) as { reports: Array<{ client_id: string }> };
    expect(reports.some((report) => report.client_id === reportId)).toBe(true);

    const acked = await post("/api/reports/ack", { client_id: reportId }, surgeonToken);
    expect(acked.status).toBe(200);
  });

  it("gates reads and acks by role", async () => {
    const mcToken = await loginAs("rep-mc");
    const mcReads = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${mcToken}` },
    });
    expect(mcReads.status).toBe(200);

    const mcAck = await post("/api/reports/ack", { client_id: reportId }, mcToken);
    expect(mcAck.status).toBe(403);

    const astroReads = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${astroToken}` },
    });
    expect(astroReads.status).toBe(403);
  });
});

describe("reports ordering", () => {
  const base = Date.parse("2027-06-01T00:00:00Z");
  const newest = new Date(base + 500 * 1000).toISOString();
  let orderToken = "";

  beforeAll(async () => {
    await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: adminHeaders(),
      body: JSON.stringify({ id: "rep-order", name: "rep-order", role: "flight_medical_officer", provenance: "real" }),
    });
    orderToken = await loginAs("rep-order");
    const rows: unknown[][] = [];
    for (let i = 0; i < 501; i++) {
      const at = new Date(base + i * 1000).toISOString();
      rows.push([
        `eeeeeeee-0000-4000-8000-${String(i).padStart(12, "0")}`,
        "device-order",
        "rep-astro",
        null,
        "unknown crewmate",
        "emergency",
        at,
        at,
        "{}",
        null,
        0,
        "delivered",
        null,
        null,
      ]);
    }
    for (let chunk = 0; chunk < rows.length; chunk += 1) {
      const slice = rows.slice(chunk, chunk + 1);
      const tuples = slice.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      await env.DB.prepare(
        `INSERT INTO reports (client_id, device_id, submitted_by, subject_crew_id, subject_label, kind, created_at, received_at, payload_json, summary_text, summary_edited, status, acknowledged_by, acknowledged_at) VALUES ${tuples.join(", ")}`
      )
        .bind(...slice.flat())
        .run();
    }
  });

  it("returns the oldest 500 by default", async () => {
    const listed = await SELF.fetch("https://example.com/api/reports", {
      headers: { Authorization: `Bearer ${orderToken}` },
    });
    expect(listed.status).toBe(200);
    const { reports } = (await listed.json()) as { reports: Array<{ received_at: string }> };
    expect(reports).toHaveLength(500);
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i].received_at >= reports[i - 1].received_at).toBe(true);
    }
    expect(reports.some((report) => report.received_at === newest)).toBe(false);
  });

  it("returns the newest 500 with order=desc", async () => {
    const listed = await SELF.fetch("https://example.com/api/reports?order=desc", {
      headers: { Authorization: `Bearer ${orderToken}` },
    });
    expect(listed.status).toBe(200);
    const { reports } = (await listed.json()) as { reports: Array<{ received_at: string }> };
    expect(reports).toHaveLength(500);
    expect(reports[0].received_at).toBe(newest);
    for (let i = 1; i < reports.length; i++) {
      expect(reports[i].received_at <= reports[i - 1].received_at).toBe(true);
    }
  });
});

import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

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

async function loginAs(crew_id: string, device: string): Promise<string> {
  const issued = await SELF.fetch("https://example.com/api/admin/codes", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ crew_id }),
  });
  const { code } = (await issued.json()) as { code: string };
  const authed = await SELF.fetch("https://example.com/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.3" },
    body: JSON.stringify({ code, device_id: device }),
  });
  return ((await authed.json()) as { token: string }).token;
}

describe("reports", () => {
  beforeAll(async () => {
    for (const [id, role] of [["rep-astro", "astronaut"], ["rep-surgeon", "flight_medical_officer"], ["rep-mc", "mission_control"]] as const) {
      await SELF.fetch("https://example.com/api/admin/crew", {
        method: "POST",
        headers: adminHeaders(),
        body: JSON.stringify({ id, name: id, role, provenance: "real" }),
      });
    }
    astroToken = await loginAs("rep-astro", "device-r");
    surgeonToken = await loginAs("rep-surgeon", "device-s");
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
    const mcToken = await loginAs("rep-mc", "device-m");
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

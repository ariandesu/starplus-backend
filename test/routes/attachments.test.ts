import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

let sequence = 900;
const uuid = () => `dddddddd-eeee-4fff-8000-${String(sequence++).padStart(12, "0")}`;
const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.3.0.1" });
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

async function createCrew(crewId: string, role: string): Promise<void> {
  const res = await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id: crewId, name: crewId, role, provenance: "real" }),
  });
  expect(res.status).toBe(201);
}

async function loginAs(crewId: string): Promise<string> {
  const issued = await SELF.fetch("https://example.com/api/admin/codes", {
    method: "POST",
    headers: { ...adminHeaders(), "CF-Connecting-IP": "10.3.0.1" },
    body: JSON.stringify({ crew_id: crewId }),
  });
  const { code } = (await issued.json()) as { code: string };
  const authed = await SELF.fetch("https://example.com/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.3.0.1" },
    body: JSON.stringify({ code, device_id: "device-attachments" }),
  });
  return ((await authed.json()) as { token: string }).token;
}

const upload = (token: string | null, body: unknown) =>
  SELF.fetch("https://example.com/api/attachments", {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      "CF-Connecting-IP": "10.3.0.1",
    },
    body: JSON.stringify(body),
  });

let tokenA = "";
let tokenB = "";
let tokenFmo = "";
const attachmentId = uuid();
const reportId = uuid();

describe("attachments", () => {
  beforeAll(async () => {
    await createCrew("attach-crew-a", "astronaut");
    await createCrew("attach-crew-b", "astronaut");
    await createCrew("attach-crew-fmo", "flight_medical_officer");
    tokenA = await loginAs("attach-crew-a");
    tokenB = await loginAs("attach-crew-b");
    tokenFmo = await loginAs("attach-crew-fmo");
  });

  it("rejects unauthenticated uploads", async () => {
    const res = await upload(null, { id: uuid(), report_client_id: reportId, content_type: "image/png", data_base64: PNG_1PX });
    expect(res.status).toBe(401);
  });

  it("rejects non-images and oversized uploads", async () => {
    const badType = await upload(tokenA, { id: uuid(), report_client_id: reportId, content_type: "text/plain", data_base64: PNG_1PX });
    expect(badType.status).toBe(400);
    const big = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: "A".repeat(2_800_000),
    });
    expect(big.status).toBe(413);
  });

  it("stores, serves the sender, refuses other crew, allows the flight medical officer", async () => {
    const stored = await upload(tokenA, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: PNG_1PX,
    });
    expect(stored.status).toBe(201);

    const fetched = await SELF.fetch(`https://example.com/api/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");
    const bytes = new Uint8Array(await fetched.arrayBuffer());
    const expected = Uint8Array.from(atob(PNG_1PX), (char) => char.charCodeAt(0));
    expect(bytes).toEqual(expected);

    const other = await SELF.fetch(`https://example.com/api/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(other.status).toBe(403);
    await other.text();

    const fmo = await SELF.fetch(`https://example.com/api/attachments/${attachmentId}`, {
      headers: { Authorization: `Bearer ${tokenFmo}` },
    });
    expect(fmo.status).toBe(200);
    await fmo.arrayBuffer();
  });

  it("returns 404 for unknown attachments", async () => {
    const res = await SELF.fetch(`https://example.com/api/attachments/${uuid()}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(res.status).toBe(404);
  });
});

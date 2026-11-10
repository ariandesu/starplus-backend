import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { signInCrew } from "./helpers";

let sequence = 900;
const uuid = () => `dddddddd-eeee-4fff-8000-${String(sequence++).padStart(12, "0")}`;
const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.3.0.1" });
const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const JPEG_MAGIC = "/9j/" + "A".repeat(20);
const WEBP_MAGIC = "UklGRgAAAABXRUJQ" + "A".repeat(8);
const SVG = "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>";

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
const pngBytes = () => Uint8Array.from(atob(PNG_1PX), (char) => char.charCodeAt(0));

async function createCrew(crewId: string, role: string): Promise<void> {
  const res = await SELF.fetch("https://example.com/api/admin/crew", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify({ id: crewId, name: crewId, role, provenance: "real" }),
  });
  expect(res.status).toBe(201);
}

const loginAs = (crewId: string): Promise<string> => signInCrew(crewId);

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

const download = (token: string, id: string) =>
  SELF.fetch(`https://example.com/api/attachments/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

let tokenA = "";
let tokenB = "";
let tokenFmo = "";
let tokenMc = "";
const attachmentId = uuid();
const reportId = uuid();

describe("attachments", () => {
  beforeAll(async () => {
    await createCrew("attach-crew-a", "astronaut");
    await createCrew("attach-crew-b", "astronaut");
    await createCrew("attach-crew-fmo", "flight_medical_officer");
    await createCrew("attach-crew-mc", "mission_control");
    tokenA = await loginAs("attach-crew-a");
    tokenB = await loginAs("attach-crew-b");
    tokenFmo = await loginAs("attach-crew-fmo");
    tokenMc = await loginAs("attach-crew-mc");
  });

  it("rejects unauthenticated uploads", async () => {
    const res = await upload(null, { id: uuid(), report_client_id: reportId, content_type: "image/png", data_base64: PNG_1PX });
    expect(res.status).toBe(401);
    await res.text();
  });

  it("rejects non-images, wrong magic and oversized uploads without storing", async () => {
    const text = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: toBase64(new TextEncoder().encode("hello")),
    });
    expect(text.status).toBe(400);
    await text.text();
    const svg = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/svg+xml",
      data_base64: toBase64(new TextEncoder().encode(SVG)),
    });
    expect(svg.status).toBe(400);
    await svg.text();
    const pngAsJpeg = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/jpeg",
      data_base64: PNG_1PX,
    });
    expect(pngAsJpeg.status).toBe(400);
    await pngAsJpeg.text();
    const big = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: `iVBORw0KGgo${"A".repeat(2_800_000)}`,
    });
    expect(big.status).toBe(413);
    await big.text();
    const huge = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: `iVBORw0KGgo${"A".repeat(4_200_000)}`,
    });
    expect(huge.status).toBe(413);
    await huge.text();
  });

  it("runs the overwrite probe: no takeover, idempotent retry, safe serve", async () => {
    const stored = await upload(tokenA, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: PNG_1PX,
    });
    expect(stored.status).toBe(201);
    await stored.text();

    const blocked = await download(tokenB, attachmentId);
    expect(blocked.status).toBe(403);
    await blocked.text();

    const svgTakeover = await upload(tokenB, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/svg+xml",
      data_base64: toBase64(new TextEncoder().encode(SVG)),
    });
    expect(svgTakeover.status).toBe(400);
    await svgTakeover.text();

    const otherBytes = pngBytes();
    otherBytes[otherBytes.length - 1] ^= 0xff;
    const pngTakeover = await upload(tokenB, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: toBase64(otherBytes),
    });
    expect(pngTakeover.status).toBe(409);
    await pngTakeover.text();

    const stillBlocked = await download(tokenB, attachmentId);
    expect(stillBlocked.status).toBe(403);
    await stillBlocked.text();

    const fetched = await download(tokenA, attachmentId);
    expect(fetched.status).toBe(200);
    expect(fetched.headers.get("content-type")).toBe("image/png");
    expect(fetched.headers.get("x-content-type-options")).toBe("nosniff");
    expect(fetched.headers.get("content-security-policy")).toBe("sandbox; default-src 'none'");
    expect(fetched.headers.get("content-disposition")).toBe(`inline; filename="${attachmentId}"`);
    const bytes = new Uint8Array(await fetched.arrayBuffer());
    expect(bytes).toEqual(pngBytes());

    const retry = await upload(tokenA, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: PNG_1PX,
    });
    expect(retry.status).toBe(200);
    await retry.text();

    const changed = await upload(tokenA, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: toBase64(new Uint8Array([...pngBytes(), 0])),
    });
    expect(changed.status).toBe(409);
    await changed.text();

    const fmo = await download(tokenFmo, attachmentId);
    expect(fmo.status).toBe(200);
    await fmo.arrayBuffer();
  });

  it("role test: only the sender and the flight surgeon can fetch a photo", async () => {
    const stored = await upload(tokenA, {
      id: attachmentId,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: PNG_1PX,
    });
    expect([200, 201]).toContain(stored.status);
    await stored.text();

    const sender = await download(tokenA, attachmentId);
    expect(sender.status).toBe(200);
    await sender.arrayBuffer();

    const surgeon = await download(tokenFmo, attachmentId);
    expect(surgeon.status).toBe(200);
    await surgeon.arrayBuffer();

    const other = await download(tokenB, attachmentId);
    expect(other.status).toBe(403);
    await other.text();

    const control = await download(tokenMc, attachmentId);
    expect(control.status).toBe(403);
    await control.text();
  });

  it("accepts JPEG and WebP with matching magic", async () => {
    const jpeg = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/jpeg",
      data_base64: JPEG_MAGIC,
    });
    expect(jpeg.status).toBe(201);
    await jpeg.text();
    const webp = await upload(tokenA, {
      id: uuid(),
      report_client_id: reportId,
      content_type: "image/webp",
      data_base64: WEBP_MAGIC,
    });
    expect(webp.status).toBe(201);
    await webp.text();
  });

  it("returns 404 for unknown attachments", async () => {
    const res = await download(tokenA, uuid());
    expect(res.status).toBe(404);
    await res.text();
  });

  it("exposes the attachment GET to allowed origins only", async () => {
    const id = uuid();
    const put = await upload(tokenA, {
      id,
      report_client_id: reportId,
      content_type: "image/png",
      data_base64: PNG_1PX,
    });
    expect(put.status).toBe(201);
    await put.text();

    const allowed = await SELF.fetch(`https://example.com/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${tokenA}`, Origin: "https://starplus-frontend.vercel.app" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("access-control-allow-origin")).toBe("https://starplus-frontend.vercel.app");
    await allowed.arrayBuffer();

    const foreign = await SELF.fetch(`https://example.com/api/attachments/${id}`, {
      headers: { Authorization: `Bearer ${tokenA}`, Origin: "https://evil.example.com" },
    });
    expect(foreign.status).toBe(200);
    expect(foreign.headers.get("access-control-allow-origin")).toBeNull();
    await foreign.arrayBuffer();
  });
});

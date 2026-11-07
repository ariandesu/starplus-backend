import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const adminHeaders = () => ({ Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.1" });
const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.1.0.1", ...headers },
    body: JSON.stringify(body),
  });

describe("admin and auth", () => {
  beforeAll(async () => {
    const created = await post("/api/admin/crew", { id: "auth-crew", name: "Auth", role: "astronaut", provenance: "real" }, adminHeaders());
    expect(created.status).toBe(201);
  });

  it("rejects admin writes without the key", async () => {
    const res = await post("/api/admin/crew", { id: "x", name: "X", role: "astronaut", provenance: "real" });
    expect(res.status).toBe(401);
  });

  it("issues a code, exchanges it once, then refuses reuse", async () => {
    const issued = await post("/api/admin/codes", { crew_id: "auth-crew" }, adminHeaders());
    expect(issued.status).toBe(201);
    const { code } = (await issued.json()) as { code: string };
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

    const authed = await post("/api/auth", { code, device_id: "device-1" });
    expect(authed.status).toBe(200);
    const session = (await authed.json()) as { token: string; crew_id: string; role: string };
    expect(session.crew_id).toBe("auth-crew");

    const replay = await post("/api/auth", { code, device_id: "device-1" });
    expect(replay.status).toBe(401);

    const me = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${session.token}` },
    });
    expect(me.status).toBe(200);
  });

  it("refuses unknown codes", async () => {
    const res = await post("/api/auth", { code: "AAAAAAAA", device_id: "device-1" });
    expect(res.status).toBe(401);
  });

  it("revokes sessions and codes", async () => {
    const issued = await post("/api/admin/codes", { crew_id: "auth-crew" }, adminHeaders());
    const { code } = (await issued.json()) as { code: string };
    const authed = await post("/api/auth", { code, device_id: "device-2" });
    const { token } = (await authed.json()) as { token: string };

    const revoked = await post("/api/admin/revoke", { crew_id: "auth-crew" }, adminHeaders());
    expect(revoked.status).toBe(200);
    const counts = (await revoked.json()) as { revoked_sessions: number; revoked_codes: number };
    expect(counts.revoked_sessions).toBeGreaterThanOrEqual(1);

    const after = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
  });
});

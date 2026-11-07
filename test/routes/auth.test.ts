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

  it("gives shared devices a 24-hour session and others 30 days", async () => {
    const day = 24 * 3_600_000;
    const issue = async () => {
      const made = await post("/api/admin/codes", { crew_id: "auth-crew" }, adminHeaders());
      return ((await made.json()) as { code: string }).code;
    };
    const login = async (payload: Record<string, unknown>) => {
      const res = await post("/api/auth", payload);
      expect(res.status).toBe(200);
      return ((await res.json()) as { expires_at: string }).expires_at;
    };
    const now = Date.now();
    const sharedExpiry = Date.parse(await login({ code: await issue(), device_id: "shared-1", shared: true }));
    expect(sharedExpiry - now).toBeGreaterThan(day - 60_000);
    expect(sharedExpiry - now).toBeLessThan(day + 60_000);
    const normalExpiry = Date.parse(await login({ code: await issue(), device_id: "device-3" }));
    expect(normalExpiry - now).toBeGreaterThan(30 * day - 60_000);
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

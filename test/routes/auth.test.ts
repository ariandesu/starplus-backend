import { SELF, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { adminHeaders, postJson, signIn, signInCrew, usernameFor } from "./helpers";

const DAY = 86_400_000;

async function sessionRow(crewId: string) {
  return env.DB.prepare(
    `SELECT s.id, s.expiresAt, s.createdAt, s.updatedAt FROM "session" s
     JOIN "user" u ON u.id = s.userId WHERE u.crew_id = ? ORDER BY s.createdAt DESC LIMIT 1`
  )
    .bind(crewId)
    .first<{ id: string; expiresAt: string; createdAt: string; updatedAt: string }>();
}

describe("better auth accounts", () => {
  beforeAll(async () => {
    for (const [id, role] of [
      ["auth-crew", "astronaut"],
      ["auth-fmo", "flight_medical_officer"],
    ] as const) {
      const created = await postJson(
        "/api/admin/crew",
        { id, name: id, role, provenance: "real" },
        adminHeaders()
      );
      expect(created.status).toBe(201);
    }
  });

  it("refuses public sign-up", async () => {
    const res = await postJson("/api/auth/sign-up/email", {
      name: "Public",
      email: "public@example.com",
      password: "password-123",
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { code?: string };
    expect(body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED");
  });

  it("redeems a code once, then signs in with username and password", async () => {
    const issued = await postJson("/api/admin/codes", { crew_id: "auth-crew" }, adminHeaders());
    expect(issued.status).toBe(201);
    const { code } = (await issued.json()) as { code: string };
    expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{8}$/);

    const username = usernameFor("auth-crew");
    const redeemed = await postJson("/api/auth/redeem-code", { code, username, password: "test-password-123" });
    expect(redeemed.status).toBe(201);
    const body = (await redeemed.json()) as { token: string; crew_id: string; role: string; demo: boolean };
    expect(body.crew_id).toBe("auth-crew");
    expect(body.role).toBe("astronaut");
    expect(body.demo).toBe(false);
    expect(body.token).toBeTruthy();

    const sync = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${body.token}` },
    });
    expect(sync.status).toBe(200);
    await sync.text();

    const stored = await env.DB.prepare(
      `SELECT a.password FROM "account" a JOIN "user" u ON u.id = a.userId WHERE u.crew_id = ?`
    )
      .bind("auth-crew")
      .first<{ password: string }>();
    expect(stored?.password).toMatch(/^pbkdf2\$sha256\$\d+\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);

    const replay = await postJson("/api/auth/redeem-code", { code, username: "other_name", password: "test-password-123" });
    expect(replay.status).toBe(401);
    await replay.text();

    const again = await signIn(username, "test-password-123");
    const syncAgain = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${again}` },
    });
    expect(syncAgain.status).toBe(200);
    await syncAgain.text();
  });

  it("refuses a wrong password and an unknown username", async () => {
    const wrong = await postJson("/api/auth/sign-in/username", {
      username: usernameFor("auth-crew"),
      password: "not-the-password",
    });
    expect(wrong.status).toBe(401);
    await wrong.text();
    const unknown = await postJson("/api/auth/sign-in/username", {
      username: "nobody_here",
      password: "not-the-password",
    });
    expect(unknown.status).toBe(401);
    await unknown.text();
  });

  it("signs a surgeon in and reaches the roster with the bearer token", async () => {
    const token = await signInCrew("auth-fmo");
    const roster = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(roster.status).toBe(200);
    await roster.text();
    const sync = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sync.status).toBe(403);
    await sync.text();
  });

  it("rejects missing and malformed bearer tokens everywhere", async () => {
    for (const headers of [{}, { Authorization: "Bearer nonsense" }, { Authorization: "Basic abc" }] as Array<Record<string, string>>) {
      const sync = await SELF.fetch("https://example.com/api/sync", { headers });
      expect(sync.status).toBe(401);
      await sync.text();
      const roster = await SELF.fetch("https://example.com/api/crew/roster", { headers });
      expect(roster.status).toBe(401);
      await roster.text();
    }
  });

  it("gives shared devices a 24-hour session and others 30 days", async () => {
    const normalBefore = Date.now();
    const normalToken = await signInCrew("auth-crew");
    const normal = await sessionRow("auth-crew");
    expect(Date.parse(normal!.expiresAt) - normalBefore).toBeGreaterThan(30 * DAY - 120_000);
    expect(Date.parse(normal!.expiresAt) - normalBefore).toBeLessThan(30 * DAY + 120_000);
    await SELF.fetch("https://example.com/api/sync", { headers: { Authorization: `Bearer ${normalToken}` } }).then((r) => r.text());

    const sharedBefore = Date.now();
    await signIn(usernameFor("auth-crew"), "test-password-123", { shared: true });
    const shared = await sessionRow("auth-crew");
    expect(Date.parse(shared!.expiresAt) - sharedBefore).toBeGreaterThan(DAY - 120_000);
    expect(Date.parse(shared!.expiresAt) - sharedBefore).toBeLessThan(DAY + 120_000);
  });

  it("honours the shared-device flag on a redeem", async () => {
    const created = await postJson(
      "/api/admin/crew",
      { id: "auth-shared", name: "Shared", role: "astronaut", provenance: "real" },
      adminHeaders()
    );
    expect(created.status).toBe(201);
    const issued = await postJson("/api/admin/codes", { crew_id: "auth-shared" }, adminHeaders());
    const { code } = (await issued.json()) as { code: string };
    const before = Date.now();
    const res = await SELF.fetch("https://example.com/api/auth/redeem-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Shared-Device": "1", "CF-Connecting-IP": "10.0.0.8" },
      body: JSON.stringify({ code, username: "shared_member", password: "test-password-123" }),
    });
    expect(res.status).toBe(201);
    const { token } = (await res.json()) as { token: string };
    const row = await env.DB.prepare(
      `SELECT s.expiresAt FROM "session" s JOIN "user" u ON u.id = s.userId WHERE u.crew_id = ?`
    )
      .bind("auth-shared")
      .first<{ expiresAt: string }>();
    const ttl = Date.parse(row!.expiresAt) - before;
    expect(ttl).toBeGreaterThan(DAY - 120_000);
    expect(ttl).toBeLessThan(DAY + 120_000);
    const sync = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(sync.status).toBe(200);
    await sync.text();
  });

  it("never lets a user change server-owned fields", async () => {
    const token = await signInCrew("auth-crew");
    const URL = "https://example.com/api/auth/get-session";
    const before = (await (await SELF.fetch(URL, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
      user: { role: string; crew_id: string; provenance: string; demo: boolean };
    };
    expect(before.user).toMatchObject({ role: "astronaut", crew_id: "auth-crew", provenance: "real", demo: false });

    for (const patch of [
      { role: "flight_medical_officer" },
      { crew_id: "auth-fmo" },
      { provenance: "synthetic" },
      { demo: true },
    ]) {
      const res = await SELF.fetch("https://example.com/api/auth/update-user", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Still Me", ...patch }),
      });
      expect([200, 400], JSON.stringify(patch)).toContain(res.status);
      await res.text();
      const after = (await (await SELF.fetch(URL, { headers: { Authorization: `Bearer ${token}` } })).json()) as {
        user: { role: string; crew_id: string; provenance: string; demo: boolean };
      };
      expect(after.user).toMatchObject({ role: "astronaut", crew_id: "auth-crew", provenance: "real", demo: false });
    }

    const roster = await SELF.fetch("https://example.com/api/crew/roster", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(roster.status).toBe(403);
    await roster.text();
  });

  it("slides the expiry forward on use", async () => {
    const token = await signInCrew("auth-crew");
    const before = await sessionRow("auth-crew");
    expect(before).not.toBeNull();
    const stale = new Date(Date.now() - 2 * DAY).toISOString();
    const nearExpiry = new Date(Date.now() + 10 * 60_000).toISOString();
    await env.DB.prepare('UPDATE "session" SET updatedAt = ?, expiresAt = ? WHERE id = ?')
      .bind(stale, nearExpiry, before!.id)
      .run();
    const beforeExpiry = nearExpiry;

    const res = await SELF.fetch("https://example.com/api/auth/get-session", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    await res.text();

    const after = await sessionRow("auth-crew");
    expect(Date.parse(after!.expiresAt)).toBeGreaterThan(Date.parse(beforeExpiry));
    expect(Date.parse(after!.updatedAt)).toBeGreaterThan(Date.parse(stale));
  });

  it("rejects an expired session everywhere", async () => {
    const token = await signInCrew("auth-crew");
    await env.DB.prepare('UPDATE "session" SET expiresAt = ? WHERE id = ?')
      .bind(new Date(Date.now() - 1000).toISOString(), (await sessionRow("auth-crew"))!.id)
      .run();
    for (const path of ["/api/sync", "/api/crew/roster"]) {
      const res = await SELF.fetch(`https://example.com${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(401);
      await res.text();
    }
  });

  it("revokes sessions and codes through the admin route", async () => {
    const token = await signInCrew("auth-crew");
    const revoked = await postJson("/api/admin/revoke", { crew_id: "auth-crew" }, adminHeaders());
    expect(revoked.status).toBe(200);
    const counts = (await revoked.json()) as { revoked_sessions: number; revoked_codes: number };
    expect(counts.revoked_sessions).toBeGreaterThanOrEqual(1);
    const after = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
    await after.text();
  });

  it("expires the session on sign-out", async () => {
    const token = await signInCrew("auth-crew");
    const out = await SELF.fetch("https://example.com/api/auth/sign-out", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(out.status).toBe(200);
    await out.text();
    const after = await SELF.fetch("https://example.com/api/sync", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(after.status).toBe(401);
    await after.text();
  });

  it("exposes set-auth-token and the allowed origin on sign-in", async () => {
    await signInCrew("auth-crew");
    const res = await SELF.fetch("https://example.com/api/auth/sign-in/username", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://starplus-frontend.vercel.app",
        "CF-Connecting-IP": "10.0.0.9",
      },
      body: JSON.stringify({ username: usernameFor("auth-crew"), password: "test-password-123" }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://starplus-frontend.vercel.app");
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("set-auth-token");
    expect(res.headers.get("set-auth-token")).toBeTruthy();
    await res.text();

    const preflight = await SELF.fetch("https://example.com/api/auth/sign-in/username", {
      method: "OPTIONS",
      headers: { Origin: "https://starplus-frontend.vercel.app", "Access-Control-Request-Method": "POST" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("Access-Control-Expose-Headers")).toContain("set-auth-token");
    expect(preflight.headers.get("Access-Control-Allow-Headers")).toContain("X-Shared-Device");
  });
});

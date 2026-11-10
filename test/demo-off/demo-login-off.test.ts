import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEMO_PASSWORD } from "../routes/helpers";

const signIn = (username: string) =>
  SELF.fetch("https://example.com/api/auth/sign-in/username", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.7.0.1" },
    body: JSON.stringify({ username, password: DEMO_PASSWORD }),
  });

describe("DEMO_LOGIN=off", () => {
  it("refuses every demo account", async () => {
    for (const account of ["astronaut01", "fmo01", "mc01"]) {
      const res = await signIn(account);
      expect(res.status, account).toBe(404);
      await res.text();
    }
  });

  it("refuses demo email sign-in too", async () => {
    const res = await SELF.fetch("https://example.com/api/auth/sign-in/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.7.0.2" },
      body: JSON.stringify({ email: "fmo01@demo.starplus.local", password: DEMO_PASSWORD }),
    });
    expect(res.status).toBe(404);
    await res.text();
  });

  it("still signs a real account in", async () => {
    const crew = await SELF.fetch("https://example.com/api/admin/crew", {
      method: "POST",
      headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
      body: JSON.stringify({ id: "off-crew", name: "Off Crew", role: "astronaut", provenance: "real" }),
    });
    expect(crew.status).toBe(201);
    const issued = await SELF.fetch("https://example.com/api/admin/codes", {
      method: "POST",
      headers: { Authorization: "Bearer test-admin-key", "Content-Type": "application/json" },
      body: JSON.stringify({ crew_id: "off-crew" }),
    });
    const { code } = (await issued.json()) as { code: string };
    const redeemed = await SELF.fetch("https://example.com/api/auth/redeem-code", {
      method: "POST",
      headers: { "Content-Type": "application/json", "CF-Connecting-IP": "10.7.0.1" },
      body: JSON.stringify({ code, username: "off_crew", password: "test-password-123" }),
    });
    expect(redeemed.status).toBe(201);
    await redeemed.text();
  });
});

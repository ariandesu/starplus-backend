import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { DEMO_PASSWORD } from "../routes/helpers";

function signIn(ip: string, password: string, username = "astronaut01") {
  return SELF.fetch("https://example.com/api/auth/sign-in/username", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
    body: JSON.stringify({ username, password }),
  });
}

describe("sign-in rate limit", () => {
  it("lets 10 demo sign-ins from one address through within 10 s", async () => {
    const started = Date.now();
    for (let i = 0; i < 10; i++) {
      const res = await signIn("10.8.0.1", DEMO_PASSWORD);
      expect(res.status, `attempt ${i + 1}`).toBe(200);
      await res.text();
    }
    expect(Date.now() - started).toBeLessThan(10_000);
  }, 120_000);

  it("limits the 31st sign-in in a minute from one address", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await signIn("10.8.0.2", "wrong-password");
      expect(res.status, `attempt ${i + 1}`).not.toBe(429);
      await res.text();
    }
    const limited = await signIn("10.8.0.2", "wrong-password");
    expect(limited.status).toBe(429);
    await limited.text();
  }, 180_000);
});

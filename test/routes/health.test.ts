import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", service: "starplus-backend" });
  });

  it("runs against a database with migrations applied", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = results.map((row) => row.name);
    expect(names).toContain("astronauts");
    expect(names).toContain("vitals");
    expect(names).toContain("watch_signals");
  });
});

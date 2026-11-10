import { SELF, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

describe("GET /api/health", () => {
  it("returns ok with D1 and a request id", async () => {
    const res = await SELF.fetch("https://example.com/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", d1: "ok", service: "starplus-backend" });
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("has the self-check tables from migration 0003", async () => {
    const { results } = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all<{ name: string }>();
    const names = results.map((row) => row.name);
    for (const table of ["crew", "measurements", "results", "reports", "access_codes", "user", "session", "account", "verification"]) {
      expect(names).toContain(table);
    }
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

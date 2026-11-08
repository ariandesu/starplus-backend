import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const get = (path: string, origin?: string) =>
  SELF.fetch(`https://example.com${path}`, origin ? { headers: { Origin: origin } } : {});

describe("cors", () => {
  it("echoes the production origin with Vary and request id", async () => {
    const res = await get("/api/health", "https://starplus-frontend.vercel.app");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://starplus-frontend.vercel.app");
    expect(res.headers.get("Vary")).toContain("Origin");
    expect(res.headers.get("X-Request-Id")).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-Request-Id");
  });

  it("echoes a matching preview origin and rejects a foreign one", async () => {
    const preview = await get("/api/health", "https://starplus-frontend-abc123-mahirs-projects-9649281e.vercel.app");
    expect(preview.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://starplus-frontend-abc123-mahirs-projects-9649281e.vercel.app"
    );
    const foreign = await get("/api/health", "https://evil.example.com");
    expect(foreign.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(foreign.status).toBe(200);
  });

  it("gives localhost no allow header without the staging variable", async () => {
    const local = await get("/api/health", "http://localhost:3100");
    expect(local.status).toBe(200);
    expect(local.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("answers preflight", async () => {
    const res = await SELF.fetch("https://example.com/api/sync", {
      method: "OPTIONS",
      headers: { Origin: "https://starplus-frontend.vercel.app" },
    });
    expect(res.status).toBe(204);
  });
});

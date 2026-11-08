import { describe, expect, it } from "vitest";
import { checkDemoLimit } from "../src/ratelimit.ts";
import type { Env } from "../src/env.ts";

const request = (ip: string) =>
  new Request("https://example.com/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip },
  });

describe("checkDemoLimit", () => {
  it("returns a 429 with Retry-After when the binding refuses", async () => {
    const env = {
      ENVIRONMENT: "test",
      RATE_LIMIT_DEMO: { limit: async () => ({ success: false }) },
    } as unknown as Env;
    const limited = await checkDemoLimit(request("10.9.0.1"), env, "req-1");
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect(limited!.headers.get("Retry-After")).toBe("60");
  });

  it("lets traffic through when the binding allows it", async () => {
    const env = {
      ENVIRONMENT: "test",
      RATE_LIMIT_DEMO: { limit: async () => ({ success: true }) },
    } as unknown as Env;
    const limited = await checkDemoLimit(request("10.9.0.1"), env, "req-1");
    expect(limited).toBeNull();
  });

  it("is open in tests without the binding and closed without it in production", async () => {
    const testEnv = { ENVIRONMENT: "production", TEST_MIGRATIONS: [] } as unknown as Env;
    expect(await checkDemoLimit(request("10.9.0.1"), testEnv, "req-1")).toBeNull();
    const prodEnv = { ENVIRONMENT: "production" } as unknown as Env;
    const limited = await checkDemoLimit(request("10.9.0.1"), prodEnv, "req-1");
    expect(limited?.status).toBe(503);
  });
});

import { describe, expect, it } from "vitest";
import type { Env } from "../src/env";
import { checkApiLimit, checkAuthLimit, checkRateLimit } from "../src/ratelimit";

const request = (path: string, headers: Record<string, string> = {}) =>
  new Request(`https://example.com${path}`, { headers });

describe("checkRateLimit", () => {
  it("passes when the limiter allows and skips when unbound", async () => {
    const allow = { limit: async () => ({ success: true }) } as unknown as RateLimit;
    expect(await checkRateLimit(allow, "k", request("/api/auth"), "req-1")).toBeNull();
    expect(await checkRateLimit(undefined, "k", request("/api/auth"), "req-1")).toBeNull();
  });

  it("returns 429 with a request id when the limiter refuses", async () => {
    const deny = { limit: async () => ({ success: false }) } as unknown as RateLimit;
    const res = await checkRateLimit(deny, "k", request("/api/auth"), "req-2");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("X-Request-Id")).toBe("req-2");
  });

  it("keys auth limits by IP and API limits by token", async () => {
    const seen: string[] = [];
    const spy = {
      limit: async ({ key }: { key: string }) => {
        seen.push(key);
        return { success: true };
      },
    } as unknown as RateLimit;
    const env = { RATE_LIMIT_AUTH: spy, RATE_LIMIT_API: spy } as unknown as Env;
    await checkAuthLimit(request("/api/auth", { "CF-Connecting-IP": "10.9.0.1" }), env, "r1");
    await checkApiLimit(request("/api/sync", { Authorization: "Bearer tok-1" }), env, "r2");
    expect(seen).toEqual(["ip:10.9.0.1", "token:tok-1"]);
  });
});

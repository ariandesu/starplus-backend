import type { Env } from "./env.ts";
import { error } from "./http.ts";

export function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export function clientIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") ?? "unknown";
}

export async function checkRateLimit(
  binding: RateLimit | undefined,
  key: string,
  request: Request,
  requestId: string
): Promise<Response | null> {
  if (!binding) return null;
  const { success } = await binding.limit({ key });
  if (success) return null;
  const limited = error(429, "Rate limited", request, requestId);
  limited.headers.set("Retry-After", "60");
  return limited;
}

export async function checkAuthLimit(request: Request, env: Env, requestId: string): Promise<Response | null> {
  if (!env.RATE_LIMIT_AUTH) {
    if (
      (env.ENVIRONMENT === "production" || env.ENVIRONMENT === "staging") &&
      env.TEST_MIGRATIONS === undefined
    ) {
      console.error(`rate-limit binding RATE_LIMIT_AUTH is missing in ${env.ENVIRONMENT}`);
      return error(503, "Rate limiting unavailable", request, requestId);
    }
    return null;
  }
  return checkRateLimit(env.RATE_LIMIT_AUTH, `ip:${clientIp(request)}`, request, requestId);
}

export async function checkDemoLimit(request: Request, env: Env, requestId: string): Promise<Response | null> {
  if (!env.RATE_LIMIT_DEMO) {
    if (
      (env.ENVIRONMENT === "production" || env.ENVIRONMENT === "staging") &&
      env.TEST_MIGRATIONS === undefined
    ) {
      console.error(`rate-limit binding RATE_LIMIT_DEMO is missing in ${env.ENVIRONMENT}`);
      return error(503, "Rate limiting unavailable", request, requestId);
    }
    return null;
  }
  return checkRateLimit(env.RATE_LIMIT_DEMO, `ip:${clientIp(request)}`, request, requestId);
}

export async function checkApiLimit(request: Request, env: Env, requestId: string): Promise<Response | null> {
  const token = bearerToken(request);
  const key = token ? `token:${token}` : `ip:${clientIp(request)}`;
  return checkRateLimit(env.RATE_LIMIT_API, key, request, requestId);
}

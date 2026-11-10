import { SELF, env } from "cloudflare:test";

export const DEMO_PASSWORD = env.DEMO_PASSWORD as string;

/** Deterministic username for a crew id, valid for the username plugin. */
export function usernameFor(crewId: string): string {
  return crewId.replace(/[^a-zA-Z0-9_.]/g, "_").slice(0, 30);
}

export function adminHeaders(ip = "10.0.0.1"): Record<string, string> {
  return {
    Authorization: `Bearer ${env.API_KEY}`,
    "Content-Type": "application/json",
    "CF-Connecting-IP": ip,
  };
}

export async function postJson(path: string, body: unknown, headers: Record<string, string> = {}, ip = "10.0.0.1") {
  return SELF.fetch(`https://example.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "CF-Connecting-IP": ip, ...headers },
    body: JSON.stringify(body),
  });
}

export interface SignInOptions {
  shared?: boolean;
  ip?: string;
}

/** Signs a username/password account in and returns the bearer token. */
export async function signIn(username: string, password: string, options: SignInOptions = {}): Promise<string> {
  const res = await postJson(
    "/api/auth/sign-in/username",
    { username, password },
    options.shared ? { "X-Shared-Device": "1" } : {},
    options.ip
  );
  if (res.status !== 200) {
    throw new Error(`sign-in failed for ${username}: ${res.status} ${await res.text()}`);
  }
  const token = res.headers.get("set-auth-token");
  if (!token) throw new Error(`sign-in for ${username} returned no set-auth-token`);
  await res.text();
  return token;
}

/** Signs a demo card in by username and returns the bearer token. */
export function signInDemo(
  account: "astronaut01" | "fmo01" | "mc01",
  options: SignInOptions = {}
): Promise<string> {
  return signIn(account, DEMO_PASSWORD, options);
}

/** Role-name mapping kept so older tests can keep their call sites. */
export function signInDemoForRole(role: string, options: SignInOptions = {}): Promise<string> {
  const account = role === "astronaut" ? "astronaut01" : role === "mission_control" ? "mc01" : "fmo01";
  return signInDemo(account, options);
}

/**
 * Gets a bearer token for a real crew member: redeems a fresh access code on
 * first use, then reuses the username/password login afterwards.
 */
export async function signInCrew(crewId: string, ip = "10.0.0.1"): Promise<string> {
  const username = usernameFor(crewId);
  const password = "test-password-123";
  const direct = await postJson("/api/auth/sign-in/username", { username, password }, {}, ip);
  if (direct.status === 200) {
    const token = direct.headers.get("set-auth-token");
    await direct.text();
    if (token) return token;
  } else {
    await direct.text();
  }

  const issued = await postJson("/api/admin/codes", { crew_id: crewId }, adminHeaders(ip), ip);
  const { code } = (await issued.json()) as { code: string };
  const redeemed = await postJson("/api/auth/redeem-code", { code, username, password }, {}, ip);
  if (redeemed.status !== 201) {
    throw new Error(`redeem failed for ${crewId}: ${redeemed.status} ${await redeemed.text()}`);
  }
  const { token } = (await redeemed.json()) as { token: string };
  return token;
}

export function resetDemo(ip = "10.0.0.1") {
  return postJson("/api/admin/demo-reset", {}, adminHeaders(ip), ip);
}

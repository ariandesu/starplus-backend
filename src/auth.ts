import { PROVENANCES, ROLES } from "@starplus/core";
import { getAuth, getSignUpAuth } from "./better-auth.ts";
import type { Env } from "./env.ts";
import { error, json, readJsonObject } from "./http.ts";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export type SessionCheck =
  | { ok: true; crew_id: string; role: string; demo: boolean; session_hash: string; session_id: string }
  | { ok: false; status: 401 | 403 };

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return [...bytes].map((byte) => CROCKFORD[byte % 32]).join("");
}

interface SessionUser {
  crew_id?: string | null;
  role?: string | null;
  demo?: boolean | null;
}

/**
 * Resolves the caller from their Better Auth bearer session. Same name and
 * return shape as before: call sites do not change. `session_hash` carries the
 * Better Auth session id so per-session demo acknowledgements keep working.
 */
export async function requireSession(
  request: Request,
  env: Env,
  roles: string[]
): Promise<SessionCheck> {
  const result = await getAuth(env).api.getSession({ headers: request.headers }).catch(() => null);
  if (!result?.session || !result.user) return { ok: false, status: 401 };
  const user = result.user as SessionUser;
  const role = user.role ?? "astronaut";
  if (!roles.includes(role)) return { ok: false, status: 403 };
  if (!user.crew_id) return { ok: false, status: 403 };
  const expires = new Date(result.session.expiresAt).getTime();
  if (Number.isFinite(expires) && expires <= Date.now()) return { ok: false, status: 401 };
  return {
    ok: true,
    crew_id: user.crew_id,
    role,
    demo: user.demo === true,
    session_hash: result.session.id,
    session_id: result.session.id,
  };
}

export function sessionError(check: { status: 401 | 403 }, request: Request, requestId: string): Response {
  return error(check.status, check.status === 401 ? "Unauthorized" : "Forbidden", request, requestId);
}

export async function handleAdminCrew(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const id = typeof body?.id === "string" ? body.id.trim() : "";
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const role = body?.role;
  const provenance = body?.provenance;
  if (id.length === 0 || name.length === 0 || !(ROLES as readonly string[]).includes(role as string) || !(PROVENANCES as readonly string[]).includes(provenance as string)) {
    return error(400, "Invalid crew member", request, requestId);
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO crew (id, name, role, provenance, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET name = excluded.name, role = excluded.role, provenance = excluded.provenance`
  )
    .bind(id, name, role, provenance, now)
    .run();
  const crew = await env.DB.prepare("SELECT * FROM crew WHERE id = ?").bind(id).first();
  return json({ crew }, request, requestId, 201);
}

export async function handleAdminCodes(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const crew_id = body?.crew_id;
  if (typeof crew_id !== "string" || crew_id.length === 0) {
    return error(400, "crew_id is required", request, requestId);
  }
  const crew = await env.DB.prepare("SELECT id FROM crew WHERE id = ?").bind(crew_id).first();
  if (!crew) return error(404, `Unknown crew_id '${crew_id}'`, request, requestId);
  const code = randomCode();
  await env.DB.prepare("INSERT INTO access_codes (code_hash, crew_id, created_at, revoked) VALUES (?, ?, ?, 0)")
    .bind(await sha256Hex(code), crew_id, new Date().toISOString())
    .run();
  return json({ code }, request, requestId, 201);
}

export async function handleAdminRevoke(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const crew_id = body?.crew_id;
  if (typeof crew_id !== "string" || crew_id.length === 0) {
    return error(400, "crew_id is required", request, requestId);
  }
  const ctx = await getAuth(env).$context;
  const users = await env.DB.prepare('SELECT id FROM "user" WHERE crew_id = ?')
    .bind(crew_id)
    .all<{ id: string }>();
  let revokedSessions = 0;
  for (const user of users.results) {
    const open = await env.DB.prepare('SELECT COUNT(*) AS n FROM "session" WHERE userId = ?')
      .bind(user.id)
      .first<{ n: number }>();
    revokedSessions += open?.n ?? 0;
    await ctx.internalAdapter.deleteUserSessions(user.id);
  }
  const codes = await env.DB.prepare("UPDATE access_codes SET revoked = 1 WHERE crew_id = ? AND revoked = 0")
    .bind(crew_id)
    .run();
  return json(
    { revoked_sessions: revokedSessions, revoked_codes: codes.meta.changes },
    request,
    requestId
  );
}

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;
const MIN_PASSWORD_LENGTH = 8;

/**
 * Redeems a single-use access code: creates the Better Auth user linked to the
 * crew member, consumes the code, and signs the person in. Afterwards they use
 * their username and password.
 */
export async function handleRedeemCode(request: Request, env: Env, requestId: string): Promise<Response> {
  const body = await readJsonObject(request);
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const username = typeof body?.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!code || !USERNAME_RE.test(username) || password.length < MIN_PASSWORD_LENGTH) {
    return error(400, "Invalid code, username or password", request, requestId);
  }
  const row = await env.DB.prepare(
    "SELECT code_hash, crew_id, used_at, revoked FROM access_codes WHERE code_hash = ?"
  )
    .bind(await sha256Hex(code))
    .first<{ code_hash: string; crew_id: string; used_at: string | null; revoked: number }>();
  if (!row || row.revoked !== 0 || row.used_at !== null) {
    return error(401, "That code did not work", request, requestId);
  }
  const crew = await env.DB.prepare("SELECT id, name, role, provenance FROM crew WHERE id = ?")
    .bind(row.crew_id)
    .first<{ id: string; name: string; role: string; provenance: string }>();
  if (!crew) return error(401, "That code did not work", request, requestId);

  const signUpAuth = getSignUpAuth(env);
  const ctx = await signUpAuth.$context;
  const existing = await ctx.adapter.findOne<{ id: string }>({
    model: "user",
    where: [{ field: "crew_id", value: crew.id }],
  });
  if (existing) return error(409, "This crew member already has a login", request, requestId);
  const taken = await ctx.adapter.findOne<{ id: string }>({
    model: "user",
    where: [{ field: "username", value: username }],
  });
  if (taken) return error(409, "That username is taken", request, requestId);

  const consumed = await env.DB.prepare(
    "UPDATE access_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND revoked = 0"
  )
    .bind(new Date().toISOString(), row.code_hash)
    .run();
  if (consumed.meta.changes !== 1) return error(401, "That code did not work", request, requestId);

  const user = await ctx.internalAdapter.createUser(
    {
      email: `${username}@crew.starplus.local`,
      emailVerified: true,
      name: crew.name,
      username,
      displayUsername: username,
      crew_id: crew.id,
      role: crew.role,
      provenance: crew.provenance,
      demo: false,
    },
    { method: "admin" }
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(password),
  });

  const signedIn = await getAuth(env).api.signInUsername({
    body: { username, password },
    headers: new Headers({ "x-shared-device": request.headers.get("x-shared-device") === "1" ? "1" : "0" }),
    returnHeaders: true,
  });
  const token = signedIn.headers.get("set-auth-token");
  const session = (signedIn.response as { session?: { expiresAt?: string | Date } }).session;
  return json(
    {
      token,
      crew_id: crew.id,
      name: crew.name,
      role: crew.role,
      provenance: crew.provenance,
      demo: false,
      expires_at: session?.expiresAt ? new Date(session.expiresAt).toISOString() : null,
    },
    request,
    requestId,
    201
  );
}

import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { betterAuth } from "better-auth";
import { bearer } from "better-auth/plugins/bearer";
import { username } from "better-auth/plugins/username";
import { hashPassword, parseIterations, verifyPassword } from "./password.ts";
import type { Env } from "./env.ts";

const DAY_MS = 86_400_000;
export const PERSONAL_TTL_MS = 30 * DAY_MS;
export const DEMO_TTL_MS = 7 * DAY_MS;
export const SHARED_TTL_MS = DAY_MS;
/** Renew the sliding expiry at most once an hour of active use. */
export const UPDATE_AGE_SECONDS = 3_600;

export interface DemoAccount {
  username: string;
  crew_id: string;
  role: string;
  name: string;
}

export const DEMO_ACCOUNTS: Record<"astronaut" | "surgeon" | "mission", DemoAccount> = {
  astronaut: { username: "astronaut01", crew_id: "demo-astronaut", role: "astronaut", name: "Alex Rivera" },
  surgeon: { username: "fmo01", crew_id: "demo-surgeon", role: "flight_medical_officer", name: "Demo flight surgeon" },
  mission: { username: "mc01", crew_id: "demo-mission", role: "mission_control", name: "Demo mission control" },
};

export const DEMO_USERNAMES = new Set(Object.values(DEMO_ACCOUNTS).map((account) => account.username));

const PRODUCTION_FRONTEND = "https://starplus-frontend.vercel.app";
const LOCAL_FRONTEND = "http://localhost:3100";

/** Routes a shared demo account may run; everything else is refused. */
const DEMO_ALLOWED_PATHS = new Set(["/sign-in/username", "/get-session", "/sign-out"]);

function trustedOrigins(env: Env): string[] {
  const extra = (env.EXTRA_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return [...new Set([PRODUCTION_FRONTEND, LOCAL_FRONTEND, ...extra])];
}

/** Sign-in attempts per minute per address (30; overridable for load tests). */
function signInMax(env: Env): number {
  const parsed = Number(env.SIGNIN_RATE_MAX);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 30;
}

export function sessionTtlMs(demo: boolean, shared: boolean): number {
  if (shared) return SHARED_TTL_MS;
  return demo ? DEMO_TTL_MS : PERSONAL_TTL_MS;
}

function authOptions(env: Env, allowPublicSignUp: boolean): Parameters<typeof betterAuth>[0] {
  return {
    appName: "STAR PLUS",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowPublicSignUp,
      autoSignIn: allowPublicSignUp,
      minPasswordLength: 8,
      // WebCrypto PBKDF2 instead of scrypt: scrypt exceeds the Free plan CPU.
      password: {
        hash: (password) => hashPassword(password, parseIterations(env.PBKDF2_ITERATIONS)),
        verify: ({ hash, password }) => verifyPassword(hash, password),
      },
    },
    user: {
      additionalFields: {
        // Server-owned: set only by createOrUpdateUser, never from a request body.
        crew_id: { type: "string", required: false, input: false },
        role: { type: "string", required: false, input: false },
        provenance: { type: "string", required: false, input: false },
        demo: { type: "boolean", required: false, defaultValue: false, input: false },
      },
    },
    session: {
      expiresIn: PERSONAL_TTL_MS / 1000,
      updateAge: UPDATE_AGE_SECONDS,
      // Set only by the session create hook from the shared-device header.
      additionalFields: { shared: { type: "boolean", required: false, defaultValue: false, input: false } },
    },
    plugins: [username(), bearer()],
    rateLimit: {
      enabled: env.RATE_LIMIT_MODE !== "off",
      window: 60,
      max: 120,
      // A venue shares one address; allow a room-sized burst, and keep the
      // Cloudflare RATE_LIMIT_* bindings as the real limiter.
      customRules: {
        "/sign-in/username": { window: 60, max: signInMax(env) },
        "/sign-in/email": { window: 60, max: signInMax(env) },
        "/redeem-code": { window: 60, max: 30 },
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"] },
    },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        const path = ctx.path;
        // Nothing uses email sign-in; keep it off so it cannot bypass the
        // demo kill switch or the username flow's checks.
        if (path === "/sign-in/email") {
          throw new APIError("NOT_FOUND", { message: "Email sign-in is not enabled on this server." });
        }
        if (path === "/sign-in/username") {
          const body = ctx.body as { username?: unknown } | undefined;
          const username = typeof body?.username === "string" ? body.username.toLowerCase() : "";
          if (DEMO_USERNAMES.has(username) && env.DEMO_LOGIN !== "on") {
            throw new APIError("NOT_FOUND", { message: "Demo login is switched off on this server." });
          }
          return;
        }
        // Resolve the session whatever the transport (cookie or bearer token)
        // so a shared demo account cannot escape the allow-list.
        const current = await getSessionFromCtx(ctx);
        let demo = Boolean((current?.user as { demo?: boolean } | undefined)?.demo);
        if (!demo) {
          const header = ctx.headers?.get("authorization") ?? "";
          const bearer = header.match(/^Bearer\s+(.+)$/i);
          if (bearer) {
            const rawToken = decodeURIComponent(bearer[1].split(".")[0]);
            const found = await ctx.context.internalAdapter.findSession(rawToken);
            demo = Boolean((found?.user as { demo?: boolean } | undefined)?.demo);
          }
        }
        if (!demo) {
          // Cookies may not have been loaded into the context yet; read the
          // session cookie directly (value: <token>.<signature>).
          const cookieHeader = ctx.headers?.get("cookie") ?? "";
          const match = cookieHeader.match(/(?:__Secure-better-auth\.session_token|better-auth\.session_token)=([^;]+)/);
          if (match) {
            const rawToken = decodeURIComponent(match[1].split(".")[0]);
            const found = await ctx.context.internalAdapter.findSession(rawToken);
            demo = Boolean((found?.user as { demo?: boolean } | undefined)?.demo);
          }
        }
        if (!demo) return;
        if (DEMO_ALLOWED_PATHS.has(path)) return;
        throw new APIError("FORBIDDEN", { message: "Demo accounts are read-only." });
      }),
    },
    databaseHooks: {
      session: {
        create: {
          before: async (session, context) => {
            const userId = (session as { userId?: string }).userId;
            const user = userId && context ? await context.context.internalAdapter.findUserById(userId) : null;
            const demo = Boolean((user as { demo?: boolean } | null)?.demo);
            const headers = context?.headers instanceof Headers ? context.headers : null;
            const shared = headers?.get("x-shared-device") === "1";
            return {
              data: {
                ...session,
                shared,
                expiresAt: new Date(Date.now() + sessionTtlMs(demo, shared)),
              },
            };
          },
        },
        update: {
          before: async (session, context) => {
            if (!context) return;
            const token = (session as { token?: string }).token;
            if (!token) return;
            const existing = await context.context.internalAdapter.findSession(token);
            if (!existing) return;
            const demo = Boolean((existing.user as { demo?: boolean }).demo);
            const shared = Boolean((existing.session as { shared?: boolean }).shared);
            const age = Date.now() - new Date(existing.session.updatedAt).getTime();
            if (age < UPDATE_AGE_SECONDS * 1000) {
              return { data: { ...session, expiresAt: new Date(existing.session.expiresAt) } };
            }
            return {
              data: {
                ...session,
                expiresAt: new Date(Date.now() + sessionTtlMs(demo, shared)),
              },
            };
          },
        },
      },
    },
  };
}

interface SignInResult {
  headers: Headers;
  response: { session?: { expiresAt?: string | Date } };
}
type BetterAuthInstance = ReturnType<typeof betterAuth>;
type Auth = Omit<BetterAuthInstance, "api"> & {
  api: BetterAuthInstance["api"] & {
    signInUsername: (input: {
      body: { username: string; password: string };
      headers?: Headers;
      returnHeaders: true;
    }) => Promise<SignInResult>;
  };
};
interface AuthCache {
  key: string;
  locked?: Auth;
  open?: Auth;
}
let cached: AuthCache | null = null;

function cacheKey(env: Env): string {
  return [env.BETTER_AUTH_SECRET ?? "", env.BETTER_AUTH_URL ?? "", env.EXTRA_ALLOWED_ORIGINS ?? ""].join("|");
}

/**
 * The mounted Better Auth instance: public sign-up is disabled, so accounts
 * only come from the admin, an access code, or the demo seed.
 */
export function getAuth(env: Env): Auth {
  const key = cacheKey(env);
  if (!cached || cached.key !== key) cached = { key };
  if (!cached.locked) cached.locked = betterAuth(authOptions(env, false)) as unknown as Auth;
  return cached.locked;
}

/**
 * Sign-up-enabled twin of `getAuth`, used only inside the Worker to create
 * users. It is never mounted, so public sign-up stays refused.
 */
export function getSignUpAuth(env: Env): Auth {
  const key = cacheKey(env);
  if (!cached || cached.key !== key) cached = { key };
  if (!cached.open) cached.open = betterAuth(authOptions(env, true)) as unknown as Auth;
  return cached.open;
}

export interface CreatedUser {
  id: string;
  username: string;
  crew_id: string;
  role: string;
  demo: boolean;
}

/**
 * Creates (or resets the password of) a username/password account linked to a
 * crew member. Uses the internal sign-up twin so public sign-up stays closed.
 */
export async function createOrUpdateUser(
  env: Env,
  account: { email: string; password: string; name: string; username: string; crew_id: string; role: string; provenance: string; demo: boolean }
): Promise<CreatedUser> {
  const auth = getSignUpAuth(env);
  const ctx = await auth.$context;
  const existing = await ctx.internalAdapter.findUserByEmail(account.email, { includeAccounts: false });
  if (existing) {
    await ctx.internalAdapter.updateUser(existing.user.id, {
      name: account.name,
      crew_id: account.crew_id,
      role: account.role,
      provenance: account.provenance,
      demo: account.demo,
    });
    await ctx.internalAdapter.updatePassword(existing.user.id, await ctx.password.hash(account.password));
    return { id: existing.user.id, username: account.username, crew_id: account.crew_id, role: account.role, demo: account.demo };
  }
  const user = await ctx.internalAdapter.createUser(
    {
      email: account.email,
      emailVerified: true,
      name: account.name,
      username: account.username,
      displayUsername: account.username,
      crew_id: account.crew_id,
      role: account.role,
      provenance: account.provenance,
      demo: account.demo,
    },
    { method: "admin" }
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(account.password),
  });
  return { id: user.id, username: account.username, crew_id: account.crew_id, role: account.role, demo: account.demo };
}

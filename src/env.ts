export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  /** Secret (`wrangler secret put API_KEY`). Required for admin routes. */
  API_KEY?: string;
  RATE_LIMIT_AUTH: RateLimit;
  RATE_LIMIT_API: RateLimit;
  /** R2 bucket for image attachments (stretch). */
  ATTACHMENTS?: R2Bucket;
  /** Bound only by the vitest pool; marks the test path for rate-limit checks. */
  TEST_MIGRATIONS?: unknown[];
  /** Staging only: extra CORS origins (comma-separated). Never set in production. */
  EXTRA_ALLOWED_ORIGINS?: string;
  /** Set to "on" to enable one-tap demo login. Staging and production only. */
  DEMO_LOGIN?: string;
  /** IANA timezone the demo seed calls "today" (e.g. "Asia/Dhaka"). */
  DEMO_TZ?: string;
  /** Demo-login rate limiter (120/min). Required in production and staging. */
  RATE_LIMIT_DEMO?: RateLimit;
  /** Better Auth signing secret (`wrangler secret put BETTER_AUTH_SECRET`). Never in git. */
  BETTER_AUTH_SECRET?: string;
  /** Public base URL of this Worker, used by Better Auth for origin checks. */
  BETTER_AUTH_URL?: string;
  /** Shared demo password (`wrangler secret put DEMO_PASSWORD`). Public by design, never in git. */
  DEMO_PASSWORD?: string;
  /** Set to "off" to disable Better Auth's in-memory limiter (tests). */
  RATE_LIMIT_MODE?: string;
  /** PBKDF2-SHA256 iteration count override (measured on staging; default in password.ts). */
  PBKDF2_ITERATIONS?: string;
  /** Sign-in attempts per minute per address (default 30; raised for load tests only). */
  SIGNIN_RATE_MAX?: string;
  /** Meta Muse Spark key for /api/consult (`wrangler secret put META_MODEL_API_KEY`). Never in git. */
  META_MODEL_API_KEY?: string;
}

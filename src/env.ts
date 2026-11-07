export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
  /** Secret (`wrangler secret put API_KEY`). Required for admin routes. */
  API_KEY?: string;
  RATE_LIMIT_AUTH: RateLimit;
  RATE_LIMIT_API: RateLimit;
  /** R2 bucket for image attachments (stretch). */
  ATTACHMENTS?: R2Bucket;
}

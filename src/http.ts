// Response helpers. Every response, including errors, carries the CORS headers
// so the browser can read error bodies too.

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: CORS_HEADERS });
}

export function error(status: number, message: string, details?: unknown): Response {
  return json(details === undefined ? { error: message } : { error: message, details }, status);
}

export function preflight(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Reads a JSON object body; returns null if the body is missing or not an object. */
export async function readJsonObject(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Checks `Authorization: Bearer <API_KEY>`. Fails closed: if no API_KEY secret
 * is configured, every write is refused.
 */
export function checkAuth(request: Request, apiKey: string | undefined): Response | null {
  if (!apiKey) return error(503, "Writes are disabled: API_KEY secret is not configured");
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1], apiKey)) return error(401, "Unauthorized");
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

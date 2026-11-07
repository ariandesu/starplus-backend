const PRODUCTION_ORIGIN = "https://starplus-frontend.vercel.app";
const PREVIEW_ORIGIN = /^https:\/\/starplus-frontend-[a-z0-9-]+-mahirs-projects-9649281e\.vercel\.app$/;

export function allowedOrigin(request: Request): string | null {
  const origin = request.headers.get("Origin");
  if (!origin) return null;
  if (origin === PRODUCTION_ORIGIN || PREVIEW_ORIGIN.test(origin)) return origin;
  return null;
}

function corsHeaders(request: Request, requestId: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
    "X-Request-Id": requestId,
    "Access-Control-Expose-Headers": "X-Request-Id",
  };
  const origin = allowedOrigin(request);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

export function json(body: unknown, request: Request, requestId: string, status = 200): Response {
  return Response.json(body, { status, headers: corsHeaders(request, requestId) });
}

export function error(
  status: number,
  message: string,
  request: Request,
  requestId: string,
  details?: unknown
): Response {
  return json(details === undefined ? { error: message } : { error: message, details }, request, requestId, status);
}

export function preflight(request: Request): Response {
  const requestId = crypto.randomUUID();
  return new Response(null, { status: 204, headers: corsHeaders(request, requestId) });
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
export function checkAuth(request: Request, apiKey: string | undefined, requestId: string): Response | null {
  if (!apiKey) return error(503, "Writes are disabled: API_KEY secret is not configured", request, requestId);
  const header = request.headers.get("Authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match || !timingSafeEqual(match[1], apiKey)) return error(401, "Unauthorized", request, requestId);
  return null;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.byteLength !== bb.byteLength) return false;
  return crypto.subtle.timingSafeEqual(ab, bb);
}

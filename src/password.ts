/**
 * Password hashing for Better Auth on the Workers Free plan.
 *
 * scrypt (Better Auth's default) costs far more than the Free plan's 10 ms CPU
 * per request, so sign-in eventually returns 503/1102. WebCrypto's native
 * PBKDF2-SHA256 is much cheaper; the iteration count is measured on staging so
 * one sign-in stays under about 5 ms.
 *
 * Stored format: `pbkdf2$sha256$<iterations>$<salt>$<hash>` (base64url salt and
 * derived key). There is deliberately no scrypt fallback: production has no
 * Better Auth users yet, and staging users are re-created after the change.
 */

// Measured on staging via `wrangler tail` cpuTime: at 12 000 iterations a
// valid sign-in cost about 6 ms more than an unknown-user sign-in (no hash),
// so 8 000 stays under the ~5 ms target at ~4 ms.
export const DEFAULT_PBKDF2_ITERATIONS = 8_000;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const PREFIX = "pbkdf2$sha256$";

export function parseIterations(value: string | undefined, fallback = DEFAULT_PBKDF2_ITERATIONS): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000_000 ? parsed : fallback;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    KEY_BYTES * 8
  );
  return new Uint8Array(bits);
}

/** Compares two derived keys without an early exit on the first differing byte. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) diff |= a[index] ^ b[index];
  return diff === 0;
}

export async function hashPassword(password: string, iterations: number): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const derived = await derive(password, salt, iterations);
  return `${PREFIX}${iterations}$${toBase64Url(salt)}$${toBase64Url(derived)}`;
}

/** Verifies a stored PBKDF2 hash; a malformed or foreign hash fails closed. */
export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (typeof hash !== "string" || !hash.startsWith(PREFIX)) return false;
  const parts = hash.split("$");
  if (parts.length !== 5) return false;
  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > 10_000_000) return false;
  const salt = fromBase64Url(parts[3]);
  const expected = fromBase64Url(parts[4]);
  if (!salt || !expected || expected.length !== KEY_BYTES) return false;
  const actual = await derive(password, salt, iterations);
  return constantTimeEqual(actual, expected);
}

import { describe, expect, it } from "vitest";
import { constantTimeEqual, DEFAULT_PBKDF2_ITERATIONS, hashPassword, parseIterations, verifyPassword } from "../src/password.ts";

const FAST = 1_000;

describe("password hashing", () => {
  it("hashes then verifies", async () => {
    const hash = await hashPassword("correct horse battery", FAST);
    expect(hash).toMatch(/^pbkdf2\$sha256\$1000\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    expect(hash).not.toContain("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery", FAST);
    expect(await verifyPassword(hash, "wrong horse battery")).toBe(false);
    expect(await verifyPassword(hash, "")).toBe(false);
  });

  it("fails closed on malformed and foreign hashes", async () => {
    for (const bad of [
      "",
      "not-a-hash",
      "pbkdf2$sha256$",
      "pbkdf2$sha256$abc$c2FsdA$aGFzaA",
      "pbkdf2$sha256$1000$not base64!$aGFzaA",
      "pbkdf2$sha256$1000$c2FsdA$short",
      "scrypt$N=16384,r=8,p=1$c2FsdA$aGFzaA",
      "pbkdf2$sha256$1000$c2FsdA",
    ]) {
      expect(await verifyPassword(bad, "anything"), bad).toBe(false);
    }
  });

  it("uses a fresh random salt each time", async () => {
    const a = await hashPassword("same password", FAST);
    const b = await hashPassword("same password", FAST);
    expect(a).not.toBe(b);
    expect(await verifyPassword(a, "same password")).toBe(true);
    expect(await verifyPassword(b, "same password")).toBe(true);
  });

  it("parses the iteration override safely", () => {
    expect(parseIterations(undefined)).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseIterations("9000")).toBe(9000);
    expect(parseIterations("0")).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseIterations("-1")).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseIterations("nope")).toBe(DEFAULT_PBKDF2_ITERATIONS);
    expect(parseIterations("999999999")).toBe(DEFAULT_PBKDF2_ITERATIONS);
  });

  it("compares in constant time", () => {
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
    expect(constantTimeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

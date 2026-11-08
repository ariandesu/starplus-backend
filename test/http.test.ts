import { describe, expect, it } from "vitest";
import { allowedOrigin } from "../src/http";

function requestWithOrigin(origin: string | null): Request {
  const headers = new Headers();
  if (origin !== null) headers.set("Origin", origin);
  return new Request("https://example.com/api/health", { headers });
}

describe("allowedOrigin", () => {
  it("always allows production and preview origins", () => {
    expect(allowedOrigin(requestWithOrigin("https://starplus-frontend.vercel.app"))).toBe(
      "https://starplus-frontend.vercel.app"
    );
    expect(
      allowedOrigin(requestWithOrigin("https://starplus-frontend-abc123-mahirs-projects-9649281e.vercel.app"))
    ).toBe("https://starplus-frontend-abc123-mahirs-projects-9649281e.vercel.app");
    expect(allowedOrigin(requestWithOrigin("https://evil.example.com"))).toBeNull();
    expect(allowedOrigin(requestWithOrigin(null))).toBeNull();
  });

  it("allows staging extra origins from the environment variable", () => {
    expect(allowedOrigin(requestWithOrigin("http://localhost:3100"), "http://localhost:3100")).toBe(
      "http://localhost:3100"
    );
    expect(
      allowedOrigin(requestWithOrigin("http://localhost:3100"), "http://localhost:3100, https://example.com")
    ).toBe("http://localhost:3100");
    expect(allowedOrigin(requestWithOrigin("https://evil.example.com"), "http://localhost:3100")).toBeNull();
  });

  it("gives localhost no allow header when the variable is unset", () => {
    expect(allowedOrigin(requestWithOrigin("http://localhost:3100"))).toBeNull();
    expect(allowedOrigin(requestWithOrigin("http://localhost:3100"), "")).toBeNull();
  });
});

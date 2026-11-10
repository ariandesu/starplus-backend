import { describe, expect, it } from "vitest";
import {
  DEMO_ACCOUNTS,
  DEMO_TTL_MS,
  DEMO_USERNAMES,
  PERSONAL_TTL_MS,
  SHARED_TTL_MS,
  sessionTtlMs,
} from "../src/better-auth.ts";

describe("demo accounts", () => {
  it("maps the three cards to their demo crew and roles", () => {
    expect(DEMO_ACCOUNTS).toEqual({
      astronaut: { username: "astronaut01", crew_id: "demo-astronaut", role: "astronaut", name: "Alex Rivera" },
      surgeon: {
        username: "fmo01",
        crew_id: "demo-surgeon",
        role: "flight_medical_officer",
        name: "Demo flight surgeon",
      },
      mission: {
        username: "mc01",
        crew_id: "demo-mission",
        role: "mission_control",
        name: "Demo mission control",
      },
    });
    expect([...DEMO_USERNAMES].sort()).toEqual(["astronaut01", "fmo01", "mc01"]);
  });

  it("uses a 7-day demo session, a 30-day personal session and 24 hours when shared", () => {
    expect(sessionTtlMs(true, false)).toBe(DEMO_TTL_MS);
    expect(sessionTtlMs(false, false)).toBe(PERSONAL_TTL_MS);
    expect(sessionTtlMs(false, true)).toBe(SHARED_TTL_MS);
    expect(sessionTtlMs(true, true)).toBe(SHARED_TTL_MS);
    expect(DEMO_TTL_MS).toBe(7 * 86_400_000);
    expect(PERSONAL_TTL_MS).toBe(30 * 86_400_000);
  });
});

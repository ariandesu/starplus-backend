import { describe, expect, it } from "vitest";
import { handleDemoAuth } from "../src/auth.ts";

function fakeDb() {
  const crews = new Map<string, Record<string, unknown>>();
  const sessions: Array<Record<string, unknown>> = [];
  const touched: string[] = [];
  return {
    crews,
    sessions,
    touched,
    db: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async run() {
                if (sql.startsWith("INSERT INTO crew")) {
                  touched.push("crew");
                  const id = args[0] as string;
                  if (!crews.has(id)) {
                    crews.set(id, { id, name: args[1], role: args[2], provenance: "synthetic", created_at: args[3] });
                  }
                  return { meta: { changes: 1 } };
                }
                if (sql.startsWith("INSERT INTO sessions")) {
                  touched.push("sessions");
                  sessions.push({
                    token_hash: args[0],
                    crew_id: args[1],
                    role: args[2],
                    device_id: args[3],
                    created_at: args[4],
                    expires_at: args[5],
                    revoked: 0,
                    demo: sql.includes(", 0, 1)") ? 1 : (args[6] as number | undefined) ?? 0,
                  });
                  return { meta: { changes: 1 } };
                }
                throw new Error(`unexpected statement: ${sql}`);
              },
              async first() {
                throw new Error(`unexpected select: ${sql}`);
              },
            };
          },
        };
      },
      batch(statements: Array<{ run: () => Promise<unknown> }>) {
        return Promise.all(statements.map((statement) => statement.run()));
      },
    },
  };
}

const demoRequest = (body: unknown) =>
  new Request("https://example.com/api/auth/demo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("handleDemoAuth", () => {
  it("returns 404 when DEMO_LOGIN is off", async () => {
    const fake = fakeDb();
    const res = await handleDemoAuth(
      demoRequest({ role: "astronaut", device_id: "d1" }),
      { DEMO_LOGIN: undefined } as never,
      "req-1"
    );
    expect(res.status).toBe(404);
    expect(fake.crews.size).toBe(0);
  });

  it("rejects bad roles and devices", async () => {
    const fake = fakeDb();
    const env = { DEMO_LOGIN: "on", DB: fake.db } as never;
    expect((await handleDemoAuth(demoRequest({ role: "astronaut" }), env, "r")).status).toBe(400);
    expect((await handleDemoAuth(demoRequest({ role: "pilot", device_id: "d" }), env, "r")).status).toBe(400);
    expect(fake.sessions).toHaveLength(0);
  });

  it("signs in fixed demo crew with a 24 h demo session and no codes", async () => {
    const fake = fakeDb();
    const env = { DEMO_LOGIN: "on", DB: fake.db } as never;
    const before = Date.now();
    const res = await handleDemoAuth(demoRequest({ role: "astronaut", device_id: "d1" }), env, "r");
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ crew_id: "demo-astronaut", role: "astronaut", provenance: "synthetic", demo: true });
    expect(typeof body.token).toBe("string");
    const ttl = Date.parse(body.expires_at as string) - before;
    expect(ttl).toBeGreaterThan(23 * 3_600_000);
    expect(ttl).toBeLessThanOrEqual(24 * 3_600_000 + 5000);
    expect(fake.crews.get("demo-astronaut")).toMatchObject({ role: "astronaut", provenance: "synthetic" });
    expect(fake.sessions).toHaveLength(1);
    expect(fake.sessions[0]).toMatchObject({ crew_id: "demo-astronaut", demo: 1 });
    expect(fake.touched).not.toContain("access_codes");

    const surgeon = await handleDemoAuth(demoRequest({ role: "flight_medical_officer", device_id: "d2" }), env, "r");
    expect(surgeon.status).toBe(200);
    expect(((await surgeon.json()) as Record<string, unknown>).crew_id).toBe("demo-surgeon");

    const again = await handleDemoAuth(demoRequest({ role: "astronaut", device_id: "d3" }), env, "r");
    expect(again.status).toBe(200);
    expect(fake.crews.size).toBe(2);
    expect(fake.sessions).toHaveLength(3);
  });
});

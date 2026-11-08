import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildDemoHistory } from "../tools/seed-demo.ts";

const root = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(root, "..", "ml", "data", "astronaut_health_SYNTHETIC.csv"), "utf8");

describe("buildDemoHistory", () => {
  it("yields at least one watch and one critical result with baselines", async () => {
    const { person, measurements, results } = await buildDemoHistory(csv, "SYN-A001", Date.parse("2026-11-08T12:00:00Z"));
    expect(person).toBe("SYN-A001");
    expect(measurements.length).toBeGreaterThan(400);
    expect(results).toHaveLength(30);
    const statuses = results.map((result) => result.overall_status);
    expect(statuses).toContain("watch");
    expect(statuses).toContain("critical");
    expect(statuses[statuses.length - 1]).toBe("critical");
    const withBaselines = results[results.length - 2];
    for (const metric of ["heart_rate", "blood_pressure_systolic", "blood_pressure_diastolic"]) {
      const entry = withBaselines.per_measure.find((item) => item.metric === metric);
      expect(entry, metric).toBeDefined();
      expect(entry!.values.baseline_mean, metric).not.toBeNull();
      expect(entry!.values.baseline_n, metric).toBeGreaterThanOrEqual(5);
    }
    expect(withBaselines.per_measure.find((item) => item.metric === "heart_rate")!.status).toBe("watch");
    const crew = new Set(measurements.map((item) => item.crew_id));
    expect([...crew]).toEqual(["demo-astronaut"]);
    expect(new Set(measurements.map((item) => item.client_id)).size).toBe(measurements.length);
  }, 60_000);
});

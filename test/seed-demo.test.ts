import { describe, expect, it } from "vitest";
import { buildDemoSeed } from "../src/demo-seed.ts";

describe("buildDemoSeed", () => {
  it("seeds a mostly nominal month with spread watch days and one late critical", async () => {
    const seed = await buildDemoSeed(Date.parse("2026-11-08T12:00:00Z"));
    expect(seed.person).toBe("SYN-A001");
    expect(seed.measurements.length).toBeGreaterThan(400);
    expect(seed.results).toHaveLength(30);
    expect(seed.days).toHaveLength(30);
    const statuses = seed.results.map((result) => result.overall_status);
    const nominal = statuses.filter((status) => status === "nominal").length;
    expect(nominal).toBeGreaterThanOrEqual(21);
    const watchDays = statuses.flatMap((status, i) => (status === "watch" ? [i] : []));
    expect(watchDays.length).toBeGreaterThanOrEqual(2);
    expect(watchDays[0]).toBeLessThanOrEqual(14);
    expect(watchDays).toContain(29);
    const lateCritical = statuses
      .map((status, i) => ({ status, i }))
      .filter(({ status }) => status === "critical");
    expect(lateCritical).toHaveLength(1);
    expect(lateCritical[0].i).toBeGreaterThanOrEqual(27);
    expect(statuses[statuses.length - 1]).toBe("watch");
    const latest = seed.results[seed.results.length - 1];
    for (const metric of ["heart_rate", "blood_pressure_systolic", "blood_pressure_diastolic"]) {
      const entry = latest.per_measure.find((item) => item.metric === metric);
      expect(entry, metric).toBeDefined();
      expect(entry!.values.baseline_mean, metric).not.toBeNull();
      expect(entry!.values.baseline_n, metric).toBeGreaterThanOrEqual(5);
    }
    const crew = new Set(seed.measurements.map((item) => item.crew_id));
    expect([...crew]).toEqual(["demo-astronaut"]);
    expect(new Set(seed.measurements.map((item) => item.client_id)).size).toBe(seed.measurements.length);
  }, 60_000);
});

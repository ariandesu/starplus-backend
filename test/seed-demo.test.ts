import { describe, expect, it } from "vitest";
import { buildDemoSeed, tzDateKey } from "../src/demo-seed.ts";

const DHAKA = "Asia/Dhaka";

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

  it("stamps demo today in Dhaka time, never in the future, mix intact", async () => {
    const nowMs = Date.parse("2026-11-09T18:00:00Z");
    const seed = await buildDemoSeed(nowMs, DHAKA);
    expect(seed.results).toHaveLength(30);
    expect(seed.days).toHaveLength(30);
    const latest = seed.results[seed.results.length - 1];
    expect(tzDateKey(Date.parse(latest.assessed_at), DHAKA)).toBe("2026-11-10");
    for (const item of seed.measurements) {
      expect(Date.parse(item.measured_at)).toBeLessThanOrEqual(nowMs);
    }
    for (const result of seed.results) {
      expect(Date.parse(result.assessed_at)).toBeLessThanOrEqual(nowMs);
    }
    const statuses = seed.results.map((result) => result.overall_status);
    const counts = new Map(statuses.map((status) => [status, statuses.filter((s) => s === status).length]));
    expect(Object.fromEntries(counts)).toEqual({ nominal: 23, watch: 3, insufficient: 3, critical: 1 });
    expect(statuses[statuses.length - 1]).toBe("watch");

    for (const hour of [0, 6, 12]) {
      const hourMs = Date.parse(`2026-11-09T${String(hour).padStart(2, "0")}:00:00Z`);
      const hourSeed = await buildDemoSeed(hourMs, DHAKA);
      for (const item of hourSeed.measurements) {
        expect(Date.parse(item.measured_at)).toBeLessThanOrEqual(hourMs);
      }
      for (const result of hourSeed.results) {
        expect(Date.parse(result.assessed_at)).toBeLessThanOrEqual(hourMs);
      }
    }
  }, 120_000);
});

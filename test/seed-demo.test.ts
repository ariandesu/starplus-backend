import { describe, expect, it } from "vitest";
import { buildCrewSeeds, buildDemoSeed, demoStories, tzDateKey } from "../src/demo-seed.ts";

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

  it("seeds four crew members with their stories", async () => {
    const nowMs = Date.parse("2026-11-09T18:00:00Z");
    const seeds = await buildCrewSeeds(nowMs, DHAKA, demoStories());
    expect(seeds.map((seed) => seed.crewId)).toEqual(["demo-astronaut", "demo-crew-2", "demo-crew-3", "demo-crew-4"]);
    expect(seeds.map((seed) => seed.name)).toEqual(["Alex Rivera", "Sam Okafor", "Mia Chen", "Leo Haas"]);
    const byId = new Map(seeds.map((seed) => [seed.crewId, seed]));
    const statuses = (id: string): string[] => byId.get(id)!.results.map((result) => result.overall_status);

    const alex = byId.get("demo-astronaut")!;
    expect(alex.results).toHaveLength(30);
    expect(statuses("demo-astronaut")[29]).toBe("watch");

    const sam = statuses("demo-crew-2");
    expect(sam).toHaveLength(30);
    expect(sam.filter((status) => status === "watch" || status === "critical")).toHaveLength(0);
    expect(sam[29]).toBe("nominal");

    const mia = statuses("demo-crew-3");
    expect(mia).toHaveLength(30);
    expect(mia[29]).toBe("critical");
    const miaLatest = byId.get("demo-crew-3")!.results[29];
    expect(miaLatest.per_measure.find((entry) => entry.metric === "oxygen_saturation")?.status).toBe("critical");

    const leo = statuses("demo-crew-4");
    expect(leo).toHaveLength(8);
    expect(leo.slice(0, 3)).toEqual(["insufficient", "insufficient", "insufficient"]);
    expect(leo[7]).toBe("nominal");

    for (const seed of seeds) {
      for (const item of seed.measurements) {
        expect(item.crew_id).toBe(seed.crewId);
        expect(Date.parse(item.measured_at)).toBeLessThanOrEqual(nowMs);
      }
      for (const result of seed.results) {
        expect(result.crew_id).toBe(seed.crewId);
        expect(Date.parse(result.assessed_at)).toBeLessThanOrEqual(nowMs);
      }
    }
    const ids = seeds.flatMap((seed) => [
      ...seed.measurements.map((item) => item.client_id),
      ...seed.results.map((item) => item.client_id),
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  }, 180_000);

  it("gives each person their own readings with day-to-day variation", async () => {
    const nowMs = Date.parse("2026-11-09T18:00:00Z");
    const seeds = await buildCrewSeeds(nowMs, DHAKA, demoStories());
    const latestVitals = new Map(
      seeds.map((seed) => {
        const latest = seed.results[seed.results.length - 1];
        const vitals = latest.per_measure
          .map((entry) => `${entry.metric}=${String(entry.values.value)}`)
          .sort()
          .join("|");
        return [seed.crewId, vitals] as const;
      })
    );
    expect(new Set(latestVitals.values()).size).toBe(seeds.length);
    for (const seed of seeds) {
      const heartRates = seed.measurements
        .filter((item) => item.metric === "heart_rate")
        .map((item) => item.value_num);
      const masses = seed.measurements
        .filter((item) => item.metric === "body_mass")
        .map((item) => item.value_num);
      if (seed.results.length > 10) {
        // Long series vary day to day instead of flatlining.
        expect(new Set(heartRates).size).toBeGreaterThan(5);
        expect(new Set(masses).size).toBeGreaterThan(5);
      } else {
        // Leo joined days ago: an 8-point series still moves every few days.
        expect(new Set(heartRates).size).toBeGreaterThan(1);
        expect(new Set(masses).size).toBeGreaterThanOrEqual(5);
      }
    }
    const again = await buildCrewSeeds(nowMs, DHAKA, demoStories());
    expect(JSON.stringify(again)).toBe(JSON.stringify(seeds));
  }, 180_000);

  it("rounds seeded readings to display precision", async () => {
    const seed = await buildDemoSeed(Date.parse("2026-11-09T18:00:00Z"), DHAKA);
    for (const item of seed.measurements) {
      if (item.value_num === null) continue;
      const value: number = item.value_num;
      if (
        ["blood_pressure_systolic", "blood_pressure_diastolic", "heart_rate", "oxygen_saturation", "respiratory_rate", "blood_glucose"].includes(item.metric)
      ) {
        expect(Number.isInteger(value), item.metric).toBe(true);
      }
      if (item.metric === "temperature_c") {
        expect(Math.round(value * 10) / 10, item.metric).toBe(value);
      }
    }
  });
});

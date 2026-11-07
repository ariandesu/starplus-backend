import { describe, expect, it } from "vitest";
import { parseLimit, toD1Time, validateAstronaut, validateVitals } from "../src/validate";
import { computeSignal, parseD1Time, type Point } from "../src/watch";

const NOW = Date.parse("2026-11-07T12:00:00Z");
const HOUR = 3_600_000;

describe("validateVitals", () => {
  const now = new Date(NOW);

  it("accepts a valid reading and defaults the timestamp to now", () => {
    const r = validateVitals({ astronaut_id: "A-04", heart_rate: 72, oxygen_saturation: 98 }, now);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.heart_rate).toBe(72);
      expect(r.value.temperature_c).toBeNull();
      expect(r.value.timestamp).toBe("2026-11-07 12:00:00");
    }
  });

  it("rejects out-of-range, wrong-type and non-integer values", () => {
    const r = validateVitals(
      { astronaut_id: "A-04", heart_rate: 400, oxygen_saturation: "98", blood_pressure_systolic: 120.5, blood_pressure_diastolic: 80 },
      now
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors).toHaveLength(3);
  });

  it("requires at least one measurement and a valid id", () => {
    const r = validateVitals({ astronaut_id: "bad id; DROP" }, now);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/astronaut_id.*at least one/s);
  });

  it("requires both blood pressure values, with diastolic below systolic", () => {
    expect(validateVitals({ astronaut_id: "A", blood_pressure_systolic: 120 }, now).ok).toBe(false);
    expect(validateVitals({ astronaut_id: "A", blood_pressure_systolic: 80, blood_pressure_diastolic: 90 }, now).ok).toBe(false);
    expect(validateVitals({ astronaut_id: "A", blood_pressure_systolic: 120, blood_pressure_diastolic: 80 }, now).ok).toBe(true);
  });

  it("accepts a past timestamp for backfill but not a future one", () => {
    const past = validateVitals({ astronaut_id: "A", heart_rate: 70, timestamp: "2026-11-01T08:30:00Z" }, now);
    expect(past.ok && past.value.timestamp).toBe("2026-11-01 08:30:00");
    expect(validateVitals({ astronaut_id: "A", heart_rate: 70, timestamp: "2026-11-08T12:00:00Z" }, now).ok).toBe(false);
    expect(validateVitals({ astronaut_id: "A", heart_rate: 70, timestamp: "yesterday" }, now).ok).toBe(false);
  });
});

describe("validateAstronaut", () => {
  it("defaults status to active", () => {
    const r = validateAstronaut({ id: "A-04", name: " Lee ", role: "astronaut" });
    expect(r).toEqual({ ok: true, value: { id: "A-04", name: "Lee", role: "astronaut", status: "active" } });
  });

  it("rejects unknown roles", () => {
    expect(validateAstronaut({ id: "A-04", name: "Lee", role: "captain" }).ok).toBe(false);
  });
});

describe("helpers", () => {
  it("parseLimit clamps and falls back", () => {
    expect(parseLimit(null, 50, 500)).toBe(50);
    expect(parseLimit("10", 50, 500)).toBe(10);
    expect(parseLimit("9999", 50, 500)).toBe(500);
    expect(parseLimit("-1", 50, 500)).toBe(50);
    expect(parseLimit("abc", 50, 500)).toBe(50);
  });

  it("round-trips D1 timestamps", () => {
    expect(parseD1Time(toD1Time(new Date(NOW)))).toBe(NOW);
  });
});

/** Readings every `everyHours` from `fromHoursAgo` to `toHoursAgo`, with values from `fn`. */
function series(fromHoursAgo: number, toHoursAgo: number, everyHours: number, fn: (i: number) => number): Point[] {
  const pts: Point[] = [];
  for (let h = fromHoursAgo, i = 0; h >= toHoursAgo; h -= everyHours, i++) pts.push({ t: NOW - h * HOUR, value: fn(i) });
  return pts;
}

describe("computeSignal", () => {
  // Steady baseline around 70 bpm (+/- 2) from 30 days ago to 4 days ago.
  const baseline = series(29 * 24, 96, 12, (i) => 70 + ((i % 5) - 2));

  it("returns null without enough baseline", () => {
    expect(computeSignal("heart_rate", series(48, 0, 12, () => 70), NOW)).toBeNull();
  });

  it("returns null with no readings in the 72h window", () => {
    expect(computeSignal("heart_rate", baseline, NOW)).toBeNull();
  });

  it("is nominal when the window matches the baseline", () => {
    const s = computeSignal("heart_rate", [...baseline, ...series(60, 0, 12, (i) => 70 + ((i % 3) - 1))], NOW)!;
    expect(s.status).toBe("nominal");
    expect(Math.abs(s.moving_window_72h.deviation_pct)).toBeLessThan(3);
    expect(s.baseline_30d.n).toBeGreaterThanOrEqual(5);
  });

  it("flags WATCH on a moderate rise and CRITICAL on a large one", () => {
    const watch = computeSignal("heart_rate", [...baseline, ...series(60, 0, 12, () => 77)], NOW)!;
    expect(watch.status).toBe("watch");
    expect(watch.moving_window_72h.deviation_pct).toBeCloseTo(10, 0);

    const critical = computeSignal("heart_rate", [...baseline, ...series(60, 0, 12, () => 85)], NOW)!;
    expect(critical.status).toBe("critical");
  });

  it("applies absolute limits even when the baseline is equally bad", () => {
    const lowSpo2 = series(29 * 24, 96, 12, () => 88);
    const s = computeSignal("oxygen_saturation", [...lowSpo2, ...series(60, 0, 12, () => 88)], NOW)!;
    expect(s.moving_window_72h.z_score).toBe(0);
    expect(s.status).toBe("critical");
  });

  it("detects a rising trend within the window", () => {
    const s = computeSignal("heart_rate", [...baseline, ...series(66, 0, 6, (i) => 66 + i)], NOW)!;
    expect(s.moving_window_72h.trend).toBe("rising");
  });

  it("does not let readings older than 30 days into the baseline", () => {
    const ancient = series(60 * 24, 31 * 24, 12, () => 150);
    const s = computeSignal("heart_rate", [...ancient, ...baseline, ...series(60, 0, 12, () => 70)], NOW)!;
    expect(s.baseline_30d.max).toBeLessThan(80);
  });
});

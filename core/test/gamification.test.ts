import { describe, expect, it } from "vitest";
import {
  patchesForStreak,
  scoreDays,
  shiftDay,
  streakDays,
} from "../src/gamification.ts";
import type { Measurement } from "../src/record.ts";

let sequence = 0;
const uuid = () => `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`;

function measurement(metric: string, measured_at: string, overrides: Partial<Measurement> = {}): Measurement {
  return {
    client_id: uuid(),
    crew_id: "crew-01",
    metric,
    value_num: 1,
    value_text: null,
    unit: "x",
    measured_at,
    received_at: "",
    source: "manual",
    device_id: "device-01",
    capture_id: null,
    is_estimate: 0,
    confirmed_by_user: 0,
    provenance: "real",
    setting: "iss",
    phase: "inflight",
    phase_day: 21,
    supersedes_client_id: null,
    voided: 0,
    catalog_version: "1",
    schema_version: 1,
    ...overrides,
  };
}

describe("scoreDays", () => {
  it("awards one point each for check-in, exercise, sleep and hydration", () => {
    const exercise = measurement("physical_activity", "2026-11-08T08:00:00Z");
    const sleep = measurement("sleep_hours", "2026-11-08T09:00:00Z");
    const water = measurement("water_intake", "2026-11-08T10:00:00Z");
    const days = scoreDays(
      [exercise, sleep, water],
      [
        {
          assessed_at: "2026-11-08T11:00:00Z",
          per_measure: [{ values: { client_id: exercise.client_id } }],
        },
      ]
    );
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({
      day: "2026-11-08",
      checkIn: true,
      exercise: true,
      sleep: true,
      hydration: true,
      points: 4,
    });
  });

  it("gives no points for estimates, synthetic or simulated_device provenance", () => {
    const days = scoreDays(
      [
        measurement("physical_activity", "2026-11-08T08:00:00Z", { is_estimate: 1 }),
        measurement("sleep_hours", "2026-11-08T09:00:00Z", { provenance: "synthetic" }),
        measurement("water_intake", "2026-11-08T10:00:00Z", { provenance: "simulated_device" }),
      ],
      []
    );
    expect(days).toEqual([]);
  });

  it("gives no points for voided measurements", () => {
    const days = scoreDays(
      [measurement("physical_activity", "2026-11-08T08:00:00Z", { voided: 1 })],
      []
    );
    expect(days).toEqual([]);
  });

  it("counts a check-in whatever the result status was", () => {
    const heart = measurement("heart_rate", "2026-11-08T11:00:00Z");
    const days = scoreDays(
      [heart],
      [
        {
          assessed_at: "2026-11-08T11:00:00Z",
          per_measure: [{ values: { client_id: heart.client_id } }],
        },
      ],
      {}
    );
    expect(days[0].checkIn).toBe(true);
    expect(days[0].points).toBe(1);
  });

  it("ignores a check-in built only from ineligible readings", () => {
    const estimate = measurement("heart_rate", "2026-11-08T11:00:00Z", { is_estimate: 1 });
    const synthetic = measurement("heart_rate", "2026-11-08T11:05:00Z", { provenance: "synthetic" });
    const days = scoreDays(
      [estimate, synthetic],
      [
        {
          assessed_at: "2026-11-08T12:00:00Z",
          per_measure: [
            { values: { client_id: estimate.client_id } },
            { values: { client_id: synthetic.client_id } },
          ],
        },
        { assessed_at: "2026-11-08T13:00:00Z", per_measure: [] },
      ]
    );
    expect(days).toEqual([]);
  });

  it("counts synthetic readings with includeSynthetic for the demo view", () => {
    const synthetic = measurement("sleep_hours", "2026-11-08T09:00:00Z", { provenance: "synthetic" });
    const checkIn = {
      assessed_at: "2026-11-08T11:00:00Z",
      per_measure: [{ values: { client_id: synthetic.client_id } }],
    };
    expect(scoreDays([synthetic], [checkIn])).toEqual([]);
    const days = scoreDays([synthetic], [checkIn], { includeSynthetic: true });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ checkIn: true, sleep: true, points: 2 });
  });

  it("accepts sleep_quality and urine_specific_gravity as sleep and hydration", () => {
    const days = scoreDays(
      [
        measurement("sleep_quality", "2026-11-08T09:00:00Z"),
        measurement("urine_specific_gravity", "2026-11-08T10:00:00Z"),
      ],
      []
    );
    expect(days[0]).toMatchObject({ sleep: true, hydration: true, points: 2 });
  });

  it("buckets days by local time zone", () => {
    const sleep = measurement("sleep_hours", "2026-11-08T00:30:00Z");
    const days = scoreDays(
      [sleep],
      [{ assessed_at: "2026-11-08T00:30:00Z", per_measure: [{ values: { client_id: sleep.client_id } }] }],
      { timeZone: "America/New_York" }
    );
    expect(days[0].day).toBe("2026-11-07");
  });
});

describe("streakDays", () => {
  it("counts consecutive active days", () => {
    expect(streakDays(["2026-11-06", "2026-11-07", "2026-11-08"], "2026-11-08")).toBe(3);
  });

  it("does not break when today has no activity yet", () => {
    expect(streakDays(["2026-11-06", "2026-11-07"], "2026-11-08")).toBe(2);
  });

  it("allows one rest day per week", () => {
    expect(
      streakDays(
        ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-06", "2026-11-07", "2026-11-08"],
        "2026-11-08"
      )
    ).toBe(6);
  });

  it("breaks on a second miss in the same week", () => {
    expect(streakDays(["2026-11-06", "2026-11-08"], "2026-11-08", 0)).toBe(1);
    expect(streakDays(["2026-11-05", "2026-11-06", "2026-11-08"], "2026-11-08")).toBe(3);
    expect(streakDays(["2026-11-04", "2026-11-06", "2026-11-08"], "2026-11-08")).toBe(2);
  });

  it("returns zero for no activity", () => {
    expect(streakDays([], "2026-11-08")).toBe(0);
  });

  it("resets the rest budget each week", () => {
    const active: string[] = [];
    let cursor = "2026-11-08";
    for (let i = 0; i < 14; i++) {
      if (i !== 3 && i !== 10) active.push(cursor);
      cursor = shiftDay(cursor, -1);
    }
    expect(streakDays(active, "2026-11-08")).toBe(12);
  });
});

describe("patchesForStreak", () => {
  it("unlocks patches at 7, 14, 30 and 90 days", () => {
    expect(patchesForStreak(6)).toEqual([]);
    expect(patchesForStreak(7).map((p) => p.id)).toEqual(["first-week"]);
    expect(patchesForStreak(30).map((p) => p.id)).toEqual(["first-week", "fortnight", "lunar-month"]);
    expect(patchesForStreak(90)).toHaveLength(4);
  });
});

import { describe, expect, it } from "vitest";
import { assess, inputsHash, type AssessContext } from "../src/assess.ts";
import { lookupMeasure } from "../src/catalog.ts";
import type { Measurement } from "../src/record.ts";

const NOW = Date.parse("2026-11-08T12:00:00Z");
const HOUR = 3_600_000;

let sequence = 0;

function measurement(
  metric: string,
  value: number,
  hoursAgo: number,
  overrides: Partial<Measurement> = {}
): Measurement {
  const measure = lookupMeasure(metric)!;
  sequence += 1;
  return {
    client_id: `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`,
    crew_id: "crew-01",
    metric,
    value_num: value,
    value_text: null,
    unit: measure.unit,
    measured_at: new Date(NOW - hoursAgo * HOUR).toISOString(),
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

function context(overrides: Partial<AssessContext> = {}): AssessContext {
  return { now: NOW, phase: "inflight", ...overrides };
}

const BASELINE_HOURS = [696, 600, 500, 400, 300, 200, 150, 100];
const baseline = (metric: string, value: number): Measurement[] =>
  BASELINE_HOURS.map((hours) => measurement(metric, value, hours));
const windowAt = (metric: string, value: number): Measurement[] =>
  [60, 48, 36, 24, 12, 1].map((hours) => measurement(metric, value, hours));

describe("colour rule", () => {
  it("a critical SpO2 with no baseline is critical", async () => {
    const result = await assess([measurement("oxygen_saturation", 88, 1)], context());
    expect(result.overall_status).toBe("critical");
    expect(result.per_measure[0].reason_code).toBe("limit_critical");
  });

  it("an inside-limits reading with no baseline is grey", async () => {
    const result = await assess([measurement("oxygen_saturation", 97, 1)], context());
    expect(result.overall_status).toBe("insufficient");
    expect(result.per_measure[0].reason_code).toBe("insufficient_baseline");
  });

  it("systolic 140 is watch and 180 is critical", async () => {
    const watch = await assess([measurement("blood_pressure_systolic", 140, 1)], context());
    expect(watch.overall_status).toBe("watch");
    expect(watch.per_measure[0].reason_code).toBe("limit_watch");
    const critical = await assess([measurement("blood_pressure_systolic", 180, 1)], context());
    expect(critical.overall_status).toBe("critical");
  });

  it("limits beat the baseline and the baseline never lowers a limit", async () => {
    const history = [...baseline("heart_rate", 70), ...windowAt("heart_rate", 70)];
    const latest = measurement("heart_rate", 190, 0.5);
    const result = await assess([...history, latest], context());
    expect(result.overall_status).toBe("critical");
    expect(result.per_measure[0].reason_code).toBe("limit_critical");
    const watchLatest = measurement("blood_pressure_systolic", 145, 0.5);
    const watchResult = await assess(
      [...baseline("blood_pressure_systolic", 118), ...windowAt("blood_pressure_systolic", 118), watchLatest],
      context()
    );
    expect(watchResult.overall_status).toBe("watch");
    expect(watchResult.per_measure[0].reason_code).toBe("limit_watch");
  });

  it("the baseline raises nominal readings to watch and critical", async () => {
    const watch = await assess(
      [...baseline("heart_rate", 70), ...windowAt("heart_rate", 77)],
      context()
    );
    expect(watch.overall_status).toBe("watch");
    expect(watch.per_measure[0].reason_code).toBe("baseline_watch");
    const critical = await assess(
      [...baseline("heart_rate", 70), ...windowAt("heart_rate", 85)],
      context()
    );
    expect(critical.overall_status).toBe("critical");
    expect(critical.per_measure[0].reason_code).toBe("baseline_critical");
  });

  it("applies phase offsets to the baseline mean", async () => {
    const systolic = lookupMeasure("blood_pressure_systolic")!;
    const shifted = {
      ...systolic,
      phase_offsets: { preflight: { baseline_shift: 0 }, inflight: { baseline_shift: -14 } },
    };
    const lookup = (code: string) => (code === shifted.code ? shifted : lookupMeasure(code));
    const oldPhase = BASELINE_HOURS.map((hours) =>
      measurement("blood_pressure_systolic", 132, hours, { phase: "preflight" })
    );
    const current = [60, 48, 36, 24, 12, 1].map((hours) =>
      measurement("blood_pressure_systolic", 118, hours, { phase: "inflight" })
    );
    const result = await assess([...oldPhase, ...current], context(), lookup);
    expect(result.overall_status).toBe("nominal");
    expect(result.per_measure[0].reason_code).toBe("within_limits");
  });

  it("ignores voided readings", async () => {
    const good = measurement("oxygen_saturation", 97, 2);
    const bad = measurement("oxygen_saturation", 80, 1, { voided: 1 });
    const result = await assess([good, bad], context());
    expect(result.overall_status).toBe("insufficient");
  });

  it("flags an unconfirmed abnormal estimate and clears it on confirmation", async () => {
    const estimate = measurement("heart_rate", 128, 1, { is_estimate: 1 });
    const flagged = await assess([estimate], context());
    expect(flagged.per_measure[0].reason_code).toBe("estimate_abnormal");
    expect(flagged.per_measure[0].values.confirm_required).toBe(true);
    const confirmed = await assess(
      [measurement("heart_rate", 128, 1, { is_estimate: 1, confirmed_by_user: 1 })],
      context()
    );
    expect(confirmed.per_measure[0].reason_code).toBe("limit_watch");
    expect(confirmed.per_measure[0].values.confirm_required).toBe(false);
  });

  it("keeps a refuted estimate without changing the colour", async () => {
    const estimate = measurement("heart_rate", 128, 3, { is_estimate: 1 });
    const device = measurement("heart_rate", 72, 1, { supersedes_client_id: estimate.client_id });
    const result = await assess([estimate, device], context());
    expect(result.overall_status).toBe("nominal");
    expect(result.per_measure.some((entry) => entry.reason_code === "refuted_estimate")).toBe(true);
  });

  it("the model never changes a colour", async () => {
    const model = { probability: 0.9, model_version: "m1", model_id: "test", threshold_watch: 0.5 };
    const nominal = await assess([measurement("heart_rate", 72, 1)], context({ model }));
    expect(nominal.overall_status).toBe("insufficient");
    expect(nominal.model_advice?.disagrees).toBe(true);
    const watchModel = { probability: 0.1, model_version: "m1", model_id: "test", threshold_watch: 0.5 };
    const watch = await assess(
      [measurement("blood_pressure_systolic", 145, 1)],
      context({ model: watchModel })
    );
    expect(watch.overall_status).toBe("watch");
    expect(watch.model_advice?.disagrees).toBe(true);
    const agree = await assess(
      [measurement("blood_pressure_systolic", 145, 1)],
      context({ model })
    );
    expect(agree.model_advice?.disagrees).toBe(false);
    const none = await assess([measurement("heart_rate", 72, 1)], context());
    expect(none.model_advice).toBeNull();
    expect(none.model_id).toBe("none");
  });

  it("inputs_hash is stable across ordering", async () => {
    const a = measurement("heart_rate", 72, 2);
    const b = measurement("heart_rate", 74, 1);
    const first = await inputsHash([a.client_id, b.client_id]);
    const second = await inputsHash([b.client_id, a.client_id]);
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it("assesses 300 readings in under 300 ms", async () => {
    const history: Measurement[] = [];
    for (let i = 0; i < 300; i++) {
      history.push(measurement("heart_rate", 70 + (i % 5), 700 - i * 2));
    }
    const start = performance.now();
    await assess(history, context());
    expect(performance.now() - start).toBeLessThan(300);
  });
});

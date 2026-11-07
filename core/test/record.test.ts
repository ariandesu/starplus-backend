import { describe, expect, it } from "vitest";
import {
  normalise,
  validateCapture,
  validateRecord,
  type Measurement,
} from "../src/record.ts";

const CONTEXT = {
  crew_id: "crew-01",
  device_id: "device-01",
  setting: "iss" as const,
  phase: "inflight" as const,
  provenance: "real" as const,
};

function record(overrides: Partial<Measurement> = {}): Measurement {
  const base = normalise(
    { metric: "heart_rate", value: 72, unit: "bpm", source: "manual", confidence: 1 },
    { ...CONTEXT, measured_at: "2026-11-08T12:00:00Z" }
  );
  if (!base.ok) throw new Error("fixture failed");
  return { ...base.value, ...overrides };
}

describe("normalise", () => {
  it("resolves aliases and converts units", () => {
    const out = normalise(
      { metric: "heart_rate_bpm", value: 72, unit: "bpm", source: "manual", confidence: 1 },
      CONTEXT
    );
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.value.metric).toBe("heart_rate");
      expect(out.value.is_estimate).toBe(0);
    }
    const weight = normalise(
      { metric: "body_mass", value: 154.324, unit: "lb", source: "manual", confidence: 1 },
      CONTEXT
    );
    expect(weight.ok).toBe(true);
    if (weight.ok) {
      expect(weight.value.unit).toBe("kg");
      expect(weight.value.value_num).toBeCloseTo(70, 2);
    }
  });

  it("marks low confidence as estimate", () => {
    const out = normalise(
      { metric: "heart_rate", value: 128, unit: "bpm", source: "manual", confidence: 0.4 },
      CONTEXT
    );
    expect(out.ok && out.value.is_estimate).toBe(1);
  });

  it("rejects unknown metrics, bad units and out-of-bounds values", () => {
    expect(normalise({ metric: "nope", value: 1, unit: "x", source: "manual", confidence: 1 }, CONTEXT).ok).toBe(
      false
    );
    expect(
      normalise({ metric: "heart_rate", value: 72, unit: "furlongs", source: "manual", confidence: 1 }, CONTEXT)
        .ok
    ).toBe(false);
    expect(
      normalise({ metric: "heart_rate", value: 400, unit: "bpm", source: "manual", confidence: 1 }, CONTEXT).ok
    ).toBe(false);
  });
});

describe("validateRecord", () => {
  it("accepts a normalised record", () => {
    expect(validateRecord(record()).ok).toBe(true);
  });

  it("requires a UUID client_id and a provenance", () => {
    expect(validateRecord({ ...record(), client_id: "not-a-uuid" }).ok).toBe(false);
    const missing = { ...record() } as Record<string, unknown>;
    delete missing.provenance;
    expect(validateRecord(missing).ok).toBe(false);
    expect(validateRecord({ ...record(), provenance: "fake" }).ok).toBe(false);
  });

  it("enforces bounds and canonical units", () => {
    expect(validateRecord({ ...record(), value_num: 400 }).ok).toBe(false);
    expect(validateRecord({ ...record(), unit: "lb" }).ok).toBe(false);
  });
});

describe("validateCapture", () => {
  it("pairs systolic above diastolic within a capture", () => {
    const sys = record({ metric: "blood_pressure_systolic", value_num: 146, capture_id: "cap-1" });
    const dia = record({ metric: "blood_pressure_diastolic", value_num: 92, capture_id: "cap-1" });
    expect(validateCapture([sys, dia]).ok).toBe(true);
  });

  it("rejects a lone systolic and an inverted pair", () => {
    const sys = record({ metric: "blood_pressure_systolic", value_num: 120, capture_id: "cap-1" });
    expect(validateCapture([sys]).ok).toBe(false);
    const dia = record({ metric: "blood_pressure_diastolic", value_num: 130, capture_id: "cap-1" });
    expect(validateCapture([sys, dia]).ok).toBe(false);
  });
});

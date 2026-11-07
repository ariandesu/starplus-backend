import { describe, expect, it } from "vitest";
import { loadModel, predict, type ModelDefinition } from "../src/model.ts";

function toyModel(): ModelDefinition {
  return {
    contract_version: 1,
    model_id: "toy",
    model_version: "0.0.1",
    kind: "logistic",
    inputs: [
      { metric: "heart_rate", unit: "bpm", feature: "latest" },
      { metric: "heart_rate", unit: "bpm", feature: "baseline_z" },
    ],
    intercept: -2,
    coefficients: [0.05, 1.5],
    scaler: { mean: [70, 0], sd: [10, 2] },
    output: { threshold_watch: 0.5, threshold_critical: 0.8 },
    training_data: { source: "unit-test", provenance: "synthetic", rows: 4, evaluation: {} },
    reference_cases: [
      { features: { "heart_rate:latest": 70, "heart_rate:baseline_z": 0 }, expected: 1 / (1 + Math.exp(2)) },
      { features: { "heart_rate:latest": 110, "heart_rate:baseline_z": 3 }, expected: 0.6106392339492221 },
    ],
  };
}

describe("model", () => {
  it("loads a valid model and predicts the logistic function", () => {
    const loaded = loadModel(toyModel());
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.model.threshold_watch).toBe(0.5);
      const probability = predict(loaded.model.definition, {
        "heart_rate:latest": 110,
        "heart_rate:baseline_z": 3,
      });
      expect(probability).toBeCloseTo(0.6106, 3);
    }
  });

  it("rejects bad schemas, unknown inputs and constant predictions", () => {
    expect(loadModel({}).ok).toBe(false);
    expect(loadModel({ ...toyModel(), kind: "forest" }).ok).toBe(false);
    expect(loadModel({ ...toyModel(), inputs: [{ metric: "nope", unit: "x", feature: "latest" }] }).ok).toBe(
      false
    );
    const constant = toyModel();
    constant.intercept = 0;
    constant.coefficients = [0, 0];
    constant.reference_cases = [
      { features: { "heart_rate:latest": 70, "heart_rate:baseline_z": 0 }, expected: 0.5 },
      { features: { "heart_rate:latest": 110, "heart_rate:baseline_z": 3 }, expected: 0.5 },
    ];
    expect(loadModel(constant).ok).toBe(false);
  });

  it("rejects reference cases that do not reproduce", () => {
    const drifted = toyModel();
    drifted.reference_cases = [
      { features: { "heart_rate:latest": 70, "heart_rate:baseline_z": 0 }, expected: 0.99 },
    ];
    const loaded = loadModel(drifted);
    expect(loaded.ok).toBe(false);
  });
});

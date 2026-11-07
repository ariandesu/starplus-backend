import { lookupMeasure } from "./catalog.ts";

export interface ModelInput {
  metric: string;
  unit: string;
  feature: "latest" | "baseline_z";
}

export interface ModelDefinition {
  contract_version: number;
  model_id: string;
  model_version: string;
  kind: string;
  inputs: ModelInput[];
  intercept: number;
  coefficients: number[];
  scaler: { mean: number[]; sd: number[] };
  output: { threshold_watch: number; threshold_critical: number };
  training_data: {
    source: string;
    provenance: string;
    rows: number;
    evaluation: unknown;
  };
  reference_cases: Array<{ features: Record<string, number>; expected: number }>;
}

export interface LoadedModel {
  definition: ModelDefinition;
  threshold_watch: number;
}

export function featureKey(metric: string, feature: string): string {
  return `${metric}:${feature}`;
}

export function predict(model: ModelDefinition, features: Record<string, number>): number {
  let logit = model.intercept;
  model.inputs.forEach((input, index) => {
    const raw = features[featureKey(input.metric, input.feature)] ?? 0;
    const spread = model.scaler.sd[index] === 0 ? 1 : model.scaler.sd[index];
    logit += model.coefficients[index] * ((raw - model.scaler.mean[index]) / spread);
  });
  return 1 / (1 + Math.exp(-logit));
}

export function loadModel(raw: unknown): { ok: true; model: LoadedModel } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "model must be an object" };
  const def = raw as Record<string, unknown>;
  if (!Number.isInteger(def.contract_version)) return { ok: false, reason: "contract_version must be an integer" };
  if (typeof def.model_id !== "string" || def.model_id.length === 0) {
    return { ok: false, reason: "model_id must be a non-empty string" };
  }
  if (typeof def.model_version !== "string" || def.model_version.length === 0) {
    return { ok: false, reason: "model_version must be a non-empty string" };
  }
  if (def.kind !== "logistic") return { ok: false, reason: "kind must be 'logistic'" };
  if (!Array.isArray(def.inputs) || def.inputs.length === 0) {
    return { ok: false, reason: "inputs must be a non-empty array" };
  }
  for (const input of def.inputs as Array<Record<string, unknown>>) {
    if (typeof input.metric !== "string" || !lookupMeasure(input.metric)) {
      return { ok: false, reason: `input metric '${String(input.metric)}' is not in the catalog` };
    }
    if (input.feature !== "latest" && input.feature !== "baseline_z") {
      return { ok: false, reason: `input feature for '${input.metric}' must be latest or baseline_z` };
    }
  }
  const count = (def.inputs as unknown[]).length;
  if (typeof def.intercept !== "number") return { ok: false, reason: "intercept must be a number" };
  if (!Array.isArray(def.coefficients) || def.coefficients.length !== count) {
    return { ok: false, reason: "coefficients must match inputs" };
  }
  const scaler = def.scaler as { mean?: unknown; sd?: unknown } | undefined;
  if (!Array.isArray(scaler?.mean) || scaler.mean.length !== count || !Array.isArray(scaler?.sd) || scaler.sd.length !== count) {
    return { ok: false, reason: "scaler mean and sd must match inputs" };
  }
  const output = def.output as { threshold_watch?: unknown; threshold_critical?: unknown } | undefined;
  if (typeof output?.threshold_watch !== "number" || typeof output?.threshold_critical !== "number") {
    return { ok: false, reason: "output thresholds must be numbers" };
  }
  const training = def.training_data as { provenance?: unknown } | undefined;
  if (typeof training?.provenance !== "string") return { ok: false, reason: "training_data.provenance is required" };
  if (!Array.isArray(def.reference_cases) || def.reference_cases.length === 0) {
    return { ok: false, reason: "reference_cases must be a non-empty array" };
  }
  const model = def as unknown as ModelDefinition;
  const predictions: number[] = [];
  for (const [index, reference] of model.reference_cases.entries()) {
    const produced = predict(model, reference.features);
    predictions.push(produced);
    if (Math.abs(produced - reference.expected) > 0.001) {
      return { ok: false, reason: `reference case ${index} differs by more than 0.001` };
    }
  }
  if (Math.max(...predictions) - Math.min(...predictions) < 1e-9) {
    return { ok: false, reason: "reference predictions are constant" };
  }
  return {
    ok: true,
    model: { definition: model, threshold_watch: model.output.threshold_watch },
  };
}

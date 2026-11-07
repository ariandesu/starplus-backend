import {
  PROVENANCES,
  SETTINGS,
  PHASES,
  SOURCES,
  lookupMeasure,
  convertToCanonical,
  catalogVersion,
  type CatalogMeasure,
  type Phase,
  type Provenance,
  type Setting,
  type Source,
} from "./catalog.ts";

export const SCHEMA_VERSION = 1;

export interface Draft {
  metric: string;
  value: number | string;
  unit: string;
  source: Source;
  confidence: number;
  raw?: unknown;
  capture_id?: string;
  measured_at?: string;
}

export interface NormaliseContext {
  crew_id: string;
  device_id: string;
  setting: Setting;
  phase: Phase;
  phase_day?: number;
  measured_at?: string;
  provenance: Provenance;
  confirmed_by_user?: boolean;
}

export interface Measurement {
  client_id: string;
  crew_id: string;
  metric: string;
  value_num: number | null;
  value_text: string | null;
  unit: string;
  measured_at: string;
  received_at: string;
  source: Source;
  device_id: string;
  capture_id: string | null;
  is_estimate: 0 | 1;
  confirmed_by_user: 0 | 1;
  provenance: Provenance;
  setting: Setting;
  phase: Phase;
  phase_day: number | null;
  supersedes_client_id: string | null;
  voided: 0 | 1;
  catalog_version: string;
  schema_version: number;
}

export type OverallStatus = "insufficient" | "nominal" | "watch" | "critical";
export type ReasonCode =
  | "limit_watch"
  | "limit_critical"
  | "baseline_watch"
  | "baseline_critical"
  | "within_limits"
  | "insufficient_baseline"
  | "estimate_abnormal"
  | "refuted_estimate";

export interface PerMeasureResult {
  metric: string;
  status: OverallStatus;
  status_source: "safety_limit" | "personal_baseline";
  reason_code: ReasonCode;
  values: {
    value: number | string | null;
    unit: string;
    client_id: string;
    baseline_mean: number | null;
    baseline_n: number;
    window_mean: number | null;
    z_score: number | null;
    trend: "rising" | "falling" | "stable" | null;
    confirm_required: boolean;
  };
}

export interface ModelAdvice {
  probability: number;
  model_version: string;
  disagrees: boolean;
}

export interface Result {
  client_id: string;
  crew_id: string;
  assessed_at: string;
  overall_status: OverallStatus;
  per_measure: PerMeasureResult[];
  model_advice: ModelAdvice | null;
  model_id: string;
  model_version: string;
  catalog_version: string;
  kb_version: string;
  inputs_hash: string;
  received_at: string;
}

export interface Report {
  client_id: string;
  device_id: string;
  submitted_by: string;
  subject_crew_id: string | null;
  subject_label: string | null;
  kind: "emergency" | "routine";
  created_at: string;
  received_at: string;
  payload_json: string;
  summary_text: string | null;
  summary_edited: 0 | 1;
  status: "delivered" | "acknowledged";
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUUID(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function normalise(
  draft: Draft,
  context: NormaliseContext
): { ok: true; value: Measurement } | { ok: false; reasons: string[] } {
  const measure = lookupMeasure(draft.metric);
  if (!measure) return { ok: false, reasons: [`unknown metric '${draft.metric}'`] };
  if (typeof draft.confidence !== "number" || draft.confidence < 0 || draft.confidence > 1) {
    return { ok: false, reasons: ["confidence must be between 0 and 1"] };
  }
  let value_num: number | null = null;
  let value_text: string | null = null;
  if (typeof draft.value === "number") {
    const converted = convertToCanonical(draft.value, draft.unit, measure);
    if (converted === null || !Number.isFinite(converted)) {
      return { ok: false, reasons: [`cannot convert '${draft.unit}' to '${measure.unit}'`] };
    }
    value_num = converted;
  } else if (typeof draft.value === "string") {
    value_text = draft.value;
  } else {
    return { ok: false, reasons: ["value must be a number or string"] };
  }
  if (measure.value_type === "numeric" && value_num === null) {
    return { ok: false, reasons: [`measure '${measure.code}' needs a numeric value`] };
  }
  if (value_num !== null && (value_num < measure.bounds.min || value_num > measure.bounds.max)) {
    return { ok: false, reasons: [`value out of bounds for '${measure.code}'`] };
  }
  if (!SOURCES.includes(draft.source)) return { ok: false, reasons: [`unknown source '${draft.source}'`] };
  if (!PROVENANCES.includes(context.provenance)) {
    return { ok: false, reasons: ["provenance is required"] };
  }
  const measured_at = context.measured_at ?? new Date().toISOString();
  if (Number.isNaN(Date.parse(measured_at))) return { ok: false, reasons: ["measured_at must be ISO 8601"] };
  return {
    ok: true,
    value: {
      client_id: crypto.randomUUID(),
      crew_id: context.crew_id,
      metric: measure.code,
      value_num,
      value_text,
      unit: measure.unit,
      measured_at,
      received_at: "",
      source: draft.source,
      device_id: context.device_id,
      capture_id: draft.capture_id ?? null,
      is_estimate: draft.confidence < 1 ? 1 : 0,
      confirmed_by_user: context.confirmed_by_user === true ? 1 : 0,
      provenance: context.provenance,
      setting: context.setting,
      phase: context.phase,
      phase_day: context.phase_day ?? null,
      supersedes_client_id: null,
      voided: 0,
      catalog_version: catalogVersion,
      schema_version: SCHEMA_VERSION,
    },
  };
}

export function validateRecord(
  raw: unknown
): { ok: true; value: Measurement } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (typeof raw !== "object" || raw === null) return { ok: false, reasons: ["record must be an object"] };
  const record = raw as Record<string, unknown>;
  if (!isUUID(record.client_id)) reasons.push("client_id must be a UUID");
  if (typeof record.crew_id !== "string" || record.crew_id.length === 0) reasons.push("crew_id is required");
  const measure: CatalogMeasure | null =
    typeof record.metric === "string" ? lookupMeasure(record.metric) : null;
  if (!measure) reasons.push(`unknown metric '${String(record.metric)}'`);
  if (measure) {
    if (measure.value_type === "numeric") {
      if (typeof record.value_num !== "number" || !Number.isFinite(record.value_num)) {
        reasons.push(`value_num must be finite for '${measure.code}'`);
      } else if (record.value_num < measure.bounds.min || record.value_num > measure.bounds.max) {
        reasons.push(`value out of bounds for '${measure.code}'`);
      }
      if (record.value_text !== null) reasons.push("value_text must be null for numeric measures");
    }
    if (record.unit !== measure.unit) reasons.push(`unit must be '${measure.unit}' for '${measure.code}'`);
  }
  if (typeof record.measured_at !== "string" || Number.isNaN(Date.parse(record.measured_at))) {
    reasons.push("measured_at must be ISO 8601");
  }
  if (typeof record.received_at !== "string") reasons.push("received_at must be a string");
  if (!SOURCES.includes(record.source as Source)) reasons.push("unknown source");
  if (typeof record.device_id !== "string" || record.device_id.length === 0) reasons.push("device_id is required");
  if (record.capture_id !== null && typeof record.capture_id !== "string") reasons.push("capture_id must be a string or null");
  for (const flag of ["is_estimate", "confirmed_by_user", "voided"] as const) {
    if (record[flag] !== 0 && record[flag] !== 1) reasons.push(`${flag} must be 0 or 1`);
  }
  if (!PROVENANCES.includes(record.provenance as Provenance)) reasons.push("provenance is required");
  if (!SETTINGS.includes(record.setting as Setting)) reasons.push("unknown setting");
  if (!PHASES.includes(record.phase as Phase)) reasons.push("unknown phase");
  if (record.phase_day !== null && (!Number.isInteger(record.phase_day) || (record.phase_day as number) < -500 || (record.phase_day as number) > 2000)) {
    reasons.push("phase_day must be null or an integer day number");
  }
  if (record.supersedes_client_id !== null && !isUUID(record.supersedes_client_id)) {
    reasons.push("supersedes_client_id must be a UUID or null");
  }
  if (typeof record.catalog_version !== "string" || record.catalog_version.length === 0) {
    reasons.push("catalog_version is required");
  }
  if (record.schema_version !== SCHEMA_VERSION) reasons.push(`schema_version must be ${SCHEMA_VERSION}`);
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true, value: raw as Measurement };
}

export function validateCapture(
  records: Measurement[]
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const groups = new Map<string, Measurement[]>();
  for (const record of records) {
    if (record.capture_id === null) continue;
    const group = groups.get(record.capture_id) ?? [];
    group.push(record);
    groups.set(record.capture_id, group);
  }
  for (const [capture_id, group] of groups) {
    const systolic = group
      .filter((record) => record.metric === "blood_pressure_systolic")
      .map((record) => record.value_num ?? NaN);
    const diastolic = group
      .filter((record) => record.metric === "blood_pressure_diastolic")
      .map((record) => record.value_num ?? NaN);
    if (systolic.length > 0 || diastolic.length > 0) {
      if (systolic.length === 0 || diastolic.length === 0) {
        reasons.push(`capture '${capture_id}': systolic and diastolic go together`);
        continue;
      }
      if (!(Math.min(...systolic) > Math.max(...diastolic))) {
        reasons.push(`capture '${capture_id}': systolic must be above diastolic`);
      }
    }
  }
  if (reasons.length > 0) return { ok: false, reasons };
  return { ok: true };
}

import {
  KB_VERSION,
  catalogVersion,
  lookupMeasure,
  sdFloorFor,
  type CatalogMeasure,
  type Phase,
} from "./catalog.ts";
import type { Measurement, ModelAdvice, OverallStatus, PerMeasureResult, ReasonCode, Result } from "./record.ts";

export interface AssessModelInput {
  probability: number;
  model_version: string;
  model_id: string;
  threshold_watch: number;
}

export interface AssessContext {
  now: number;
  phase: Phase;
  model?: AssessModelInput | null;
}

const DAY_MS = 86_400_000;

function limitStatus(
  measure: CatalogMeasure,
  value: number
): { status: OverallStatus; reason: ReasonCode } | null {
  const hit = (level: string): boolean =>
    measure.limits.some(
      (limit) =>
        limit.level === level &&
        ((limit.op === "<" && value < limit.value) ||
          (limit.op === "<=" && value <= limit.value) ||
          (limit.op === ">" && value > limit.value) ||
          (limit.op === ">=" && value >= limit.value)) &&
        (limit.max === undefined || value <= limit.max)
    );
  if (hit("critical")) return { status: "critical", reason: "limit_critical" };
  if (hit("watch")) return { status: "watch", reason: "limit_watch" };
  return null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sd(values: number[], avg: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function shiftFor(measure: CatalogMeasure, phase: string): number {
  return measure.phase_offsets[phase]?.baseline_shift ?? 0;
}

export async function inputsHash(clientIds: string[]): Promise<string> {
  const sorted = [...clientIds].sort().join(",");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sorted));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function assess(
  history: Measurement[],
  context: AssessContext,
  lookup: (code: string) => CatalogMeasure | null = lookupMeasure
): Promise<Result> {
  const now = context.now;
  const crew_ids = [...new Set(history.map((record) => record.crew_id))];
  const crew_id = crew_ids.length === 1 ? crew_ids[0] : (crew_ids[0] ?? "unknown");

  const superseded = new Set<string>();
  for (const record of history) {
    if (record.voided === 0 && record.supersedes_client_id !== null) {
      superseded.add(record.supersedes_client_id);
    }
  }
  const live = history.filter((record) => record.voided === 0 && !superseded.has(record.client_id));

  const byMetric = new Map<string, Measurement[]>();
  for (const record of live) {
    const group = byMetric.get(record.metric) ?? [];
    group.push(record);
    byMetric.set(record.metric, group);
  }

  const refutedByMetric = new Map<string, Array<{ client_id: string; value: number | string }>>();
  for (const record of history) {
    if (
      record.voided !== 0 ||
      !superseded.has(record.client_id) ||
      record.is_estimate !== 1 ||
      record.value_num === null
    ) {
      continue;
    }
    const measure = lookup(record.metric);
    if (!measure) continue;
    const hit = limitStatus(measure, record.value_num);
    if (hit === null || hit.status === "nominal") continue;
    const group = refutedByMetric.get(record.metric) ?? [];
    group.push({ client_id: record.client_id, value: record.value_num });
    refutedByMetric.set(record.metric, group);
  }

  const per_measure: PerMeasureResult[] = [];

  for (const [metric, records] of byMetric) {
    const measure = lookup(metric);
    if (!measure) continue;
    const ordered = [...records].sort((a, b) => Date.parse(a.measured_at) - Date.parse(b.measured_at));
    const latest = ordered[ordered.length - 1];
    if (latest.value_num === null) continue;

    const limitHit = limitStatus(measure, latest.value_num);
    let status: OverallStatus;
    let reason: ReasonCode;
    let source: "safety_limit" | "personal_baseline";
    let confirm_required = false;
    let baseline_mean: number | null = null;
    let baseline_n = 0;
    let window_mean: number | null = null;
    let z_score: number | null = null;
    let trend: "rising" | "falling" | "stable" | null = null;

    if (latest.is_estimate === 1 && latest.confirmed_by_user === 0 && limitHit !== null) {
      status = limitHit.status;
      reason = "estimate_abnormal";
      source = "safety_limit";
      confirm_required = true;
    } else if (limitHit !== null && limitHit.status === "critical") {
      status = "critical";
      reason = "limit_critical";
      source = "safety_limit";
    } else {
      const baselinePool = ordered.filter(
        (record) =>
          record.is_estimate === 0 &&
          record.value_num !== null &&
          now - Date.parse(record.measured_at) >= 72 * 3_600_000 &&
          now - Date.parse(record.measured_at) <= 30 * DAY_MS
      );
      baseline_n = baselinePool.length;
      const minReadings = measure.min_baseline_readings;
      if (baselinePool.length >= minReadings) {
        const adjusted = baselinePool.map(
          (record) =>
            (record.value_num as number) + (shiftFor(measure, context.phase) - shiftFor(measure, record.phase))
        );
        baseline_mean = mean(adjusted);
        const floor = sdFloorFor(measure, baseline_mean);
        const spread = Math.max(sd(adjusted, baseline_mean), floor);
        const window = ordered.filter(
          (record) => record.is_estimate === 0 && record.value_num !== null && now - Date.parse(record.measured_at) < 72 * 3_600_000
        );
        if (window.length > 0) {
          const windowValues = window.map((record) => record.value_num as number);
          window_mean = mean(windowValues);
          z_score = spread === 0 ? 0 : (window_mean - baseline_mean) / spread;
          const third = Math.max(1, Math.floor(windowValues.length / 3));
          const first = mean(windowValues.slice(0, third));
          const last = mean(windowValues.slice(-third));
          trend = last > first ? "rising" : last < first ? "falling" : "stable";
          const raised: OverallStatus =
            Math.abs(z_score) >= 3 ? "critical" : Math.abs(z_score) >= 2 ? "watch" : "nominal";
          if (limitHit !== null && limitHit.status === "watch") {
            status = "watch";
            reason = "limit_watch";
            source = "safety_limit";
          } else if (raised === "critical") {
            status = "critical";
            reason = "baseline_critical";
            source = "personal_baseline";
          } else if (raised === "watch") {
            status = "watch";
            reason = "baseline_watch";
            source = "personal_baseline";
          } else {
            status = "nominal";
            reason = "within_limits";
            source = "safety_limit";
          }
        } else if (limitHit !== null) {
          status = limitHit.status;
          reason = limitHit.reason;
          source = "safety_limit";
        } else {
          status = "nominal";
          reason = "within_limits";
          source = "safety_limit";
        }
      } else if (limitHit !== null) {
        status = limitHit.status;
        reason = limitHit.reason;
        source = "safety_limit";
      } else {
        status = "insufficient";
        reason = "insufficient_baseline";
        source = "personal_baseline";
      }
    }

    per_measure.push({
      metric,
      status,
      status_source: source,
      reason_code: reason,
      values: {
        value: latest.value_num,
        unit: latest.unit,
        client_id: latest.client_id,
        baseline_mean,
        baseline_n,
        window_mean,
        z_score,
        trend,
        confirm_required,
        refuted: refutedByMetric.get(metric) ?? [],
      },
    });
  }

  const rank: Record<OverallStatus, number> = { critical: 3, watch: 2, nominal: 1, insufficient: 0 };
  let overall_status: OverallStatus = "insufficient";
  for (const entry of per_measure) {
    if (rank[entry.status] > rank[overall_status]) overall_status = entry.status;
  }

  const model = context.model ?? null;
  let model_advice: ModelAdvice | null = null;
  let model_id = "none";
  let model_version = "none";
  if (model) {
    const alert = overall_status === "watch" || overall_status === "critical";
    model_advice = {
      probability: model.probability,
      model_version: model.model_version,
      disagrees: model.probability >= model.threshold_watch !== alert,
    };
    model_id = model.model_id;
    model_version = model.model_version;
  }

  return {
    client_id: crypto.randomUUID(),
    crew_id,
    assessed_at: new Date(now).toISOString(),
    overall_status,
    per_measure,
    model_advice,
    model_id,
    model_version,
    catalog_version: catalogVersion,
    kb_version: KB_VERSION,
    inputs_hash: await inputsHash(history.map((record) => record.client_id)),
    received_at: "",
  };
}

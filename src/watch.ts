// WATCH signals: compare each crew member's last 72 hours against their own
// 30-day baseline. The maths (computeSignal) is pure so it can be unit tested;
// recomputeWatchSignals does the D1 reads and upserts.

import { toD1Time } from "./validate";

export const BASELINE_DAYS = 30;
export const WINDOW_HOURS = 72;
/** Fewer baseline readings than this and we don't trust the baseline. */
export const MIN_BASELINE_READINGS = 5;

export type SignalStatus = "nominal" | "watch" | "critical";

interface MetricSpec {
  /** Smallest standard deviation we'll divide by, so a very steady baseline doesn't turn noise into alerts. */
  sdFloor: number;
  /** Absolute limits on the 72h mean that override the baseline comparison. */
  absolute: (mean: number) => SignalStatus;
}

export const METRICS = {
  heart_rate: {
    sdFloor: 3,
    absolute: (m) => (m < 40 || m > 120 ? "critical" : m < 50 || m > 100 ? "watch" : "nominal"),
  },
  oxygen_saturation: {
    sdFloor: 1,
    absolute: (m) => (m < 90 ? "critical" : m < 95 ? "watch" : "nominal"),
  },
  temperature_c: {
    sdFloor: 0.2,
    absolute: (m) => (m < 35 || m > 38.5 ? "critical" : m < 36 || m > 37.5 ? "watch" : "nominal"),
  },
  blood_pressure_systolic: {
    sdFloor: 4,
    absolute: (m) => (m >= 160 || m < 85 ? "critical" : m >= 140 || m < 90 ? "watch" : "nominal"),
  },
  blood_pressure_diastolic: {
    sdFloor: 3,
    absolute: (m) => (m >= 100 || m < 50 ? "critical" : m >= 90 || m < 60 ? "watch" : "nominal"),
  },
} satisfies Record<string, MetricSpec>;

export type MetricKey = keyof typeof METRICS;
export const METRIC_KEYS = Object.keys(METRICS) as MetricKey[];

export interface Point {
  /** Epoch milliseconds. */
  t: number;
  value: number;
}

export interface Baseline {
  min: number;
  max: number;
  mean: number;
  stddev: number;
  n: number;
}

export interface MovingWindow {
  current: number;
  mean: number;
  trend: "rising" | "falling" | "stable";
  deviation_pct: number;
  z_score: number;
  n: number;
}

export interface ComputedSignal {
  signal_type: MetricKey;
  status: SignalStatus;
  baseline_30d: Baseline;
  moving_window_72h: MovingWindow;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const worst = (a: SignalStatus, b: SignalStatus): SignalStatus =>
  a === "critical" || b === "critical" ? "critical" : a === "watch" || b === "watch" ? "watch" : "nominal";

/**
 * Baseline = readings from 30 days ago up to the start of the 72h window
 * (kept separate so a recent change doesn't drag its own baseline along).
 * Returns null when there isn't enough data to say anything.
 */
export function computeSignal(metric: MetricKey, points: Point[], now: number): ComputedSignal | null {
  const windowStart = now - WINDOW_HOURS * 3_600_000;
  const baselineStart = now - BASELINE_DAYS * 86_400_000;

  const base = points.filter((p) => p.t >= baselineStart && p.t < windowStart).map((p) => p.value);
  const win = points.filter((p) => p.t >= windowStart && p.t <= now).sort((a, b) => a.t - b.t);
  if (base.length < MIN_BASELINE_READINGS || win.length === 0) return null;

  const spec = METRICS[metric];
  const bMean = mean(base);
  const bSd = Math.sqrt(base.reduce((s, x) => s + (x - bMean) ** 2, 0) / (base.length - 1));
  const sd = Math.max(bSd, spec.sdFloor);

  const wValues = win.map((p) => p.value);
  const wMean = mean(wValues);
  const z = (wMean - bMean) / sd;

  // Trend: last third of the window against the first third, in baseline SDs.
  let trend: MovingWindow["trend"] = "stable";
  if (wValues.length >= 3) {
    const k = Math.max(1, Math.floor(wValues.length / 3));
    const delta = (mean(wValues.slice(-k)) - mean(wValues.slice(0, k))) / sd;
    trend = delta > 0.5 ? "rising" : delta < -0.5 ? "falling" : "stable";
  }

  const zStatus: SignalStatus = Math.abs(z) >= 3 ? "critical" : Math.abs(z) >= 2 ? "watch" : "nominal";

  return {
    signal_type: metric,
    status: worst(zStatus, spec.absolute(wMean)),
    baseline_30d: {
      min: Math.min(...base),
      max: Math.max(...base),
      mean: round(bMean),
      stddev: round(bSd),
      n: base.length,
    },
    moving_window_72h: {
      current: wValues[wValues.length - 1],
      mean: round(wMean),
      trend,
      deviation_pct: round(((wMean - bMean) / bMean) * 100, 1),
      z_score: round(z),
      n: wValues.length,
    },
  };
}

interface VitalsRow {
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  oxygen_saturation: number | null;
  temperature_c: number | null;
  timestamp: string;
}

export function parseD1Time(ts: string): number {
  return new Date(ts.includes("T") ? ts : ts.replace(" ", "T") + "Z").getTime();
}

/** Recomputes and upserts every metric's signal for one astronaut. Returns what was written. */
export async function recomputeWatchSignals(db: D1Database, astronautId: string, now = Date.now()) {
  const since = toD1Time(new Date(now - BASELINE_DAYS * 86_400_000));
  const { results } = await db
    .prepare(
      `SELECT heart_rate, blood_pressure_systolic, blood_pressure_diastolic, oxygen_saturation, temperature_c, timestamp
       FROM vitals WHERE astronaut_id = ? AND timestamp >= ? ORDER BY timestamp ASC`
    )
    .bind(astronautId, since)
    .all<VitalsRow>();

  const signals: ComputedSignal[] = [];
  for (const metric of METRIC_KEYS) {
    const points = results
      .filter((r) => r[metric] != null)
      .map((r) => ({ t: parseD1Time(r.timestamp), value: r[metric] as number }));
    const s = computeSignal(metric, points, now);
    if (s) signals.push(s);
  }

  if (signals.length) {
    const stamp = toD1Time(new Date(now));
    await db.batch(
      signals.map((s) =>
        db
          .prepare(
            `INSERT INTO watch_signals (signal_type, astronaut_id, baseline_30d, moving_window_72h, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (astronaut_id, signal_type) DO UPDATE SET
               baseline_30d = excluded.baseline_30d,
               moving_window_72h = excluded.moving_window_72h,
               status = excluded.status,
               updated_at = excluded.updated_at`
          )
          .bind(
            s.signal_type,
            astronautId,
            JSON.stringify(s.baseline_30d),
            JSON.stringify(s.moving_window_72h),
            s.status,
            stamp,
            stamp
          )
      )
    );
  }
  return signals;
}

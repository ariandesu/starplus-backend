import { assess } from "../core/src/assess.ts";
import { lookupMeasure } from "../core/src/catalog.ts";
import type { Measurement, Result } from "../core/src/record.ts";
import seedFile from "../core/content/demo-seed.json" with { type: "json" };

export const DEMO_CREW_ID = "demo-astronaut";

const SEED = seedFile as {
  person: string;
  photo_base64: string;
  rows: Array<Record<string, string>>;
};

export const DEMO_PHOTO_BASE64: string = SEED.photo_base64;

/** Mirrors ml/maps/synthetic.yaml so the synthetic CSV imports as-is. */
const SYNTHETIC_COLUMNS: Record<string, string> = {
  systolic_bp_mmHg: "blood_pressure_systolic",
  diastolic_bp_mmHg: "blood_pressure_diastolic",
  blood_glucose_mg_dL: "blood_glucose",
  core_body_temp_C: "temperature_c",
  heart_rate_bpm: "heart_rate",
  hrv_rmssd_ms: "hrv_rmssd",
  spo2_percent: "oxygen_saturation",
  respiratory_rate_bpm: "respiratory_rate",
  sleep_duration_h: "sleep_hours",
  sleep_quality_score_0_100: "sleep_quality",
  mood_score_0_100: "mood_score",
  physical_activity_min_per_day: "physical_activity",
  body_mass_kg: "body_mass",
  hydration_urine_specific_gravity: "urine_specific_gravity",
  stress_score_0_100: "stress_score",
};

const EXTRA_DAILY: Array<{ metric: string; source: Measurement["source"]; value: number }> = [
  { metric: "water_intake", source: "manual", value: 2.0 },
  { metric: "calories", source: "manual", value: 2200 },
  { metric: "reaction_time", source: "test", value: 260 },
];

/** A dosimeter is read occasionally, not daily; sparse readings never baseline. */
const RADIATION_DAYS = [0, 10, 20];
const RADIATION_MSV = 0.5;

/**
 * Fixed, documented adjustments so the demo month reads mostly nominal.
 * The source rows swing hard enough to trip the tight personal-baseline
 * floors every few days, so every measure uses a steady typical value
 * (SYN-A001's first row, rounded) and sleep is lifted to at least 7.2 h.
 * Steady baselines keep ordinary days nominal; the three forced events below
 * carry the story through limit results, independent of baseline math.
 */
const MIN_SLEEP_HOURS = 7.2;
const FLAT_VALUES: Record<string, number> = {
  blood_pressure_systolic: 128,
  blood_pressure_diastolic: 72,
  heart_rate: 66,
  temperature_c: 37.1,
  blood_glucose: 92.0,
  sleep_hours: 7.2,
  sleep_quality: 65,
  mood_score: 60,
  stress_score: 45,
  hrv_rmssd: 45,
  physical_activity: 60,
  oxygen_saturation: 97,
  respiratory_rate: 11,
  body_mass: 79,
  urine_specific_gravity: 1.013,
  water_intake: 2.0,
  calories: 2200,
  reaction_time: 260,
};

function uuidFrom(seed: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 16777619);
    h2 = Math.imul(h2 ^ (char + 31), 16777619);
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h1) + hex(h2);
  let h3 = 0x811c9dc5;
  for (let i = seed.length - 1; i >= 0; i--) {
    h3 = Math.imul(h3 ^ seed.charCodeAt(i), 16777619);
  }
  let h4 = 0x01000193;
  for (let i = 0; i < seed.length; i += 2) {
    h4 = Math.imul(h4 ^ seed.charCodeAt(i), 16777619);
  }
  const b = hex(h3) + hex(h4);
  return `${a.slice(0, 8)}-${a.slice(8, 12)}-4${a.slice(13, 16)}-8${a.slice(17, 20)}-${b.slice(0, 12)}`;
}

const DAY_MS = 86_400_000;

function dayStartUtc(nowMs: number, daysAgo: number): Date {
  const midnight = new Date(nowMs);
  midnight.setUTCHours(0, 0, 0, 0);
  return new Date(midnight.getTime() - daysAgo * DAY_MS);
}

function record(
  person: string,
  dayLabel: string,
  metric: string,
  value: number,
  measuredAt: string,
  source: Measurement["source"],
  adjust = true
): Measurement {
  const measure = lookupMeasure(metric)!;
  let adjusted = value;
  if (adjust) {
    if (metric === "sleep_hours") adjusted = Math.max(value, MIN_SLEEP_HOURS);
    if (metric in FLAT_VALUES) adjusted = FLAT_VALUES[metric];
  }
  return {
    client_id: uuidFrom(`seed-demo:${person}:${dayLabel}:${metric}:${source}`),
    crew_id: DEMO_CREW_ID,
    metric,
    value_num: Math.round(adjusted * 100) / 100,
    value_text: null,
    unit: measure.unit,
    measured_at: measuredAt,
    received_at: "",
    source,
    device_id: "seed-demo",
    capture_id: metric === "blood_pressure_systolic" || metric === "blood_pressure_diastolic" ? `seed-demo-bp-${dayLabel}` : null,
    is_estimate: 0,
    confirmed_by_user: 0,
    provenance: "synthetic",
    setting: "iss",
    phase: "inflight",
    phase_day: null,
    supersedes_client_id: null,
    voided: 0,
    catalog_version: "1",
    schema_version: 1,
  };
}

export interface DemoSeed {
  person: string;
  measurements: Measurement[];
  results: Result[];
  days: string[];
}

export interface ForcedDay {
  day: number;
  heartRate: number;
  systolic: number;
  diastolic: number;
  tag: string;
}

/**
 * Deliberate events: a mild mid-month blood-pressure watch, one critical
 * systolic day, a mild recovery watch, and a mild watch on the latest day.
 * Limit results short-circuit the baseline math, so each event day shows
 * exactly its intended status; neighbouring days stay nominal because the
 * baselines are steady.
 */
const FORCED_DAYS: ForcedDay[] = [
  { day: 12, heartRate: 0, systolic: 142, diastolic: 85, tag: "watch-mid" },
  { day: 27, heartRate: 0, systolic: 183, diastolic: 0, tag: "critical" },
  { day: 28, heartRate: 0, systolic: 141, diastolic: 82, tag: "watch-recovery" },
  { day: 29, heartRate: 112, systolic: 141, diastolic: 0, tag: "watch-latest" },
];

export async function buildDemoSeed(nowMs: number): Promise<DemoSeed> {
  const person = SEED.person;
  const rows = SEED.rows;
  if (rows.length === 0) throw new Error("demo seed has no rows");
  const measurements: Measurement[] = [];
  for (let day = 0; day < 30; day++) {
    const position = (day * (rows.length - 1)) / 29;
    const lower = rows[Math.floor(position)];
    const upper = rows[Math.ceil(position)];
    const fraction = position - Math.floor(position);
    const row: Record<string, string> = {};
    for (const header of Object.keys(lower)) {
      const a = Number.parseFloat(lower[header] ?? "");
      const b = Number.parseFloat(upper[header] ?? "");
      row[header] = Number.isFinite(a) && Number.isFinite(b) ? String(a + (b - a) * fraction) : (lower[header] ?? "");
    }
    const at = new Date(dayStartUtc(nowMs, 29 - day).getTime() + 12 * 3_600_000).toISOString();
    const label = `day-${String(day).padStart(2, "0")}`;
    for (const [column, metric] of Object.entries(SYNTHETIC_COLUMNS)) {
      const raw = Number.parseFloat(row[column] ?? "");
      if (!Number.isFinite(raw)) continue;
      if (!lookupMeasure(metric)) continue;
      measurements.push(record(person, label, metric, raw, at, "import"));
    }
    for (const extra of EXTRA_DAILY) {
      measurements.push(record(person, label, extra.metric, extra.value, at, extra.source));
    }
    if (RADIATION_DAYS.includes(day)) {
      measurements.push(record(person, label, "radiation_dose", RADIATION_MSV, at, "manual"));
    }
    for (const code of ["sleep_hours", "mood_score", "stress_score", "sleep_quality"]) {
      const column = Object.keys(SYNTHETIC_COLUMNS).find((c) => SYNTHETIC_COLUMNS[c] === code) ?? "";
      const value = Number.parseFloat(row[column] ?? "");
      if (!Number.isFinite(value)) continue;
      measurements.push(record(person, label, code, value, at, "questionnaire"));
    }
    const forced = FORCED_DAYS.find((entry) => entry.day === day);
    if (forced) {
      const forcedAt = new Date(Date.parse(at) + 60_000).toISOString();
      if (forced.heartRate > 0) {
        measurements.push(record(person, label, "heart_rate", forced.heartRate, forcedAt, "manual", false));
      }
      if (forced.diastolic > 0) {
        measurements.push({ ...record(person, label, "blood_pressure_systolic", forced.systolic, forcedAt, "manual", false), capture_id: `seed-demo-bp-${forced.tag}` });
        measurements.push({ ...record(person, label, "blood_pressure_diastolic", forced.diastolic, forcedAt, "manual", false), capture_id: `seed-demo-bp-${forced.tag}` });
      } else {
        measurements.push({ ...record(person, label, "blood_pressure_systolic", forced.systolic, forcedAt, "manual", false), capture_id: null });
      }
    }
    if (day === 0) {
      for (const item of measurements.filter((m) => m.measured_at === at)) {
        for (let copy = 1; copy <= 5; copy++) {
          measurements.push({ ...item, client_id: `${item.client_id}-intake${copy}` });
        }
      }
    }
  }
  measurements.sort((a, b) => (a.measured_at < b.measured_at ? -1 : 1));
  const results: Result[] = [];
  const days: string[] = [];
  const history: Measurement[] = [];
  const byDay = new Map<string, Measurement[]>();
  for (const item of measurements) {
    const day = item.measured_at.slice(0, 10);
    const group = byDay.get(day) ?? [];
    group.push(item);
    byDay.set(day, group);
  }
  for (const day of [...byDay.keys()].sort()) {
    days.push(day);
    history.push(...byDay.get(day)!);
    const dayEnd = Date.parse(`${day}T12:00:00.000Z`);
    const assessed = await assess(history, { now: dayEnd, phase: "inflight", model: null });
    results.push({
      ...assessed,
      client_id: uuidFrom(`seed-demo:${person}:result:${day}`),
      assessed_at: `${day}T12:00:00.000Z`,
    });
  }
  return { person, measurements, results, days };
}

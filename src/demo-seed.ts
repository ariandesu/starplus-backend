import { assess } from "../core/src/assess.ts";
import { lookupMeasure } from "../core/src/catalog.ts";
import type { Measurement, Result } from "../core/src/record.ts";
import seedFile from "../core/content/demo-seed.json" with { type: "json" };

export const DEMO_CREW_ID = "demo-astronaut";

const SEED = seedFile as {
  person: string;
  photo_base64: string;
  rows: Array<Record<string, string>>;
  crew?: Array<{ id: string; name: string; person: string; rows: Array<Record<string, string>> }>;
};

export const DEMO_PHOTO_BASE64: string = SEED.photo_base64;

export interface DemoCrewEntry {
  id: string;
  name: string;
  person: string;
  rows: Array<Record<string, string>>;
}

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
 * Each person's steady values come from their own first CSV row (rounded),
 * clamped into the nominal band with margin where the raw row would already
 * trip a limit; sleep is lifted to at least 7.2 h. A small deterministic
 * day-to-day variation keeps every series lifelike but stays inside the
 * personal-baseline band, so ordinary days stay nominal; the scripted events
 * carry the story through limit results, independent of baseline math.
 */
const MIN_SLEEP_HOURS = 7.2;
const STEADY_CLAMPS: Record<string, { min?: number; max?: number }> = {
  blood_glucose: { min: 72 },
  urine_specific_gravity: { max: 1.017 },
  sleep_hours: { min: MIN_SLEEP_HOURS },
};
const DEFAULT_VARIATION_AMP = 0.02;
const VARIATION_AMP: Record<string, number> = {
  blood_pressure_systolic: 0.01,
  blood_pressure_diastolic: 0.04,
  heart_rate: 0.05,
  oxygen_saturation: 0.005,
  temperature_c: 0.0025,
  sleep_hours: 0.01,
  urine_specific_gravity: 0.002,
  body_mass: 0.04,
};

/** Display precision per measure: whole readings except temperature (1 dp). */
const INTEGER_METRICS = new Set([
  "blood_pressure_systolic",
  "blood_pressure_diastolic",
  "heart_rate",
  "oxygen_saturation",
  "respiratory_rate",
  "blood_glucose",
]);

export function roundForDisplay(metric: string, value: number): number {
  if (INTEGER_METRICS.has(metric)) return Math.round(value);
  if (metric === "temperature_c") return Math.round(value * 10) / 10;
  return Math.round(value * 100) / 100;
}

/** Deterministic [0, 1) hash so two runs with the same now seed identically. */
export function hash01(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0x5bd1e995);
  hash ^= hash >>> 15;
  return (hash >>> 0) / 4294967296;
}

function steadyValues(rows: Array<Record<string, string>>): Record<string, number> {
  const first = rows[0] ?? {};
  const out: Record<string, number> = {};
  for (const [column, metric] of Object.entries(SYNTHETIC_COLUMNS)) {
    const raw = Number.parseFloat(first[column] ?? "");
    if (!Number.isFinite(raw)) continue;
    if (!lookupMeasure(metric)) continue;
    const clamp = STEADY_CLAMPS[metric];
    const rounded = Math.round(raw * 100) / 100;
    out[metric] =
      clamp?.min !== undefined ? Math.max(rounded, clamp.min)
      : clamp?.max !== undefined ? Math.min(rounded, clamp.max)
      : rounded;
  }
  for (const extra of EXTRA_DAILY) out[extra.metric] = extra.value;
  return out;
}

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

/** "Demo today": the calendar date in the demo timezone at reset time. */
export function tzDateKey(utcMs: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function tzOffsetMinutes(timeZone: string, utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string): string => parts.find((part) => part.type === type)?.value ?? "";
  const asUtc = Date.UTC(
    Number(get("year")),
    Number(get("month")) - 1,
    Number(get("day")),
    Number(get("hour")) % 24,
    Number(get("minute")),
    Number(get("second"))
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/** Wall-clock time on a calendar date in the demo timezone, as a UTC instant. */
export function zonedToUtcMs(dateKey: string, hour: number, minute: number, timeZone: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const once = wallAsUtc - tzOffsetMinutes(timeZone, wallAsUtc) * 60_000;
  return wallAsUtc - tzOffsetMinutes(timeZone, once) * 60_000;
}

export function addDays(dateKey: string, delta: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day) + delta * DAY_MS).toISOString().slice(0, 10);
}

function record(
  crewId: string,
  person: string,
  dayLabel: string,
  metric: string,
  value: number,
  measuredAt: string,
  source: Measurement["source"],
  adjust = true,
  vary?: { steady: number; dayKey: string }
): Measurement {
  const measure = lookupMeasure(metric)!;
  let adjusted = value;
  if (adjust && vary !== undefined) {
    const amp = VARIATION_AMP[metric] ?? DEFAULT_VARIATION_AMP;
    adjusted = vary.steady * (1 + (hash01(`${crewId}:${metric}:${vary.dayKey}`) - 0.5) * 2 * amp);
    if (metric === "sleep_hours") adjusted = Math.max(adjusted, MIN_SLEEP_HOURS);
    if (metric === "urine_specific_gravity" && STEADY_CLAMPS[metric]?.max !== undefined) {
      adjusted = Math.min(adjusted, STEADY_CLAMPS[metric].max as number);
    }
  }
  return {
    client_id: uuidFrom(`seed-demo:${crewId}:${person}:${dayLabel}:${metric}:${source}`),
    crew_id: crewId,
    metric,
    value_num: roundForDisplay(metric, adjusted),
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

export interface CrewSeed extends DemoSeed {
  crewId: string;
  name: string;
}

export interface CrewEvent {
  /** Loop day index (days - 1 is the newest day). */
  day: number;
  metric: string;
  value: number;
  tag: string;
}

export interface CrewStory {
  crewId: string;
  name: string;
  person: string;
  rows: Array<Record<string, string>>;
  days: number;
  /** First N loop days record vitals only (a thin start reads insufficient). */
  sparseFirst: number;
  events: CrewEvent[];
}

const SPARSE_METRICS = new Set(["heart_rate", "temperature_c"]);

/**
 * Deliberate events: a mild mid-month blood-pressure watch, one critical
 * systolic day, a mild recovery watch, and a mild watch on the latest day.
 * Limit results short-circuit the baseline math, so each event day shows
 * exactly its intended status; neighbouring days stay nominal because the
 * baselines are steady.
 */
const ALEX_EVENTS: CrewEvent[] = [
  { day: 12, metric: "blood_pressure_systolic", value: 142, tag: "watch-mid" },
  { day: 12, metric: "blood_pressure_diastolic", value: 85, tag: "watch-mid" },
  { day: 27, metric: "blood_pressure_systolic", value: 183, tag: "critical" },
  { day: 28, metric: "blood_pressure_systolic", value: 141, tag: "watch-recovery" },
  { day: 28, metric: "blood_pressure_diastolic", value: 82, tag: "watch-recovery" },
  { day: 29, metric: "heart_rate", value: 112, tag: "watch-latest" },
  { day: 29, metric: "blood_pressure_systolic", value: 141, tag: "watch-latest" },
];

export function demoStories(): CrewStory[] {
  const crew = SEED.crew ?? [];
  const rowsFor = (id: string): Array<Record<string, string>> =>
    crew.find((entry) => entry.id === id)?.rows ?? [];
  return [
    {
      crewId: DEMO_CREW_ID,
      name: "Alex Rivera",
      person: SEED.person,
      rows: SEED.rows,
      days: 30,
      sparseFirst: 0,
      events: ALEX_EVENTS,
    },
    {
      crewId: "demo-crew-2",
      name: "Sam Okafor",
      person: "SYN-A002",
      rows: rowsFor("demo-crew-2"),
      days: 30,
      sparseFirst: 0,
      events: [],
    },
    {
      crewId: "demo-crew-3",
      name: "Mia Chen",
      person: "SYN-A003",
      rows: rowsFor("demo-crew-3"),
      days: 30,
      sparseFirst: 0,
      events: [{ day: 29, metric: "oxygen_saturation", value: 88, tag: "critical-spo2" }],
    },
    {
      crewId: "demo-crew-4",
      name: "Leo Haas",
      person: "SYN-A004",
      rows: rowsFor("demo-crew-4"),
      days: 8,
      sparseFirst: 3,
      events: [],
    },
  ];
}

export async function buildDemoSeed(nowMs: number, timeZone = "UTC"): Promise<DemoSeed> {
  const [alex] = await buildCrewSeeds(nowMs, timeZone, demoStories().slice(0, 1));
  return { person: alex.person, measurements: alex.measurements, results: alex.results, days: alex.days };
}

export async function buildCrewSeeds(nowMs: number, timeZone: string, stories: CrewStory[]): Promise<CrewSeed[]> {
  const seeds: CrewSeed[] = [];
  for (const story of stories) {
    seeds.push(await buildCrewSeed(nowMs, timeZone, story));
  }
  return seeds;
}

async function buildCrewSeed(nowMs: number, timeZone: string, story: CrewStory): Promise<CrewSeed> {
  const { crewId, name, person, rows } = story;
  const dayCount = story.days;
  if (rows.length === 0) throw new Error(`demo seed for ${crewId} has no rows`);
  const todayKey = tzDateKey(nowMs, timeZone);
  const steady = steadyValues(rows);
  const measurements: Measurement[] = [];
  for (let day = 0; day < dayCount; day++) {
    const globalDay = day + (30 - dayCount);
    const key = addDays(todayKey, day - (dayCount - 1));
    const at =
      day === dayCount - 1
        ? new Date(nowMs).toISOString()
        : new Date(zonedToUtcMs(key, 8, 0, timeZone)).toISOString();
    const label = `day-${String(globalDay).padStart(2, "0")}`;
    const sparse = day < story.sparseFirst;
    for (const metric of new Set(Object.values(SYNTHETIC_COLUMNS))) {
      if (sparse && !SPARSE_METRICS.has(metric)) continue;
      if (!lookupMeasure(metric)) continue;
      const base = steady[metric];
      if (!Number.isFinite(base)) continue;
      measurements.push(record(crewId, person, label, metric, base, at, "import", true, { steady: base, dayKey: key }));
    }
    if (!sparse) {
      for (const extra of EXTRA_DAILY) {
        measurements.push(
          record(crewId, person, label, extra.metric, extra.value, at, extra.source, true, {
            steady: extra.value,
            dayKey: key,
          })
        );
      }
    }
    if (RADIATION_DAYS.includes(globalDay)) {
      measurements.push(record(crewId, person, label, "radiation_dose", RADIATION_MSV, at, "manual"));
    }
    if (!sparse) {
      for (const code of ["sleep_hours", "mood_score", "stress_score", "sleep_quality"]) {
        const base = steady[code];
        if (!Number.isFinite(base)) continue;
        measurements.push(record(crewId, person, label, code, base, at, "questionnaire", true, { steady: base, dayKey: key }));
      }
    }
    const forcedAt = day === dayCount - 1 ? at : new Date(Date.parse(at) + 60_000).toISOString();
    for (const event of story.events.filter((entry) => entry.day === day)) {
      const partner =
        event.metric === "blood_pressure_systolic"
          ? story.events.find(
              (entry) => entry.day === day && entry.tag === event.tag && entry.metric === "blood_pressure_diastolic"
            )
          : undefined;
      if (partner) {
        measurements.push({
          ...record(crewId, person, label, event.metric, event.value, forcedAt, "manual", false),
          capture_id: `seed-demo-bp-${event.tag}`,
        });
        measurements.push({
          ...record(crewId, person, label, partner.metric, partner.value, forcedAt, "manual", false),
          capture_id: `seed-demo-bp-${event.tag}`,
        });
      } else if (event.metric !== "blood_pressure_diastolic" || !story.events.some(
        (entry) => entry.day === day && entry.tag === event.tag && entry.metric === "blood_pressure_systolic"
      )) {
        measurements.push({
          ...record(crewId, person, label, event.metric, event.value, forcedAt, "manual", false),
          capture_id: null,
        });
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
    const day = tzDateKey(Date.parse(item.measured_at), timeZone);
    const group = byDay.get(day) ?? [];
    group.push(item);
    byDay.set(day, group);
  }
  for (const day of [...byDay.keys()].sort()) {
    days.push(day);
    history.push(...byDay.get(day)!);
    const stampMs = day === todayKey ? nowMs : zonedToUtcMs(day, 12, 0, timeZone);
    const assessed = await assess(history, { now: stampMs, phase: "inflight", model: null });
    results.push({
      ...assessed,
      client_id: uuidFrom(`seed-demo:${crewId}:${person}:result:${day}`),
      assessed_at: new Date(stampMs).toISOString(),
    });
  }
  return { crewId, name, person, measurements, results, days };
}

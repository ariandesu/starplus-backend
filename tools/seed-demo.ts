import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assess, lookupMeasure, type Measurement, type Result } from "../core/src/index.ts";
import { DEMO_PHOTO_ID } from "../src/demo.ts";

const root = dirname(fileURLToPath(import.meta.url));
const DEMO_CREW_ID = "demo-astronaut";

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

const EXTRA_DAILY: Array<{ metric: string; source: Measurement["source"]; value: (day: number) => number }> = [
  { metric: "water_intake", source: "manual", value: (day) => 1.6 + (day % 4) * 0.2 },
  { metric: "calories", source: "manual", value: (day) => 2100 + (day % 5) * 80 },
  { metric: "radiation_dose", source: "manual", value: (day) => Math.round(0.31 * (day + 1) * 100) / 100 },
  { metric: "reaction_time", source: "test", value: (day) => 260 + (day % 7) * 8 },
];

/** A generated abstract image (red square), not a real injury photo. */
const DEMO_PHOTO_BASE64 =
  "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";

function uuidFrom(seed: string): string {
  const digest = createHash("sha256").update(seed).digest("hex");
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((header, i) => {
      row[header] = cells[i] ?? "";
    });
    return row;
  });
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
  source: Measurement["source"]
): Measurement {
  const measure = lookupMeasure(metric)!;
  return {
    client_id: uuidFrom(`seed-demo:${person}:${dayLabel}:${metric}:${source}`),
    crew_id: DEMO_CREW_ID,
    metric,
    value_num: Math.round(value * 100) / 100,
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

export async function buildDemoHistory(csvText: string, personId: string, nowMs: number): Promise<DemoSeed> {
  const rows = parseCsv(csvText).filter((row) => row.astronaut_id === personId);
  if (rows.length === 0) throw new Error(`person ${personId} not found`);
  const measurements: Measurement[] = [];
  for (let day = 0; day < 30; day++) {
    const row = rows[Math.min(rows.length - 1, Math.floor((day * rows.length) / 30))];
    const at = new Date(dayStartUtc(nowMs, 29 - day).getTime() + 12 * 3_600_000).toISOString();
    const label = `day-${String(day).padStart(2, "0")}`;
    for (const [column, metric] of Object.entries(SYNTHETIC_COLUMNS)) {
      const value = Number.parseFloat(row[column] ?? "");
      if (!Number.isFinite(value)) continue;
      if (!lookupMeasure(metric)) continue;
      measurements.push(record(personId, label, metric, value, at, "import"));
    }
    for (const extra of EXTRA_DAILY) {
      measurements.push(record(personId, label, extra.metric, extra.value(day), at, extra.source));
    }
    for (const code of ["sleep_hours", "mood_score", "stress_score", "sleep_quality"]) {
      const value = Number.parseFloat(row[Object.keys(SYNTHETIC_COLUMNS).find((c) => SYNTHETIC_COLUMNS[c] === code) ?? ""] ?? "");
      if (!Number.isFinite(value)) continue;
      measurements.push(record(personId, label, code, value, at, "questionnaire"));
    }
    if (day === 28 || day === 29) {
      const forcedAt = new Date(Date.parse(at) + 60_000).toISOString();
      const forced = day === 28
        ? { hr: 115, sys: 145, dia: 95, tag: "watch" }
        : { hr: 152, sys: 185, dia: 125, tag: "critical" };
      measurements.push(record(personId, label, "heart_rate", forced.hr, forcedAt, "manual"));
      measurements.push({ ...record(personId, label, "blood_pressure_systolic", forced.sys, forcedAt, "manual"), capture_id: `seed-demo-bp-${forced.tag}` });
      measurements.push({ ...record(personId, label, "blood_pressure_diastolic", forced.dia, forcedAt, "manual"), capture_id: `seed-demo-bp-${forced.tag}` });
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
    const assessed = await assess(history, { now: nowMs, phase: "inflight", model: null });
    results.push({
      ...assessed,
      client_id: uuidFrom(`seed-demo:${personId}:result:${day}`),
      assessed_at: `${day}T12:00:00.000Z`,
    });
  }
  return { person: personId, measurements, results, days };
}

function parseArgs(): { base: string; adminKey: string; person: string | null; reset: boolean } {
  const values: Record<string, string> = {};
  let reset = false;
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--reset") {
      reset = true;
      continue;
    }
    const match = /^--([^= \t]+)(?:=(.*))?$/.exec(arg);
    if (match) {
      if (match[2] !== undefined) {
        values[match[1]] = match[2];
      } else if (i + 1 < argv.length) {
        values[match[1]] = argv[i + 1];
        i++;
      }
    }
  }
  if (!values.base) throw new Error("missing --base=https://...");
  if (!values["admin-key"]) throw new Error("missing --admin-key=...");
  return { base: values.base, adminKey: values["admin-key"], person: values.person ?? null, reset };
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.reset) {
    const res = await fetch(`${args.base}/api/admin/demo-reset`, {
      method: "POST",
      headers: { Authorization: `Bearer ${args.adminKey}`, "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error(`reset failed with ${res.status}`);
    console.log(JSON.stringify(await res.json()));
    return;
  }
  const csvText = readFileSync(join(root, "..", "ml", "data", "astronaut_health_SYNTHETIC.csv"), "utf8");
  const firstPerson = parseCsv(csvText)[0].astronaut_id;
  const person = args.person ?? firstPerson;
  const { measurements, results, days } = await buildDemoHistory(csvText, person, Date.now());
  const resultsByDay = new Map(days.map((day, i) => [day, results[i]]));

  const login = await fetch(`${args.base}/api/auth/demo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role: "astronaut", device_id: "seed-demo" }),
  });
  if (!login.ok) throw new Error(`demo login failed with ${login.status} (is DEMO_LOGIN=on?)`);
  const session = (await login.json()) as { token: string };
  const auth = { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" };

  const photoBytes = Buffer.from(DEMO_PHOTO_BASE64, "base64");
  const photo = await fetch(`${args.base}/api/attachments`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({
      id: DEMO_PHOTO_ID,
      report_client_id: uuidFrom(`seed-demo:${person}:report:emergency`),
      content_type: "image/jpeg",
      data_base64: DEMO_PHOTO_BASE64,
    }),
  });
  if (!photo.ok) throw new Error(`photo upload failed with ${photo.status}`);

  const summary = { accepted: 0, duplicates: 0, rejected: 0, byReason: {} as Record<string, number> };
  const byDay = new Map<string, Measurement[]>();
  for (const item of measurements) {
    const group = byDay.get(item.measured_at.slice(0, 10)) ?? [];
    group.push(item);
    byDay.set(item.measured_at.slice(0, 10), group);
  }
  for (const day of [...byDay.keys()].sort()) {
    const dayResult = resultsByDay.get(day);
    const res = await fetch(`${args.base}/api/measurements/batch`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        schema_version: 1,
        catalog_version: "1",
        items: byDay.get(day),
        results: dayResult ? [dayResult] : [],
      }),
    });
    if (!res.ok) throw new Error(`batch failed with ${res.status}`);
    const body = (await res.json()) as { accepted: string[]; duplicates: string[]; rejected: Array<{ reason: string }> };
    summary.accepted += body.accepted.length;
    summary.duplicates += body.duplicates.length;
    summary.rejected += body.rejected.length;
    for (const item of body.rejected) summary.byReason[item.reason] = (summary.byReason[item.reason] ?? 0) + 1;
  }

  const reports = [
    {
      client_id: uuidFrom(`seed-demo:${person}:report:routine`),
      device_id: "seed-demo",
      kind: "routine",
      created_at: new Date().toISOString(),
      payload_json: { note: "Demo routine report" },
      summary_text: "Demo routine report",
      summary_edited: 1,
    },
    {
      client_id: uuidFrom(`seed-demo:${person}:report:emergency`),
      device_id: "seed-demo",
      kind: "emergency",
      created_at: new Date().toISOString(),
      payload_json: {
        scenario: "bleeding",
        steps: [],
        attachments: [{ id: DEMO_PHOTO_ID, content_type: "image/jpeg", size: photoBytes.byteLength }],
      },
      summary_text: "Demo emergency report with a photo",
      summary_edited: 1,
    },
  ];
  for (const report of reports) {
    const res = await fetch(`${args.base}/api/reports`, { method: "POST", headers: auth, body: JSON.stringify(report) });
    if (!res.ok) throw new Error(`report failed with ${res.status}`);
  }
  console.log(JSON.stringify({ person, measurements: measurements.length, results: summary, reports: reports.length, photo: photoBytes.byteLength }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}

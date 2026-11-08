import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = join(root, "ml", "data", "astronaut_health_SYNTHETIC.csv");
const outPath = join(root, "core", "content", "demo-crew.json");

const COLUMN_TO_CODE: Record<string, string> = {
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

const UNIT_FOR: Record<string, string> = {
  blood_pressure_systolic: "mmHg",
  blood_pressure_diastolic: "mmHg",
  blood_glucose: "mg/dL",
  temperature_c: "°C",
  heart_rate: "bpm",
  hrv_rmssd: "ms",
  oxygen_saturation: "%",
  respiratory_rate: "/min",
  sleep_hours: "h",
  sleep_quality: "score",
  mood_score: "score",
  physical_activity: "min",
  body_mass: "kg",
  urine_specific_gravity: "",
  stress_score: "score",
};

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

async function main(): Promise<void> {
  const rows = parseCsv(readFileSync(dataPath, "utf8")).filter((row) => row.astronaut_id === "SYN-A001");
  if (rows.length === 0) throw new Error("SYN-A001 not found in the synthetic CSV");
  const measurements: Array<Record<string, unknown>> = [];
  for (let day = 0; day < 30; day++) {
    const source = rows[day % rows.length];
    for (const [column, code] of Object.entries(COLUMN_TO_CODE)) {
      const raw = Number.parseFloat(source[column]);
      if (!Number.isFinite(raw)) continue;
      const measuredAt = new Date(Date.UTC(2026, 9, 9 + day, 8, 0, 0)).toISOString();
      measurements.push({
        client_id: uuidFrom(`demo-crew-01:${code}:${day}`),
        crew_id: "demo-crew-01",
        metric: code,
        value_num: raw,
        value_text: null,
        unit: UNIT_FOR[code],
        measured_at: measuredAt,
        received_at: "",
        source: "import",
        device_id: "demo",
        capture_id: null,
        is_estimate: 0,
        confirmed_by_user: 0,
        provenance: "synthetic",
        setting: "iss",
        phase: "inflight",
        phase_day: day + 1,
        supersedes_client_id: null,
        voided: 0,
        catalog_version: "1",
        schema_version: 1,
      });
    }
  }
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        crew: { id: "demo-crew-01", name: "Demo Crew", role: "astronaut", provenance: "synthetic" },
        measurements,
      },
      null,
      2
    ) + "\n"
  );
  console.log(`wrote ${outPath}: ${measurements.length} measurements`);
}

await main();

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const catalog = JSON.parse(
  readFileSync(join(root, "..", "core", "content", "catalog.json"), "utf8")
) as { measures: Array<{ code: string; unit: string }> };
const UNIT_FOR: Record<string, string> = Object.fromEntries(catalog.measures.map((m) => [m.code, m.unit]));

const META_COLUMNS = new Set(["person_id", "label", "phase", "phase_day", "phase_rank"]);

interface Args {
  base: string;
  code: string;
  crew: string;
  csv: string;
  metrics: string[] | null;
  limit: number;
}

function parseArgs(): Args {
  const values: Record<string, string[]> = {};
  for (const arg of process.argv.slice(2)) {
    const match = /^--([^=]+)=(.*)$/.exec(arg);
    if (match) (values[match[1]] ??= []).push(match[2]);
  }
  const one = (name: string, fallback?: string): string => {
    if (values[name]?.[0] !== undefined) return values[name][0];
    if (fallback !== undefined) return fallback;
    throw new Error(`missing --${name}=`);
  };
  return {
    base: one("base"),
    code: one("code"),
    crew: one("crew"),
    csv: one("csv"),
    metrics: values["metric"] ?? null,
    limit: Number.parseInt(one("limit", "100000"), 10),
  };
}

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
  const args = parseArgs();
  const started = Date.now();
  const auth = await fetch(`${args.base}/api/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: args.code, device_id: "load-import" }),
  });
  if (!auth.ok) throw new Error(`login failed with ${auth.status}`);
  const session = (await auth.json()) as { token: string };
  const rows = parseCsv(readFileSync(args.csv, "utf8")).slice(0, args.limit);
  const baseDay = Date.UTC(2026, 8, 1);
  const items: Array<Record<string, unknown>> = [];
  rows.forEach((row, i) => {
    const day = Number.parseInt(row.phase_day ?? "0", 10) || 0;
    for (const [column, cell] of Object.entries(row)) {
      if (META_COLUMNS.has(column)) continue;
      if (args.metrics && !args.metrics.includes(column)) continue;
      const value = Number.parseFloat(cell);
      if (!Number.isFinite(value)) continue;
      items.push({
        client_id: uuidFrom(`load-import:${row.person_id}:${i}:${column}`),
        crew_id: args.crew,
        metric: column,
        value_num: value,
        value_text: null,
        unit: UNIT_FOR[column] ?? "",
        measured_at: new Date(baseDay + day * 86_400_000).toISOString(),
        received_at: "",
        source: "import",
        device_id: "load-import",
        capture_id: null,
        is_estimate: 0,
        confirmed_by_user: 0,
        provenance: "synthetic",
        setting: "iss",
        phase: row.phase || "inflight",
        phase_day: Number.isInteger(day) ? day : null,
        supersedes_client_id: null,
        voided: 0,
        catalog_version: "1",
        schema_version: 1,
      });
    }
  });
  let accepted = 0;
  let duplicates = 0;
  const rejected: Array<unknown> = [];
  for (let i = 0; i < items.length; i += 100) {
    const chunk = items.slice(i, i + 100);
    const res = await fetch(`${args.base}/api/measurements/batch`, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ schema_version: 1, catalog_version: "1", items: chunk, results: [] }),
    });
    if (!res.ok) throw new Error(`batch failed with ${res.status}`);
    const body = (await res.json()) as { accepted: string[]; duplicates: string[]; rejected: unknown[] };
    accepted += body.accepted.length;
    duplicates += body.duplicates.length;
    rejected.push(...body.rejected);
  }
  console.log(
    JSON.stringify({
      items: items.length,
      accepted,
      duplicates,
      rejected: rejected.length,
      seconds: Math.round((Date.now() - started) / 1000),
    })
  );
  if (rejected.length > 0) process.exitCode = 1;
}

await main();

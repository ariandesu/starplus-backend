import { catalogVersion, isUUID, lookupMeasure, validateCapture } from "@starplus/core";
import type { Measurement } from "@starplus/core";
import type { Env } from "./env.ts";
import { error, json } from "./http.ts";
import { requireSession, sessionError } from "./auth.ts";

export const MAX_ITEMS = 100;
const DAILY_CAP = 5000;
const BATCH_ROWS = 4;

type RejectReason =
  | "invalid_schema"
  | "unknown_metric"
  | "out_of_bounds"
  | "bp_pair_invalid"
  | "missing_provenance"
  | "provenance_mismatch"
  | "wrong_crew"
  | "future_timestamp"
  | "catalog_version_too_old"
  | "daily_cap_reached";

interface BatchItem {
  client_id: string;
  reject?: RejectReason;
  row?: Record<string, unknown>;
  resultRow?: Record<string, unknown>;
}

const MEASURE_COLUMNS = [
  "client_id",
  "crew_id",
  "metric",
  "value_num",
  "value_text",
  "unit",
  "measured_at",
  "received_at",
  "source",
  "device_id",
  "capture_id",
  "is_estimate",
  "confirmed_by_user",
  "provenance",
  "setting",
  "phase",
  "phase_day",
  "supersedes_client_id",
  "voided",
  "catalog_version",
  "schema_version",
];

const RESULT_COLUMNS = [
  "client_id",
  "crew_id",
  "assessed_at",
  "overall_status",
  "per_measure_json",
  "model_advice_json",
  "model_id",
  "model_version",
  "catalog_version",
  "kb_version",
  "inputs_hash",
  "received_at",
];

const SETTINGS = ["iss", "mars_transit", "moon_base", "rover"];
const PHASES = ["preflight", "inflight", "surface", "postflight"];
const SOURCES = ["manual", "questionnaire", "test", "import", "ble", "voice", "ocr", "camera_hr"];
const PROVENANCES = ["real", "synthetic", "simulated_device"];
const STATUSES = ["insufficient", "nominal", "watch", "critical"];

function secondsUntilNextUtcDay(now: number): number {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(1, Math.floor((next.getTime() - now) / 1000));
}

function checkMeasurement(
  raw: unknown,
  crew_id: string,
  now: number,
  serverVersion: number,
  allowedProvenance: string[] | null
): BatchItem {
  if (typeof raw !== "object" || raw === null) {
    return { client_id: "unknown", reject: "invalid_schema" };
  }
  const item = raw as Record<string, unknown>;
  const client_id = typeof item.client_id === "string" ? item.client_id : "unknown";
  const fail = (reject: RejectReason): BatchItem => ({ client_id, reject });
  if (!isUUID(item.client_id)) return fail("invalid_schema");
  if (item.crew_id !== crew_id) return fail("wrong_crew");
  const measure = typeof item.metric === "string" ? lookupMeasure(item.metric) : null;
  if (!measure || item.metric !== measure.code) return fail("unknown_metric");
  if (typeof item.value_num !== "number" || !Number.isFinite(item.value_num)) return fail("invalid_schema");
  if (item.value_num < measure.bounds.min || item.value_num > measure.bounds.max) return fail("out_of_bounds");
  if (item.value_text !== null && item.value_text !== undefined) return fail("invalid_schema");
  if (item.unit !== measure.unit) return fail("invalid_schema");
  const measured = typeof item.measured_at === "string" ? Date.parse(item.measured_at) : NaN;
  if (Number.isNaN(measured)) return fail("invalid_schema");
  if (measured > now + 86_400_000) return fail("future_timestamp");
  if (!PROVENANCES.includes(item.provenance as string)) return fail("missing_provenance");
  if (allowedProvenance !== null && !allowedProvenance.includes(item.provenance as string)) {
    return fail("provenance_mismatch");
  }
  if (!SETTINGS.includes(item.setting as string)) return fail("invalid_schema");
  if (!PHASES.includes(item.phase as string)) return fail("invalid_schema");
  if (!SOURCES.includes(item.source as string)) return fail("invalid_schema");
  if (typeof item.device_id !== "string" || item.device_id.length === 0) return fail("invalid_schema");
  if (item.capture_id !== null && item.capture_id !== undefined && typeof item.capture_id !== "string") {
    return fail("invalid_schema");
  }
  for (const flag of ["is_estimate", "confirmed_by_user", "voided"] as const) {
    if (item[flag] !== 0 && item[flag] !== 1) return fail("invalid_schema");
  }
  if (item.supersedes_client_id !== null && item.supersedes_client_id !== undefined && !isUUID(item.supersedes_client_id)) {
    return fail("invalid_schema");
  }
  if (typeof item.catalog_version !== "string") return fail("invalid_schema");
  const itemVersion = Number.parseInt(item.catalog_version, 10);
  if (!Number.isInteger(itemVersion)) return fail("invalid_schema");
  if (serverVersion - itemVersion > 1) return fail("catalog_version_too_old");
  if (item.schema_version !== 1) return fail("invalid_schema");
  return {
    client_id,
    row: {
      client_id,
      crew_id,
      metric: measure.code,
      value_num: item.value_num,
      value_text: null,
      unit: measure.unit,
      measured_at: item.measured_at,
      received_at: "",
      source: item.source,
      device_id: item.device_id,
      capture_id: item.capture_id ?? null,
      is_estimate: item.is_estimate,
      confirmed_by_user: item.confirmed_by_user,
      provenance: item.provenance,
      setting: item.setting,
      phase: item.phase,
      phase_day: item.phase_day ?? null,
      supersedes_client_id: item.supersedes_client_id ?? null,
      voided: item.voided ?? 0,
      catalog_version: item.catalog_version,
      schema_version: 1,
    },
  };
}

function checkResult(raw: unknown, crew_id: string): BatchItem {
  if (typeof raw !== "object" || raw === null) {
    return { client_id: "unknown", reject: "invalid_schema" };
  }
  const item = raw as Record<string, unknown>;
  const client_id = typeof item.client_id === "string" ? item.client_id : "unknown";
  const fail = (reject: RejectReason): BatchItem => ({ client_id, reject });
  if (!isUUID(item.client_id)) return fail("invalid_schema");
  if (item.crew_id !== crew_id) return fail("wrong_crew");
  if (typeof item.assessed_at !== "string" || Number.isNaN(Date.parse(item.assessed_at))) return fail("invalid_schema");
  if (!STATUSES.includes(item.overall_status as string)) return fail("invalid_schema");
  if (!Array.isArray(item.per_measure)) return fail("invalid_schema");
  for (const key of ["model_id", "model_version", "catalog_version", "kb_version", "inputs_hash"] as const) {
    if (typeof item[key] !== "string") return fail("invalid_schema");
  }
  return {
    client_id,
    resultRow: {
      client_id,
      crew_id,
      assessed_at: item.assessed_at,
      overall_status: item.overall_status,
      per_measure_json: JSON.stringify(item.per_measure),
      model_advice_json: item.model_advice === null || item.model_advice === undefined ? null : JSON.stringify(item.model_advice),
      model_id: item.model_id,
      model_version: item.model_version,
      catalog_version: item.catalog_version,
      kb_version: item.kb_version,
      inputs_hash: item.inputs_hash,
      received_at: "",
    },
  };
}

function toStatements(
  db: D1Database,
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < rows.length; i += BATCH_ROWS) {
    const chunk = rows.slice(i, i + BATCH_ROWS);
    const placeholders = chunk.map(() => `(${columns.map(() => "?").join(", ")})`).join(", ");
    const stmt = db.prepare(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders} ON CONFLICT(client_id) DO NOTHING RETURNING client_id`
    );
    statements.push(stmt.bind(...chunk.flatMap((row) => columns.map((column) => row[column] ?? null))));
  }
  return statements;
}

export async function handleBatch(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut"]);
  if (!session.ok) return sessionError(session, request, requestId);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  if (typeof body !== "object" || body === null) {
    return error(400, "Body must be a JSON object", request, requestId);
  }
  const { schema_version, catalog_version, items, results, client_report } = body as Record<string, unknown>;
  if (schema_version !== 1 || typeof catalog_version !== "string" || !Array.isArray(items) || !Array.isArray(results)) {
    return error(400, "Invalid batch", request, requestId);
  }
  if (items.length + results.length > 1000) return error(413, "Batch too large", request, requestId);
  console.log("batch client_report", session.crew_id, JSON.stringify(client_report ?? null));

  const now = Date.now();
  const received_at = new Date(now).toISOString();
  const serverVersion = Number.parseInt(catalogVersion, 10);
  const itemVersion = Number.parseInt(catalog_version, 10);
  const catalogTooOld = Number.isInteger(itemVersion) && serverVersion - itemVersion > 1;

  const crewRow = await env.DB.prepare("SELECT provenance FROM crew WHERE id = ?")
    .bind(session.crew_id)
    .first<{ provenance: string }>();
  const allowedProvenance =
    crewRow === null ? null : crewRow.provenance === "real" ? ["real", "simulated_device"] : ["synthetic", "simulated_device"];

  const checked = (items as unknown[]).map((raw) =>
    catalogTooOld
      ? {
          client_id: typeof (raw as Record<string, unknown>)?.client_id === "string" ? (raw as Record<string, unknown>).client_id as string : "unknown",
          reject: "catalog_version_too_old" as RejectReason,
        }
      : checkMeasurement(raw, session.crew_id, now, serverVersion, allowedProvenance)
  );
  const checkedResults = (results as unknown[]).map((raw) => checkResult(raw, session.crew_id));

  const todayStart = received_at.slice(0, 10);
  const today = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM measurements WHERE crew_id = ? AND substr(received_at, 1, 10) >= ?"
  )
    .bind(session.crew_id, todayStart)
    .first<{ n: number }>();
  let remaining = Math.max(0, DAILY_CAP - (today?.n ?? 0));

  const accepted: BatchItem[] = [];
  const rejected: Array<{ client_id: string; reason: RejectReason }> = [];
  for (const item of checked) {
    if (item.reject) {
      rejected.push({ client_id: item.client_id, reason: item.reject });
      continue;
    }
    if (remaining <= 0) {
      rejected.push({ client_id: item.client_id, reason: "daily_cap_reached" });
      continue;
    }
    remaining -= 1;
    accepted.push(item);
  }

  const paired = new Set<string>();
  const groups = new Map<string, Measurement[]>();
  for (const item of accepted) {
    const capture_id = (item.row as Record<string, unknown>).capture_id as string | null;
    if (capture_id === null) continue;
    const group = groups.get(capture_id) ?? [];
    group.push(item.row as unknown as Measurement);
    groups.set(capture_id, group);
  }
  for (const group of groups.values()) {
    if (!validateCapture(group).ok) {
      for (const record of group) paired.add(record.client_id);
    }
  }
  for (const client_id of paired) {
    rejected.push({ client_id, reason: "bp_pair_invalid" });
  }
  const insertable = accepted.filter((item) => !paired.has(item.client_id));
  for (const item of insertable) {
    (item.row as Record<string, unknown>).received_at = received_at;
  }
  const insertableResults = checkedResults.filter((item) => !item.reject);
  for (const item of insertableResults) {
    (item.resultRow as Record<string, unknown>).received_at = received_at;
  }
  for (const item of checkedResults) {
    if (item.reject) rejected.push({ client_id: item.client_id, reason: item.reject });
  }

  const statements = [
    ...toStatements(env.DB, "measurements", MEASURE_COLUMNS, insertable.map((item) => item.row as Record<string, unknown>)),
    ...toStatements(env.DB, "results", RESULT_COLUMNS, insertableResults.map((item) => item.resultRow as Record<string, unknown>)),
  ];
  const inserted = new Set<string>();
  if (statements.length > 0) {
    const settled = await env.DB.batch(statements);
    for (const result of settled) {
      for (const row of result.results as Array<{ client_id: string }>) inserted.add(row.client_id);
    }
  }

  const response: Record<string, unknown> = {
    accepted: [...insertable, ...insertableResults]
      .filter((item) => inserted.has(item.client_id))
      .map((item) => item.client_id),
    duplicates: [...insertable, ...insertableResults]
      .filter((item) => !inserted.has(item.client_id))
      .map((item) => item.client_id),
    rejected,
    max_items: MAX_ITEMS,
  };
  if (rejected.some((entry) => entry.reason === "daily_cap_reached")) {
    response.retry_after = secondsUntilNextUtcDay(now);
  }
  return json(response, request, requestId);
}

function parseCursor(since: string | null): { received_at: string; client_id: string } {
  if (!since) return { received_at: "", client_id: "" };
  const pipe = since.indexOf("|");
  if (pipe === -1) return { received_at: since, client_id: "" };
  return { received_at: since.slice(0, pipe), client_id: since.slice(pipe + 1) };
}

const CURSOR_WHERE = "((received_at > ?) OR (received_at = ? AND client_id > ?))";

export async function handleSync(request: Request, env: Env, requestId: string, url: URL): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut"]);
  if (!session.ok) return sessionError(session, request, requestId);
  const cursor = parseCursor(url.searchParams.get("since"));
  const measurements = await env.DB.prepare(
    `SELECT * FROM measurements WHERE crew_id = ? AND ${CURSOR_WHERE} ORDER BY received_at ASC, client_id ASC LIMIT 500`
  )
    .bind(session.crew_id, cursor.received_at, cursor.received_at, cursor.client_id)
    .all();
  const results = await env.DB.prepare(
    `SELECT * FROM results WHERE crew_id = ? AND ${CURSOR_WHERE} ORDER BY received_at ASC, client_id ASC LIMIT 500`
  )
    .bind(session.crew_id, cursor.received_at, cursor.received_at, cursor.client_id)
    .all();
  const queued = await env.DB.prepare(
    "SELECT client_id, status FROM reports WHERE submitted_by = ? AND status IN ('delivered', 'acknowledged')"
  )
    .bind(session.crew_id)
    .all();
  const last = [...measurements.results, ...results.results].map((row) => ({
    received_at: (row as Record<string, string>).received_at,
    client_id: (row as Record<string, string>).client_id,
  }));
  const head = last.length > 0 ? last[last.length - 1] : null;
  return json(
    {
      measurements: measurements.results,
      results: results.results,
      reports_status: queued.results,
      cursor: head ? `${head.received_at}|${head.client_id}` : null,
    },
    request,
    requestId
  );
}

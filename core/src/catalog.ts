import catalogJson from "../content/catalog.json" with { type: "json" };

export const ROLES = ["astronaut", "flight_medical_officer", "mission_control"] as const;
export type Role = (typeof ROLES)[number];

export const SETTINGS = ["iss", "mars_transit", "moon_base", "rover"] as const;
export type Setting = (typeof SETTINGS)[number];

export const PHASES = ["preflight", "inflight", "surface", "postflight"] as const;
export type Phase = (typeof PHASES)[number];

export const SOURCES = [
  "manual",
  "questionnaire",
  "test",
  "import",
  "ble",
  "voice",
  "ocr",
  "camera_hr",
] as const;
export type Source = (typeof SOURCES)[number];

export const PROVENANCES = ["real", "synthetic", "simulated_device"] as const;
export type Provenance = (typeof PROVENANCES)[number];

export type LimitOp = "<" | "<=" | ">" | ">=";
export type LimitLevel = "watch" | "critical";

export interface CatalogLimit {
  level: LimitLevel;
  op: LimitOp;
  value: number;
  source: string;
  max?: number;
}

export interface CatalogMeasure {
  code: string;
  label: string;
  unit: string;
  value_type: string;
  origin: string;
  bounds: { min: number; max: number };
  limits: CatalogLimit[];
  limit_source: string;
  phase_offsets: Record<string, { baseline_shift: number }>;
  phase_offset_source?: string;
  sd_floor: number | null;
  min_baseline_readings: number;
  body_system: string;
  hazards: string[];
  guidance_key: string;
  aliases: string[];
}

export interface Catalog {
  catalog_version: string;
  measures: CatalogMeasure[];
}

const LIMIT_OPS: LimitOp[] = ["<", "<=", ">", ">="];

export function validateCatalog(raw: unknown): { ok: true; catalog: Catalog } | { ok: false; reason: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "catalog must be an object" };
  const root = raw as Record<string, unknown>;
  if (typeof root.catalog_version !== "string" || root.catalog_version.length === 0) {
    return { ok: false, reason: "catalog_version must be a non-empty string" };
  }
  if (!Array.isArray(root.measures) || root.measures.length === 0) {
    return { ok: false, reason: "measures must be a non-empty array" };
  }
  const codes = new Set<string>();
  for (const entry of root.measures) {
    if (typeof entry !== "object" || entry === null) return { ok: false, reason: "measure must be an object" };
    const measure = entry as Record<string, unknown>;
    if (typeof measure.code !== "string" || measure.code.length === 0) {
      return { ok: false, reason: "measure code must be a non-empty string" };
    }
    if (codes.has(measure.code)) return { ok: false, reason: `duplicate measure code '${measure.code}'` };
    codes.add(measure.code);
    if (typeof measure.body_system !== "string" || measure.body_system.length === 0) {
      return { ok: false, reason: `measure '${measure.code}' needs exactly one body_system` };
    }
    const bounds = measure.bounds as { min?: unknown; max?: unknown } | undefined;
    if (typeof bounds?.min !== "number" || typeof bounds?.max !== "number" || bounds.min >= bounds.max) {
      return { ok: false, reason: `measure '${measure.code}' needs bounds with min < max` };
    }
    if (!Array.isArray(measure.limits)) return { ok: false, reason: `measure '${measure.code}' needs a limits array` };
    for (const limit of measure.limits as Array<Record<string, unknown>>) {
      if (limit.level !== "watch" && limit.level !== "critical") {
        return { ok: false, reason: `measure '${measure.code}' has a limit with a bad level` };
      }
      if (!LIMIT_OPS.includes(limit.op as LimitOp)) {
        return { ok: false, reason: `measure '${measure.code}' has a limit with a bad op` };
      }
      if (typeof limit.value !== "number") {
        return { ok: false, reason: `measure '${measure.code}' has a limit with a non-numeric value` };
      }
      if (typeof limit.source !== "string" || limit.source.length === 0) {
        return { ok: false, reason: `measure '${measure.code}' has a limit without a source` };
      }
      if (limit.max !== undefined && (typeof limit.max !== "number" || limit.max < limit.value)) {
        return { ok: false, reason: `measure '${measure.code}' has a limit with a bad max bound` };
      }
    }
    if (typeof measure.limit_source !== "string" || measure.limit_source.length === 0) {
      return { ok: false, reason: `measure '${measure.code}' needs limit_source text` };
    }
  }
  return { ok: true, catalog: raw as Catalog };
}

const validated = validateCatalog(catalogJson);
if (!validated.ok) throw new Error(`Invalid catalog.json: ${validated.reason}`);

export const CATALOG: Catalog = validated.catalog;
export const catalogVersion: string = CATALOG.catalog_version;
export const KB_VERSION = "none";

const byCode = new Map(CATALOG.measures.map((measure) => [measure.code, measure]));
const byAlias = new Map<string, CatalogMeasure>();
for (const measure of CATALOG.measures) {
  for (const alias of measure.aliases) {
    if (!byAlias.has(alias)) byAlias.set(alias, measure);
  }
}

export function lookupMeasure(codeOrAlias: string): CatalogMeasure | null {
  return byCode.get(codeOrAlias) ?? byAlias.get(codeOrAlias) ?? null;
}

export function convertToCanonical(value: number, fromUnit: string, measure: CatalogMeasure): number | null {
  if (fromUnit === measure.unit) return value;
  const key = `${fromUnit}→${measure.unit}`;
  switch (key) {
    case "lb→kg":
    case "lbs→kg":
      return value * 0.45359237;
    case "kg→kg":
      return value;
    case "°F→°C":
    case "F→°C":
      return ((value - 32) * 5) / 9;
    case "mmol/L→mg/dL":
      return value * 18;
    case "mg/dL→mg/dL":
      return value;
    default:
      return null;
  }
}

export function sdFloorFor(measure: CatalogMeasure, baselineMean: number): number {
  if (measure.sd_floor !== null) return measure.sd_floor;
  return Math.abs(baselineMean) * 0.05;
}

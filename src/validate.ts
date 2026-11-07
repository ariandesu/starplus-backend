// Pure input validation. No I/O, so it can be unit tested directly.

export type Result<T> = { ok: true; value: T } | { ok: false; errors: string[] };

export const ROLES = ["astronaut", "flight_medical_officer", "mission_control"] as const;
export const CREW_STATUSES = ["active", "standby", "off-duty"] as const;

export interface AstronautInput {
  id: string;
  name: string;
  role: (typeof ROLES)[number];
  status: (typeof CREW_STATUSES)[number];
}

export interface VitalsInput {
  astronaut_id: string;
  heart_rate: number | null;
  blood_pressure_systolic: number | null;
  blood_pressure_diastolic: number | null;
  oxygen_saturation: number | null;
  temperature_c: number | null;
  /** D1 format "YYYY-MM-DD HH:MM:SS" (UTC). */
  timestamp: string;
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

/** Physiologically plausible bounds; values outside are almost certainly sensor or entry errors. */
const VITAL_BOUNDS = {
  heart_rate: { min: 20, max: 250, integer: true },
  blood_pressure_systolic: { min: 50, max: 260, integer: true },
  blood_pressure_diastolic: { min: 20, max: 160, integer: true },
  oxygen_saturation: { min: 50, max: 100, integer: true },
  temperature_c: { min: 30, max: 44, integer: false },
} as const;

type VitalKey = keyof typeof VITAL_BOUNDS;
const VITAL_KEYS = Object.keys(VITAL_BOUNDS) as VitalKey[];

/** Converts a Date to the "YYYY-MM-DD HH:MM:SS" UTC form D1 uses for CURRENT_TIMESTAMP. */
export function toD1Time(d: Date): string {
  return d.toISOString().slice(0, 19).replace("T", " ");
}

export function validateId(value: unknown, field: string, errors: string[]): string | null {
  if (typeof value !== "string" || !ID_RE.test(value)) {
    errors.push(`${field} must be 1-32 characters: letters, digits, '-' or '_'`);
    return null;
  }
  return value;
}

export function validateAstronaut(body: Record<string, unknown>): Result<AstronautInput> {
  const errors: string[] = [];
  const id = validateId(body.id, "id", errors);

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < 1 || name.length > 100) errors.push("name must be 1-100 characters");

  const role = body.role;
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role))
    errors.push(`role must be one of: ${ROLES.join(", ")}`);

  const status = body.status ?? "active";
  if (typeof status !== "string" || !(CREW_STATUSES as readonly string[]).includes(status))
    errors.push(`status must be one of: ${CREW_STATUSES.join(", ")}`);

  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    value: { id: id!, name, role: role as AstronautInput["role"], status: status as AstronautInput["status"] },
  };
}

export function validateVitals(body: Record<string, unknown>, now: Date = new Date()): Result<VitalsInput> {
  const errors: string[] = [];
  const astronaut_id = validateId(body.astronaut_id, "astronaut_id", errors);

  const values = {} as Record<VitalKey, number | null>;
  for (const key of VITAL_KEYS) {
    const raw = body[key];
    if (raw === undefined || raw === null) {
      values[key] = null;
      continue;
    }
    const { min, max, integer } = VITAL_BOUNDS[key];
    if (typeof raw !== "number" || !Number.isFinite(raw)) {
      errors.push(`${key} must be a number`);
    } else if (integer && !Number.isInteger(raw)) {
      errors.push(`${key} must be a whole number`);
    } else if (raw < min || raw > max) {
      errors.push(`${key} must be between ${min} and ${max}`);
    } else {
      values[key] = raw;
    }
  }

  if (VITAL_KEYS.every((k) => body[k] === undefined || body[k] === null))
    errors.push("at least one vital measurement is required");

  const sys = values.blood_pressure_systolic;
  const dia = values.blood_pressure_diastolic;
  if ((body.blood_pressure_systolic != null) !== (body.blood_pressure_diastolic != null))
    errors.push("blood_pressure_systolic and blood_pressure_diastolic must be sent together");
  if (sys != null && dia != null && dia >= sys)
    errors.push("blood_pressure_diastolic must be lower than blood_pressure_systolic");

  // Optional timestamp, for backfilling readings taken earlier.
  let timestamp = toD1Time(now);
  if (body.timestamp !== undefined) {
    const t = typeof body.timestamp === "string" ? new Date(body.timestamp) : null;
    if (!t || Number.isNaN(t.getTime())) {
      errors.push("timestamp must be an ISO 8601 date-time");
    } else if (t.getTime() > now.getTime() + 5 * 60_000) {
      errors.push("timestamp cannot be in the future");
    } else if (t.getTime() < now.getTime() - 365 * 86_400_000) {
      errors.push("timestamp cannot be more than a year old");
    } else {
      timestamp = toD1Time(t);
    }
  }

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { astronaut_id: astronaut_id!, ...values, timestamp } };
}

/** Parses ?limit= with a default and a hard cap. */
export function parseLimit(raw: string | null, fallback: number, max: number): number {
  const n = raw == null ? fallback : Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

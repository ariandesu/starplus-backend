import type { Measurement } from "./record.ts";

export interface GamificationOptions {
  timeZone?: string;
  referenceDate?: string;
}

export interface DayScore {
  day: string;
  checkIn: boolean;
  exercise: boolean;
  sleep: boolean;
  hydration: boolean;
  points: number;
}

export interface MissionPatch {
  id: string;
  name: string;
  days: number;
}

const EXERCISE_METRICS = new Set(["physical_activity"]);
const SLEEP_METRICS = new Set(["sleep_hours", "sleep_quality"]);
const HYDRATION_METRICS = new Set(["water_intake", "urine_specific_gravity"]);

export const DAILY_POINT_CAP = 4;

export const MISSION_PATCHES: MissionPatch[] = [
  { id: "first-week", name: "First Week", days: 7 },
  { id: "fortnight", name: "Fortnight", days: 14 },
  { id: "lunar-month", name: "Lunar Month", days: 30 },
  { id: "season", name: "Season", days: 90 },
];

export function localDay(iso: string, timeZone = "UTC"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
  return parts;
}

export function todayLocal(timeZone = "UTC", now = Date.now()): string {
  return localDay(new Date(now).toISOString(), timeZone);
}

export function shiftDay(day: string, offset: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + offset * 86_400_000);
  return date.toISOString().slice(0, 10);
}

function eligible(m: Measurement): boolean {
  return m.provenance === "real" && m.is_estimate === 0 && m.voided === 0;
}

export function scoreDays(
  measurements: Measurement[],
  checkIns: Array<{ assessed_at: string }>,
  options: GamificationOptions = {}
): DayScore[] {
  const timeZone = options.timeZone ?? "UTC";
  const byDay = new Map<string, DayScore>();
  const at = (day: string): DayScore => {
    let score = byDay.get(day);
    if (!score) {
      score = { day, checkIn: false, exercise: false, sleep: false, hydration: false, points: 0 };
      byDay.set(day, score);
    }
    return score;
  };

  for (const result of checkIns) {
    at(localDay(result.assessed_at, timeZone)).checkIn = true;
  }
  for (const m of measurements) {
    if (!eligible(m)) continue;
    const score = at(localDay(m.measured_at, timeZone));
    if (EXERCISE_METRICS.has(m.metric)) score.exercise = true;
    if (SLEEP_METRICS.has(m.metric)) score.sleep = true;
    if (HYDRATION_METRICS.has(m.metric)) score.hydration = true;
  }

  const days = [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const score of days) {
    score.points = Math.min(
      DAILY_POINT_CAP,
      (score.checkIn ? 1 : 0) + (score.exercise ? 1 : 0) + (score.sleep ? 1 : 0) + (score.hydration ? 1 : 0)
    );
  }
  return days;
}

export function streakDays(activeDays: string[], today: string, restPerWeek = 1): number {
  const active = new Set(activeDays);
  if (active.size === 0) return 0;
  let cursor = today;
  if (!active.has(cursor)) cursor = shiftDay(cursor, -1);
  let streak = 0;
  let misses = 0;
  let windowDays = 0;
  for (let guard = 0; guard < 3 * 366; guard++) {
    if (active.has(cursor)) {
      streak += 1;
    } else {
      if (misses >= restPerWeek) break;
      misses += 1;
    }
    windowDays += 1;
    if (windowDays % 7 === 0) misses = 0;
    cursor = shiftDay(cursor, -1);
  }
  return streak;
}

export function patchesForStreak(streak: number): MissionPatch[] {
  return MISSION_PATCHES.filter((patch) => streak >= patch.days);
}

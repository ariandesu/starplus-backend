/**
 * Live AI consultancy (demo only, Contributor mode to keep costs down).
 *
 * The app itself holds no secrets, so the Meta key lives on the Worker and
 * the frontend talks to this proxy. Only public knowledge-base and formulary
 * text plus the user's own question are ever sent to Meta — never
 * measurements, values, names or report text. Replies pass the same
 * `filterExplanation` filters as the build-time templates. Three server-side
 * limits apply, all keyed on data the client cannot change: 10 calls per
 * session per rolling hour, 30 per crew member per rolling hour, and 300 for
 * the whole service per rolling 24 hours; past any of them the answer tells
 * them to contact their flight surgeon. The client's `device_id` is stored
 * (truncated) for diagnosis only and never decides a limit.
 */
import type { FormularyEntry, KbCitation, KbEntry } from "@starplus/core";
import { filterExplanation } from "../core/explain/filters.ts";
import { requireSession, sessionError } from "./auth.ts";
import type { Env } from "./env.ts";
import { error, json, readJsonObject } from "./http.ts";
import formularyFile from "../core/content/formulary.json" with { type: "json" };
import aidAnaphylaxis from "../core/content/kb/firstaid-anaphylaxis.json" with { type: "json" };
import aidBleeding from "../core/content/kb/firstaid-bleeding.json" with { type: "json" };
import aidBurns from "../core/content/kb/firstaid-burns.json" with { type: "json" };
import aidChestPain from "../core/content/kb/firstaid-chest-pain.json" with { type: "json" };
import aidChoking from "../core/content/kb/firstaid-choking.json" with { type: "json" };
import aidCpr from "../core/content/kb/firstaid-cpr.json" with { type: "json" };
import aidFainting from "../core/content/kb/firstaid-fainting.json" with { type: "json" };
import aidLowBloodSugar from "../core/content/kb/firstaid-low-blood-sugar.json" with { type: "json" };
import aidUnresponsive from "../core/content/kb/firstaid-unresponsive.json" with { type: "json" };
import hazardAlteredGravity from "../core/content/kb/hazard-altered-gravity.json" with { type: "json" };
import hazardDistance from "../core/content/kb/hazard-distance-from-earth.json" with { type: "json" };
import hazardEnvironment from "../core/content/kb/hazard-hostile-environment.json" with { type: "json" };
import hazardIsolation from "../core/content/kb/hazard-isolation-confinement.json" with { type: "json" };
import hazardRadiation from "../core/content/kb/hazard-radiation.json" with { type: "json" };
import measureActivity from "../core/content/kb/measure-activity.json" with { type: "json" };
import measureBodyMass from "../core/content/kb/measure-body-mass.json" with { type: "json" };
import measureCalories from "../core/content/kb/measure-calories.json" with { type: "json" };
import measureDiastolic from "../core/content/kb/measure-diastolic-bp.json" with { type: "json" };
import measureGlucose from "../core/content/kb/measure-glucose.json" with { type: "json" };
import measureHeartRate from "../core/content/kb/measure-heart-rate.json" with { type: "json" };
import measureHrv from "../core/content/kb/measure-hrv.json" with { type: "json" };
import measureHydration from "../core/content/kb/measure-hydration.json" with { type: "json" };
import measureMood from "../core/content/kb/measure-mood.json" with { type: "json" };
import measureRadiation from "../core/content/kb/measure-radiation.json" with { type: "json" };
import measureReaction from "../core/content/kb/measure-reaction.json" with { type: "json" };
import measureResp from "../core/content/kb/measure-respiratory-rate.json" with { type: "json" };
import measureSleep from "../core/content/kb/measure-sleep.json" with { type: "json" };
import measureSleepQuality from "../core/content/kb/measure-sleep-quality.json" with { type: "json" };
import measureSpo2 from "../core/content/kb/measure-spo2.json" with { type: "json" };
import measureStress from "../core/content/kb/measure-stress.json" with { type: "json" };
import measureSystolic from "../core/content/kb/measure-systolic-bp.json" with { type: "json" };
import measureTemp from "../core/content/kb/measure-temperature.json" with { type: "json" };
import measureWater from "../core/content/kb/measure-water.json" with { type: "json" };

const KB: Record<string, KbEntry> = {
  "firstaid-anaphylaxis": aidAnaphylaxis as KbEntry,
  "firstaid-bleeding": aidBleeding as KbEntry,
  "firstaid-burns": aidBurns as KbEntry,
  "firstaid-chest-pain": aidChestPain as KbEntry,
  "firstaid-choking": aidChoking as KbEntry,
  "firstaid-cpr": aidCpr as KbEntry,
  "firstaid-fainting": aidFainting as KbEntry,
  "firstaid-low-blood-sugar": aidLowBloodSugar as KbEntry,
  "firstaid-unresponsive": aidUnresponsive as KbEntry,
  "hazard-altered-gravity": hazardAlteredGravity as KbEntry,
  "hazard-distance-from-earth": hazardDistance as KbEntry,
  "hazard-hostile-environment": hazardEnvironment as KbEntry,
  "hazard-isolation-confinement": hazardIsolation as KbEntry,
  "hazard-radiation": hazardRadiation as KbEntry,
  "measure-activity": measureActivity as KbEntry,
  "measure-body-mass": measureBodyMass as KbEntry,
  "measure-calories": measureCalories as KbEntry,
  "measure-diastolic-bp": measureDiastolic as KbEntry,
  "measure-glucose": measureGlucose as KbEntry,
  "measure-heart-rate": measureHeartRate as KbEntry,
  "measure-hrv": measureHrv as KbEntry,
  "measure-hydration": measureHydration as KbEntry,
  "measure-mood": measureMood as KbEntry,
  "measure-radiation": measureRadiation as KbEntry,
  "measure-reaction": measureReaction as KbEntry,
  "measure-respiratory-rate": measureResp as KbEntry,
  "measure-sleep": measureSleep as KbEntry,
  "measure-sleep-quality": measureSleepQuality as KbEntry,
  "measure-spo2": measureSpo2 as KbEntry,
  "measure-stress": measureStress as KbEntry,
  "measure-systolic-bp": measureSystolic as KbEntry,
  "measure-temperature": measureTemp as KbEntry,
  "measure-water": measureWater as KbEntry,
};

const FORMULARY = (formularyFile as { entries: FormularyEntry[] }).entries;
const formularyById = new Map(FORMULARY.map((entry) => [entry.id, entry]));

export const CONSULT_MODEL = "muse-spark-1.3-contributor";
const META_URL = "https://api.meta.ai/v1/chat/completions";
const MAX_PER_SESSION_HOUR = 10;
const MAX_PER_CREW_HOUR = 30;
const MAX_GLOBAL_DAY = 300;
const MAX_QUESTION_CHARS = 500;
const MAX_ENTRY_IDS = 5;
const FLIGHT_SURGEON_LINE = "For more help, contact your flight surgeon.";

/** Parse-and-default, same pattern as SIGNIN_RATE_MAX in better-auth.ts. */
function consultLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

interface WindowUse {
  n: number;
  oldest: string | null;
}

/** Calls logged in a rolling window, optionally for one key (a session or a crew). */
async function windowUse(db: D1Database, keyColumn: string | null, key: string, since: string): Promise<WindowUse> {
  const filter = keyColumn === null ? "1 = 1" : `${keyColumn} = ?`;
  const bindings = keyColumn === null ? [since] : [key, since];
  const row = await db
    .prepare(`SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM consult_log WHERE ${filter} AND created_at > ?`)
    .bind(...bindings)
    .first<{ n: number; oldest: string | null }>();
  return { n: row?.n ?? 0, oldest: row?.oldest ?? null };
}

function retryAfterSeconds(used: WindowUse, windowSeconds: number): number {
  const elapsed = used.oldest === null ? 0 : Math.floor((Date.now() - Date.parse(used.oldest)) / 1000);
  return Math.max(60, windowSeconds - elapsed);
}

const BASE_RULES = [
  "Explain in plain words using only the sources below.",
  "Never invent numbers, units, doses, routes or times that are not in the sources.",
  "Never state a medicine strength, amount or dosing schedule.",
  "Never soften a health status: do not say normal, fine, nothing to worry about, or all clear.",
  "No diagnosis. End with one line telling the reader to follow the flight surgeon or mission protocol.",
  "Keep the answer under 120 words.",
].join(" ");

export interface ConsultPrompt {
  system: string;
  user: string;
  sourceText: string;
  citations: KbCitation[];
}

function cite(entry: { citations: KbCitation[] }): string {
  return entry.citations.map((c) => `${c.title} — ${c.publisher}, ${c.year}`).join("; ");
}

/** A question about KB entries. Only public source text plus the question. */
export function buildQuestionPrompt(question: string, entries: KbEntry[]): ConsultPrompt {
  const sources = entries.map((entry, index) => `[${index + 1}] ${entry.text.join(" ")} (${cite(entry)})`);
  const sourceText = entries.map((entry) => entry.text.join(" ")).join("\n");
  return {
    system: `You are a plain-words explainer for astronaut self-check information. ${BASE_RULES}`,
    user: `Sources:\n${sources.join("\n")}\n\nQuestion: ${question}\n\nExplain in plain words.`,
    sourceText,
    citations: entries.flatMap((entry) => entry.citations),
  };
}

/** A medicine explainer: components, use case and side effects, from the formulary entry. */
export function buildMedicinePrompt(entry: FormularyEntry): ConsultPrompt {
  const sourceText = [
    `Name: ${entry.name}`,
    `Purpose: ${entry.purpose}`,
    `Side effects: ${entry.side_effects}`,
    `Interactions: ${entry.interactions}`,
  ].join("\n");
  return {
    system: `You explain onboard medicines in plain words. ${BASE_RULES} Cover three headings: Components, Use, Side effects. Do not mention doses, strengths or schedules; the app shows the quoted dose separately.`,
    user: `Formulary entry:\n${sourceText}\n\nExplain the components, what it is used for, and its side effects in plain words.`,
    sourceText,
    citations: entry.citations,
  };
}

/** A non-2xx reply from Meta, carrying only the status. */
class MetaStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Meta API ${status}`);
    this.status = status;
  }
}

async function completeMeta(key: string, prompt: ConsultPrompt, strict: boolean): Promise<string> {
  const system = strict
    ? `${prompt.system} If a detail is not in the sources, leave it out rather than guessing.`
    : prompt.system;
  // Same shape as tools/pregenerate.ts (the known-working call): model and
  // messages only, no extra parameters.
  const res = await fetch(META_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: CONSULT_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt.user },
      ],
    }),
  });
  if (!res.ok) throw new MetaStatusError(res.status);
  const data = (await res.json()) as {
    choices?: { message?: { content?: unknown }; finish_reason?: unknown }[];
  };
  const choice = data.choices?.[0];
  const content = typeof choice?.message?.content === "string" ? choice.message.content.trim() : "";
  if (!content) throw new Error("Meta API returned no content");
  return content;
}

async function answerSafely(key: string, prompt: ConsultPrompt): Promise<string | null> {
  const first = await completeMeta(key, prompt, false);
  if (filterExplanation(first, prompt.sourceText).length === 0) return first;
  const second = await completeMeta(key, prompt, true);
  if (filterExplanation(second, prompt.sourceText).length === 0) return second;
  return null;
}

export async function handleConsult(request: Request, env: Env, requestId: string): Promise<Response> {
  const session = await requireSession(request, env, ["astronaut", "flight_medical_officer", "mission_control"]);
  if (!session.ok) return sessionError(session, request, requestId);

  const body = await readJsonObject(request);
  const kind = body?.kind;
  const deviceRaw = body?.device_id;
  const deviceId = typeof deviceRaw === "string" ? deviceRaw.trim().slice(0, 64) : "";
  if (kind !== "question" && kind !== "medicine") {
    return error(400, "kind must be 'question' or 'medicine'", request, requestId);
  }

  let prompt: ConsultPrompt;
  if (kind === "question") {
    const question = typeof body?.question === "string" ? body.question.trim() : "";
    const entryIds = Array.isArray(body?.entry_ids) ? body.entry_ids : [];
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return error(400, "question must be 1-500 characters", request, requestId);
    }
    if (entryIds.length === 0 || entryIds.length > MAX_ENTRY_IDS || !entryIds.every((id) => typeof id === "string" && KB[id])) {
      return error(400, `entry_ids must list 1-${MAX_ENTRY_IDS} known entries`, request, requestId);
    }
    prompt = buildQuestionPrompt(question, entryIds.map((id: string) => KB[id]));
  } else {
    const medicineId = typeof body?.medicine_id === "string" ? body.medicine_id : "";
    const entry = formularyById.get(medicineId);
    if (!entry) return error(400, "unknown medicine_id", request, requestId);
    prompt = buildMedicinePrompt(entry);
  }

  const limited = (message: string, retryAfter: number) => {
    const response = error(429, message, request, requestId);
    response.headers.set("Retry-After", String(retryAfter));
    return response;
  };

  const sessionLimit = consultLimit(env.CONSULT_SESSION_HOURLY, MAX_PER_SESSION_HOUR);
  const crewLimit = consultLimit(env.CONSULT_CREW_HOURLY, MAX_PER_CREW_HOUR);
  const globalLimit = consultLimit(env.CONSULT_GLOBAL_DAILY, MAX_GLOBAL_DAY);
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

  const sessionUse = await windowUse(env.DB, "session_id", session.session_id, hourAgo);
  if (sessionUse.n >= sessionLimit) {
    return limited(
      `Question limit reached for this hour (${sessionLimit}). ${FLIGHT_SURGEON_LINE}`,
      retryAfterSeconds(sessionUse, 3600)
    );
  }
  const crewUse = await windowUse(env.DB, "crew_id", session.crew_id, hourAgo);
  if (crewUse.n >= crewLimit) {
    return limited(
      `Question limit reached for this hour (${crewLimit} for this crew). ${FLIGHT_SURGEON_LINE}`,
      retryAfterSeconds(crewUse, 3600)
    );
  }
  const globalUse = await windowUse(env.DB, null, "", dayAgo);
  if (globalUse.n >= globalLimit) {
    return limited(
      `The assistant has reached today's limit. ${FLIGHT_SURGEON_LINE}`,
      retryAfterSeconds(globalUse, 86_400)
    );
  }
  await env.DB.prepare("INSERT INTO consult_log (crew_id, device_id, session_id, created_at) VALUES (?, ?, ?, ?)")
    .bind(session.crew_id, deviceId, session.session_id, new Date().toISOString())
    .run();

  const key = env.META_MODEL_API_KEY;
  if (!key) return error(503, "AI consultancy is not configured on this server.", request, requestId);

  let answer: string | null;
  try {
    answer = await answerSafely(key, prompt);
  } catch (err) {
    console.error("consult meta failed", err instanceof MetaStatusError ? err.status : "unknown");
    return error(502, `The assistant is unavailable right now. ${FLIGHT_SURGEON_LINE}`, request, requestId);
  }
  if (!answer) {
    return error(502, `The assistant could not answer safely. ${FLIGHT_SURGEON_LINE}`, request, requestId);
  }
  return json({ answer, citations: prompt.citations, model: CONSULT_MODEL }, request, requestId);
}

import { SELF, env } from "cloudflare:test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildMedicinePrompt, buildQuestionPrompt, CONSULT_MODEL, handleConsult } from "../../src/consult.ts";
import { filterExplanation } from "../../core/explain/filters.ts";
import cprKb from "../../core/content/kb/firstaid-cpr.json" with { type: "json" };
import unresponsiveKb from "../../core/content/kb/firstaid-unresponsive.json" with { type: "json" };
import spo2Kb from "../../core/content/kb/measure-spo2.json" with { type: "json" };
import heartRateKb from "../../core/content/kb/measure-heart-rate.json" with { type: "json" };
import { postJson, signInCrew } from "./helpers";

let sequence = 900;
const uuid = () => `cccccccc-dddd-4eee-9fff-${String(sequence++).padStart(12, "0")}`;

const realFetch = globalThis.fetch;
let metaCalls: { system: string; user: string }[] = [];
let metaReply = "Plain-words answer.";
let metaStatus = 200;

beforeEach(() => {
  metaCalls = [];
  metaReply = "Plain-words answer.";
  metaStatus = 200;
  globalThis.fetch = (async (input: unknown, init?: { body?: unknown }) => {
    if (String(input).includes("api.meta.ai")) {
      const body = JSON.parse(String((init as { body?: string })?.body ?? "{}")) as {
        model?: string;
        messages?: { role: string; content: string }[];
      };
      expect(body.model).toBe(CONSULT_MODEL);
      metaCalls.push({ system: body.messages?.[0]?.content ?? "", user: body.messages?.[1]?.content ?? "" });
      return new Response(JSON.stringify({ choices: [{ message: { content: metaReply } }] }), {
        status: metaStatus,
      });
    }
    return realFetch(input as RequestInfo, init as RequestInit);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

let crewSeq = 0;
async function freshCrew(): Promise<{ crewId: string; token: string }> {
  crewSeq += 1;
  const crewId = `consult-crew-${crewSeq}`;
  const created = await postJson(
    "/api/admin/crew",
    { id: crewId, name: crewId, role: "astronaut", provenance: "real" },
    { Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json" },
    "10.9.0.1"
  );
  expect(created.status).toBe(201);
  await created.text();
  const issued = await postJson(
    "/api/admin/codes",
    { crew_id: crewId },
    { Authorization: `Bearer ${env.API_KEY}`, "Content-Type": "application/json" },
    "10.9.0.1"
  );
  expect(issued.status).toBe(201);
  await issued.text();
  const token = await signInCrew(crewId, "10.9.0.1");
  return { crewId, token };
}

function consult(token: string, body: unknown, ip = "10.9.0.2") {
  return postJson(
    "/api/consult",
    body,
    { Authorization: `Bearer ${token}` },
    ip
  );
}

const measurement = (crewId: string, value: number) => ({
  client_id: uuid(),
  crew_id: crewId,
  metric: "heart_rate",
  value_num: value,
  value_text: null,
  unit: "bpm",
  measured_at: "2026-11-10T10:00:00Z",
  received_at: "",
  source: "manual",
  device_id: "device-9",
  capture_id: null,
  is_estimate: 0,
  confirmed_by_user: 0,
  provenance: "real",
  setting: "iss",
  phase: "inflight",
  phase_day: 21,
  supersedes_client_id: null,
  voided: 0,
  catalog_version: "1",
  schema_version: 1,
});

describe("consult", () => {
  it("needs a session", async () => {
    const res = await postJson("/api/consult", { kind: "question", question: "hi", entry_ids: ["measure-heart-rate"] });
    expect(res.status).toBe(401);
    await res.text();
  });

  it("503s when the Meta key is not configured", async () => {
    const { token } = await freshCrew();
    const { META_MODEL_API_KEY: _drop, ...noKeyEnv } = env as unknown as Record<string, unknown>;
    void _drop;
    const res = await handleConsult(
      new Request("https://example.com/api/consult", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "question",
          question: "What is heart rate?",
          entry_ids: ["measure-heart-rate"],
          device_id: "nokey-device",
        }),
      }),
      noKeyEnv as never,
      "test-request-id"
    );
    expect(res.status).toBe(503);
    await res.text();
  });

  it("answers a question from KB sources and cites them", async () => {
    const { token } = await freshCrew();
    // The mock reply reuses source wording so the safety filters pass.
    metaReply = (heartRateKb as { text: string[] }).text[0];
    const res = await consult(token, {
      kind: "question",
      question: "What is heart rate in plain words?",
      entry_ids: ["measure-heart-rate"],
      device_id: "q-device",
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { answer: string; citations: { title: string }[]; model: string };
    expect(data.answer).toBe((heartRateKb as { text: string[] }).text[0]);
    expect(data.model).toBe(CONSULT_MODEL);
    expect(data.citations.length).toBeGreaterThan(0);
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].user).toContain("What is heart rate in plain words?");
  });

  it("never sends measurements to Meta", async () => {
    const { crewId, token } = await freshCrew();
    metaReply = (heartRateKb as { text: string[] }).text[0];
    const batch = await SELF.fetch("https://example.com/api/measurements/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "CF-Connecting-IP": "10.9.0.3" },
      body: JSON.stringify({
        schema_version: 1,
        catalog_version: "1",
        items: [measurement(crewId, 187)],
        results: [],
      }),
    });
    expect(batch.status).toBe(200);
    await batch.text();
    const res = await consult(
      token,
      { kind: "question", question: "Explain my reading?", entry_ids: ["measure-heart-rate"], device_id: "leak-device" },
      "10.9.0.3"
    );
    expect(res.status).toBe(200);
    await res.json();
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].user).not.toContain("187");
    expect(metaCalls[0].user).not.toContain("measured_at");
    expect(metaCalls[0].user).not.toContain("value_num");
  });

  it("explains a medicine from the formulary entry", async () => {
    const { token } = await freshCrew();
    const res = await consult(token, { kind: "medicine", medicine_id: "acetaminophen", device_id: "m-device" });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { answer: string; citations: unknown[] };
    expect(data.answer).toBe("Plain-words answer.");
    expect(data.citations.length).toBeGreaterThan(0);
    expect(metaCalls).toHaveLength(1);
    expect(metaCalls[0].user).toContain("Acetaminophen");
  });

  it("keeps doses out of the medicine prompt and fails closed on a dose reply", async () => {
    const prompt = buildMedicinePrompt({
      id: "dose-med",
      name: "Dose Med",
      purpose: "Use.",
      side_effects: "Effects.",
      interactions: "None.",
      dose: "500 mg every 6 hours",
      citations: [],
    });
    for (const text of [prompt.user, prompt.system, prompt.sourceText]) {
      expect(text).not.toContain("500");
      expect(text).not.toContain("every 6 hours");
    }
    const { token } = await freshCrew();
    metaReply = "Take 500 mg now, and another 500 mg later.";
    const res = await consult(token, { kind: "medicine", medicine_id: "acetaminophen", device_id: "dose-device" });
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("flight surgeon");
  });

  it("stops one session at the session limit with a fresh device_id on every call", async () => {
    const { token } = await freshCrew();
    for (let i = 0; i < 3; i++) {
      const res = await consult(
        token,
        { kind: "medicine", medicine_id: "ibuprofen", device_id: `random-device-${uuid()}` },
        "10.9.0.4"
      );
      expect(res.status).toBe(200);
      await res.json();
    }
    const limited = await consult(
      token,
      { kind: "medicine", medicine_id: "ibuprofen", device_id: `random-device-${uuid()}` },
      "10.9.0.4"
    );
    expect(limited.status).toBe(429);
    const text = await limited.text();
    expect(text).toContain("3");
    expect(text.toLowerCase()).toContain("flight surgeon");
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });

  it("stops a crew member at the crew limit across sessions", async () => {
    const { crewId, token: first } = await freshCrew();
    const second = await signInCrew(crewId, "10.9.0.1");
    const ask = (token: string, device: string) =>
      consult(token, { kind: "medicine", medicine_id: "ibuprofen", device_id: device }, "10.9.0.4");
    for (let i = 0; i < 3; i++) {
      const res = await ask(first, `crew-a-${uuid()}`);
      expect(res.status).toBe(200);
      await res.json();
    }
    for (let i = 0; i < 2; i++) {
      const res = await ask(second, `crew-b-${uuid()}`);
      expect(res.status).toBe(200);
      await res.json();
    }
    const limited = await ask(second, `crew-b-${uuid()}`);
    expect(limited.status).toBe(429);
    const text = await limited.text();
    expect(text).toContain("for this crew");
    expect(text.toLowerCase()).toContain("flight surgeon");
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });

  it("stops the whole service at the global limit", async () => {
    for (let i = 0; i < 8; i++) {
      const { token } = await freshCrew();
      const res = await consult(
        token,
        { kind: "medicine", medicine_id: "ibuprofen", device_id: `global-${uuid()}` },
        "10.9.0.5"
      );
      expect(res.status).toBe(200);
      await res.json();
    }
    const { token } = await freshCrew();
    const limited = await consult(
      token,
      { kind: "medicine", medicine_id: "ibuprofen", device_id: `global-${uuid()}` },
      "10.9.0.5"
    );
    expect(limited.status).toBe(429);
    const text = await limited.text();
    expect(text).toContain("today's limit");
    expect(text.toLowerCase()).toContain("flight surgeon");
    expect(limited.headers.get("Retry-After")).not.toBeNull();
  });

  it("retries once on filtered output, then fails closed", async () => {
    const { token } = await freshCrew();
    metaReply = "Take 500 mg daily, nothing to worry about.";
    const res = await consult(
      token,
      { kind: "question", question: "What is heart rate?", entry_ids: ["measure-heart-rate"], device_id: "filter-device" }
    );
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(text.toLowerCase()).toContain("flight surgeon");
    expect(metaCalls).toHaveLength(2);
  });

  it("logs no key material when Meta fails", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { token } = await freshCrew();
      metaStatus = 500;
      const res = await consult(token, {
        kind: "question",
        question: "What is heart rate?",
        entry_ids: ["measure-heart-rate"],
        device_id: "log-device",
      });
      expect(res.status).toBe(502);
      await res.text();
      const logged = spy.mock.calls.flat().map((arg) => String(arg));
      expect(logged.some((line) => line.includes("key_len"))).toBe(false);
      expect(logged.some((line) => line.includes("test-meta-key"))).toBe(false);
      expect(logged.some((line) => line.includes("consult meta failed"))).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it("502s when Meta is down", async () => {
    const { token } = await freshCrew();
    metaStatus = 500;
    const res = await consult(
      token,
      { kind: "question", question: "What is heart rate?", entry_ids: ["measure-heart-rate"], device_id: "down-device" }
    );
    expect(res.status).toBe(502);
    await res.text();
  });

  it("validates input", async () => {
    const { token } = await freshCrew();
    for (const body of [
      { kind: "ask-me-anything" },
      { kind: "question", question: "", entry_ids: ["measure-heart-rate"] },
      { kind: "question", question: "x".repeat(501), entry_ids: ["measure-heart-rate"] },
      { kind: "question", question: "hi", entry_ids: [] },
      { kind: "question", question: "hi", entry_ids: ["nope"] },
      { kind: "medicine", medicine_id: "nope" },
    ]) {
      const res = await consult(token, { ...body, device_id: "valid-device" });
      expect(res.status).toBe(400);
      await res.text();
    }
    expect(metaCalls).toHaveLength(0);
  });

  it("asks the model to keep safety qualifiers and to add no source labels", () => {
    for (const entry of [heartRateKb, cprKb, unresponsiveKb]) {
      const prompt = buildQuestionPrompt("Why?", [entry as never]);
      expect(prompt.system).toContain("Keep every safety qualifier");
      expect(prompt.system).not.toContain("do not say normal");
      expect(prompt.system).toContain("Do not add source labels or reference numbers such as [1].");
    }
  });

  it("accepts a heart-rate answer that keeps 'A normal resting rate'", async () => {
    const { token } = await freshCrew();
    metaReply = (heartRateKb as { text: string[] }).text[0];
    const res = await consult(token, {
      kind: "question",
      question: "Why does resting heart rate matter in space?",
      entry_ids: ["measure-heart-rate"],
      device_id: "keep-normal-device",
    });
    expect(res.status).toBe(200);
    await res.json();
  });

  it("still rejects calling the reader's own result normal", async () => {
    const sourceText = (spo2Kb as { text: string[] }).text.join(" ");
    expect(filterExplanation("Your result is normal.", sourceText).join("\n")).toContain(
      "softens the result: 'normal'"
    );
    const { token } = await freshCrew();
    metaReply = "Your result is normal.";
    const res = await consult(token, {
      kind: "question",
      question: "What is oxygen saturation?",
      entry_ids: ["measure-spo2"],
      device_id: "soften-device",
    });
    expect(res.status).toBe(502);
    await res.text();
  });

  it("still rejects a CPR answer that drops 'normal' from the source", async () => {
    const sourceText = (cprKb as { text: string[] }).text.join(" ");
    metaReply =
      "Start compressions at once if there is no breathing: heel of the hand on the centre of the chest.";
    expect(filterExplanation(metaReply, sourceText).join("\n")).toContain("drops 'normal'");
    const { token } = await freshCrew();
    const res = await consult(token, {
      kind: "question",
      question: "How do I start CPR?",
      entry_ids: ["firstaid-cpr"],
      device_id: "must-keep-device",
    });
    expect(res.status).toBe(502);
    await res.text();
  });

  it("builds prompts from public sources only", () => {
    const prompt = buildQuestionPrompt("Why?", [
      { id: "x", text: ["Source words."], citations: [] } as never,
    ]);
    expect(prompt.user).toContain("Why?");
    expect(prompt.user).toContain("Source words.");
    const med = buildMedicinePrompt({
      id: "m",
      name: "Med",
      purpose: "Use.",
      side_effects: "Effects.",
      interactions: "None.",
      dose: "Dose.",
      citations: [],
    });
    expect(med.user).toContain("what it is used for");
    expect(med.system).toContain("Side effects");
  });
});

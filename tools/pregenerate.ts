import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterExplanation } from "../core/explain/filters.ts";

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = join(root, "..", "core", "content");
const MODEL = "muse-spark-1.3-contributor";
const PROMPT_VERSION = "1";

interface CacheFile {
  cache_version: number;
  entries: Record<string, { standard: string; simple: string; model: string; status: string }>;
}

function entryHash(id: string, text: string[]): string {
  return createHash("sha256").update(`${id}\n${text.join("\n")}`).digest("hex");
}

async function complete(system: string, user: string): Promise<string> {
  const apiKey = process.env.MODEL_API_KEY;
  if (!apiKey) throw new Error("MODEL_API_KEY is not set in the environment");
  const res = await fetch("https://api.meta.ai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`model call failed with ${res.status}`);
  const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("model returned no content");
  return text;
}

function splitSections(text: string): { standard: string; simple: string } | null {
  const standard = /## Standard\s+([\s\S]*?)(?=## Simple|$)/.exec(text)?.[1]?.trim();
  const simple = /## Simple\s+([\s\S]*)$/.exec(text)?.[1]?.trim();
  if (!standard || !simple) return null;
  return { standard, simple };
}

async function main(): Promise<void> {
  const only = process.argv.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
  const kbDir = join(contentDir, "kb");
  const files = readdirSync(kbDir)
    .filter((name) => name.endsWith(".json") && (!only || name.replace(/\.json$/, "") === only))
    .sort();
  const explainPrompt = readFileSync(join(root, "prompts", "explain-entry.md"), "utf8");
  const cachePath = join(contentDir, "explain-cache.json");
  const cache: CacheFile = existsSync(cachePath)
    ? (JSON.parse(readFileSync(cachePath, "utf8")) as CacheFile)
    : { cache_version: 1, entries: {} };
  mkdirSync(contentDir, { recursive: true });
  let skipped = 0;
  for (const file of files) {
    const entry = JSON.parse(readFileSync(join(kbDir, file), "utf8")) as {
      id: string;
      title: string;
      text: string[];
      citations: Array<{ title: string }>;
    };
    const key = `${entryHash(entry.id, entry.text)}:standard+simple:${MODEL}:prompts-v${PROMPT_VERSION}`;
    if (cache.entries[key]?.status === "reviewed") {
      console.log(`skip ${entry.id} (already reviewed)`);
      continue;
    }
    const source = [...entry.text, ...entry.citations.map((citation) => citation.title)].join("\n");
    const user = `Entry: ${entry.title}\n${entry.text.join("\n")}`;
    try {
      const reply = await complete(explainPrompt, user);
      const sections = splitSections(reply);
      if (!sections) throw new Error(`unparseable reply for ${entry.id}`);
      for (const [level, text] of Object.entries(sections) as Array<[string, string]>) {
        const problems = filterExplanation(text, source);
        if (problems.length > 0) throw new Error(`filter rejected ${entry.id} ${level}: ${problems.join("; ")}`);
      }
      cache.entries[key] = { ...sections, model: MODEL, status: "generated" };
      console.log(`generated ${entry.id}`);
    } catch (error) {
      skipped += 1;
      console.log(`skipped ${entry.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
  }
  console.log(`wrote ${cachePath} (${skipped} skipped)`);
  if (skipped > 0) process.exit(1);
}

await main();

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { filterExplanation } from "../core/explain/filters.ts";

const root = dirname(fileURLToPath(import.meta.url));
const cachePath = join(root, "..", "core", "content", "explain-cache.json");

interface CacheEntry {
  standard: string;
  simple: string;
  model: string;
  status: string;
}

function load(): { cache_version: number; entries: Record<string, CacheEntry> } {
  try {
    return JSON.parse(readFileSync(cachePath, "utf8"));
  } catch {
    return { cache_version: 1, entries: {} };
  }
}

async function main(): Promise<void> {
  const [command, target] = process.argv.slice(2);
  const cache = load();
  if (command === "list" || !command) {
    for (const [key, entry] of Object.entries(cache.entries)) {
      console.log(`--- ${key} [${entry.status}] (${entry.model})`);
      console.log(`standard: ${entry.standard.slice(0, 200)}`);
      console.log(`simple: ${entry.simple.slice(0, 200)}`);
    }
    return;
  }
  if ((command === "approve" || command === "reject") && target) {
    const entry = cache.entries[target];
    if (!entry) throw new Error(`unknown entry ${target}`);
    if (command === "approve") {
      for (const [level, text] of Object.entries({ standard: entry.standard, simple: entry.simple })) {
        const problems = filterExplanation(text, text);
        if (problems.length > 0) throw new Error(`filter rejects ${target} ${level}: ${problems.join("; ")}`);
      }
      entry.status = "reviewed";
    } else {
      entry.status = "rejected";
    }
    writeFileSync(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
    console.log(`${command}d ${target}`);
    return;
  }
  throw new Error("usage: review.ts [list|approve <key>|reject <key>]");
}

await main();

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG } from "../core/src/catalog.ts";
import { FORMULARY_NO_DOSE, findDosePatterns, hashText, validateFormularyEntry, validateKbEntry } from "../core/src/content.ts";

const root = dirname(fileURLToPath(import.meta.url));
const contentDir = join(root, "..", "core", "content");
const fix = process.argv.includes("--fix");

async function sha256(lines: string[]): Promise<string> {
  return hashText(lines);
}

async function main(): Promise<void> {
  const problems: string[] = [];

  for (const measure of CATALOG.measures) {
    if (measure.limit_source.length === 0) problems.push(`${measure.code}: missing limit_source`);
    for (const limit of measure.limits) {
      if (limit.source.length === 0) problems.push(`${measure.code}: limit without a cited source`);
    }
    const kbPath = join(contentDir, "kb", `${measure.guidance_key}.json`);
    try {
      const raw = JSON.parse(readFileSync(kbPath, "utf8"));
      if (raw.id !== measure.guidance_key) problems.push(`${kbPath}: id does not match guidance key`);
    } catch {
      problems.push(`${measure.code}: guidance key '${measure.guidance_key}' has no kb file`);
    }
  }

  const kbDir = join(contentDir, "kb");
  for (const file of readdirSync(kbDir).filter((name) => name.endsWith(".json"))) {
    const path = join(kbDir, file);
    const raw = JSON.parse(readFileSync(path, "utf8"));
    if (fix && Array.isArray(raw.text)) {
      raw.content_hash = await sha256([...raw.text, ...((raw.inflight as { text?: string[] } | undefined)?.text ?? [])]);
      writeFileSync(path, `${JSON.stringify(raw)}\n`);
    }
    const checked = await validateKbEntry(raw);
    if (!checked.ok) problems.push(`${file}: ${checked.reason}`);
    else if (!raw.quoted_source) {
      for (const line of findDosePatterns(raw.text)) {
        problems.push(`${file}: medication-dose pattern without quoted_source: ${line.slice(0, 80)}`);
      }
    }
  }

  const formulary = JSON.parse(readFileSync(join(contentDir, "formulary.json"), "utf8")) as {
    formulary_version?: unknown;
    entries: unknown[];
  };
  if (typeof formulary.formulary_version !== "string") problems.push("formulary: missing version");
  for (const entry of formulary.entries) {
    const checked = validateFormularyEntry(entry);
    if (!checked.ok) {
      problems.push(`formulary ${(entry as { id?: unknown }).id}: ${checked.reason}`);
    } else if (
      (entry as { dose?: unknown }).dose !== FORMULARY_NO_DOSE &&
      typeof (entry as { dose_source?: unknown }).dose_source !== "string"
    ) {
      problems.push(`formulary ${(entry as { id?: unknown }).id}: dose without quotation`);
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log("citations ok");
}

await main();

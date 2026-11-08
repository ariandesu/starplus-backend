import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  findDosePatterns,
  hashText,
  validateFormularyEntry,
  validateKbEntry,
  type KbEntry,
} from "../src/content.ts";
import { CATALOG } from "../src/catalog.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const contentDir = join(root, "content");

function sha256(lines: string[]): string {
  return createHash("sha256").update(lines.join("\n")).digest("hex");
}

describe("content citations", () => {
  it("every catalog limit is cited", () => {
    for (const measure of CATALOG.measures) {
      expect(measure.limit_source.length, `${measure.code} limit_source`).toBeGreaterThan(0);
      for (const limit of measure.limits) {
        expect(limit.source.length, `${measure.code} limit`).toBeGreaterThan(0);
      }
    }
  });

  it("every knowledge-base entry is valid and hashed", async () => {
    const kb = join(contentDir, "kb");
    const files = readdirSync(kb).filter((name) => name.endsWith(".json"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const raw = JSON.parse(readFileSync(join(kb, file), "utf8"));
      const checked = await validateKbEntry(raw);
      expect(checked.ok, file).toBe(true);
    }
  });

  it("every guidance key resolves to a knowledge-base entry", () => {
    for (const measure of CATALOG.measures) {
      const path = join(contentDir, "kb", `${measure.guidance_key}.json`);
      expect(existsSync(path), measure.guidance_key).toBe(true);
      const raw = JSON.parse(readFileSync(path, "utf8"));
      expect(raw.id, measure.guidance_key).toBe(measure.guidance_key);
    }
  });

  it("every formulary entry is cited and never doses without quotation", () => {
    const formulary = JSON.parse(readFileSync(join(contentDir, "formulary.json"), "utf8")) as {
      entries: unknown[];
    };
    expect(formulary.entries.length).toBeGreaterThan(0);
    for (const entry of formulary.entries) {
      expect(validateFormularyEntry(entry).ok).toBe(true);
    }
  });

  it("content hashes use sha256 of the joined text", async () => {
    expect(await hashText(["a", "b"])).toBe(sha256(["a", "b"]));
  });

  it("ships an in-flight variant for CPR, unresponsive, fainting and anaphylaxis", async () => {
    const kb = join(contentDir, "kb");
    const variants: Record<string, string[]> = {
      "firstaid-cpr": ["restrain", "evetts-russomano", "handstand"],
      "firstaid-unresponsive": ["restrain", "no recovery position"],
      "firstaid-fainting": ["restrain", "do not raise the legs"],
      "firstaid-anaphylaxis": ["restrain", "cannot drift"],
    };
    for (const [file, markers] of Object.entries(variants)) {
      const raw = JSON.parse(readFileSync(join(kb, `${file}.json`), "utf8"));
      const checked = await validateKbEntry(raw);
      expect(checked.ok, file).toBe(true);
      const joined = (raw.inflight?.text ?? []).join(" ").toLowerCase();
      for (const marker of markers) {
        expect(joined, `${file} mentions ${marker}`).toContain(marker);
      }
      const publishers = (raw.inflight?.citations ?? []).map((citation: { publisher: string }) => citation.publisher).join(" ");
      expect(publishers, `${file} cites the microgravity guideline`).toContain("BioMed Central");
    }
    const cpr = JSON.parse(readFileSync(join(kb, "firstaid-cpr.json"), "utf8"));
    const cprPublishers = cpr.inflight.citations.map((citation: { publisher: string }) => citation.publisher).join(" ");
    expect(cprPublishers).toContain("Aerospace Medical Association");
  });

  it("rejects medication-dose patterns without a quoted source", () => {
    expect(findDosePatterns(["take 2 tablets twice daily"])).toHaveLength(1);
    expect(findDosePatterns(["give 200 mg now"])).toHaveLength(1);
    expect(findDosePatterns(["repeat every 4 hours"])).toHaveLength(1);
    expect(findDosePatterns(["Below 70 mg/dL scores watch"])).toHaveLength(0);
    expect(findDosePatterns(["give 15 grams of fast sugar"])).toHaveLength(0);
    expect(findDosePatterns(["100 to 120 per minute"])).toHaveLength(0);
    const kb = join(contentDir, "kb");
    for (const file of readdirSync(kb).filter((name) => name.endsWith(".json"))) {
      const raw = JSON.parse(readFileSync(join(kb, file), "utf8")) as KbEntry;
      if (raw.quoted_source) continue;
      expect(findDosePatterns(raw.text), file).toEqual([]);
    }
  });
});

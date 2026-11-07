import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  hashText,
  validateFormularyEntry,
  validateKbEntry,
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
});

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "core");
const shaFile = join(coreDir, "core.sha256");

function listFiles(dir: string, base: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = base.length > 0 ? `${base}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else if (entry !== "core.sha256") out.push(rel);
  }
  return out;
}

describe("core checksum", () => {
  it("core/ matches core.sha256 exactly: no unlisted, missing or changed files", () => {
    expect(existsSync(shaFile)).toBe(true);
    const listed = new Map<string, string>();
    for (const line of readFileSync(shaFile, "utf8").trim().split("\n").filter(Boolean)) {
      const [expected, rel] = line.split(/\s+/);
      listed.set(rel, expected);
    }
    const actual = listFiles(coreDir, "");
    expect([...listed.keys()].sort()).toEqual(actual);
    for (const rel of actual) {
      const content = readFileSync(join(coreDir, rel));
      const digest = createHash("sha256").update(content).digest("hex");
      expect(`${rel}: ${digest}`).toBe(`${rel}: ${listed.get(rel)}`);
    }
  });
});

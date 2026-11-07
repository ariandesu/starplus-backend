import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const coreDir = join(root, "core");
const shaFile = join(coreDir, "core.sha256");

describe("core checksum", () => {
  it("core/ matches core.sha256", () => {
    expect(existsSync(shaFile)).toBe(true);
    const lines = readFileSync(shaFile, "utf8").trim().split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const [expected, rel] = line.split(/\s+/);
      const content = readFileSync(join(coreDir, rel));
      const actual = createHash("sha256").update(content).digest("hex");
      expect(`${rel}: ${actual}`).toBe(`${rel}: ${expected}`);
    }
  });
});

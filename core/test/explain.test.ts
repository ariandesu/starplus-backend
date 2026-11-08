import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fillTemplate, templateVariables } from "../explain/templates.ts";
import { filterExplanation } from "../explain/filters.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cases = JSON.parse(readFileSync(join(root, "..", "tools", "eval", "cases.json"), "utf8")) as {
  cases: Array<{ name: string; text: string; source: string; expect: "reject" | "pass" }>;
};

describe("explanation filters", () => {
  it("rejects every invented or softened case", () => {
    for (const item of cases.cases) {
      const problems = filterExplanation(item.text, item.source);
      if (item.expect === "reject") {
        expect(problems.length, item.name).toBeGreaterThan(0);
      } else {
        expect(problems, item.name).toEqual([]);
      }
    }
  });

  it("matches words on boundaries, not inside other words", () => {
    expect(filterExplanation("Check symptoms.", "Drink water.")).toEqual([]);
    expect(filterExplanation("See you today.", "Drink water.")).toEqual([]);
    expect(filterExplanation("The result is abnormal.", "Drink water.")).toEqual([]);
    expect(filterExplanation("Take it daily.", "Drink water.")).not.toEqual([]);
  });

  it("fills templates and requires every placeholder", () => {
    expect(fillTemplate("Value {{value}} {{unit}}.", { value: 72, unit: "bpm" })).toBe("Value 72 bpm.");
    expect(templateVariables("Value {{value}} {{unit}} and {{value}}.")).toEqual(["value", "unit"]);
    expect(() => fillTemplate("Value {{value}}.", {})).toThrow();
  });
});

import { describe, expect, it } from "vitest";
import {
  CATALOG,
  PHASES,
  ROLES,
  SETTINGS,
  convertToCanonical,
  lookupMeasure,
  validateCatalog,
} from "../src/catalog.ts";

describe("catalog", () => {
  it("every limit has a cited source", () => {
    for (const measure of CATALOG.measures) {
      for (const limit of measure.limits) {
        expect(limit.source.length, `${measure.code} limit source`).toBeGreaterThan(0);
      }
      expect(measure.limit_source.length, `${measure.code} limit_source`).toBeGreaterThan(0);
    }
  });

  it("every measure has exactly one body system", () => {
    for (const measure of CATALOG.measures) {
      expect(typeof measure.body_system).toBe("string");
      expect(measure.body_system.length, measure.code).toBeGreaterThan(0);
    }
  });

  it("looks up by code or alias", () => {
    expect(lookupMeasure("heart_rate")?.unit).toBe("bpm");
    expect(lookupMeasure("heart_rate_bpm")?.code).toBe("heart_rate");
    expect(lookupMeasure("systolic_bp_mmHg")?.code).toBe("blood_pressure_systolic");
    expect(lookupMeasure("nope")).toBeNull();
  });

  it("converts units to canonical", () => {
    const mass = lookupMeasure("body_mass")!;
    expect(convertToCanonical(154.324, "lb", mass)).toBeCloseTo(70, 2);
    const temp = lookupMeasure("temperature_c")!;
    expect(convertToCanonical(98.6, "°F", temp)).toBeCloseTo(37, 1);
    const glucose = lookupMeasure("blood_glucose")!;
    expect(convertToCanonical(5.5, "mmol/L", glucose)).toBeCloseTo(99, 0);
    expect(convertToCanonical(70, "kg", mass)).toBe(70);
    expect(convertToCanonical(70, "furlongs", mass)).toBeNull();
  });

  it("exposes roles, settings, phases and version", () => {
    expect([...ROLES]).toEqual(["astronaut", "flight_medical_officer", "mission_control"]);
    expect([...SETTINGS]).toEqual(["iss", "mars_transit", "moon_base", "rover"]);
    expect([...PHASES]).toEqual(["preflight", "inflight", "surface", "postflight"]);
    expect(CATALOG.catalog_version.length).toBeGreaterThan(0);
  });

  it("rejects a catalog with an unsourced limit", () => {
    const raw = JSON.parse(JSON.stringify({ catalog_version: "1", measures: CATALOG.measures }));
    raw.measures[0].limits[0].source = "";
    expect(validateCatalog(raw).ok).toBe(false);
  });

  it("carries cited in-flight baseline shifts for temperature and systolic", () => {
    const temp = lookupMeasure("temperature_c")!;
    expect(temp.phase_offsets.inflight).toEqual({ baseline_shift: 1.0 });
    expect(temp.phase_offset_source).toMatch(/Stahn/);
    const systolic = lookupMeasure("blood_pressure_systolic")!;
    expect(systolic.phase_offsets.inflight).toEqual({ baseline_shift: -14 });
    expect(systolic.phase_offset_source).toMatch(/Circulation/);
  });
  it("rejects a catalog with a missing body system", () => {
    const raw = JSON.parse(JSON.stringify({ catalog_version: "1", measures: CATALOG.measures }));
    raw.measures[0].body_system = "";
    expect(validateCatalog(raw).ok).toBe(false);
  });

  it("rejects a limit with a bad max bound", () => {
    const raw = JSON.parse(JSON.stringify({ catalog_version: "1", measures: CATALOG.measures }));
    raw.measures[0].limits[2].max = 50;
    expect(validateCatalog(raw).ok).toBe(false);
  });
});

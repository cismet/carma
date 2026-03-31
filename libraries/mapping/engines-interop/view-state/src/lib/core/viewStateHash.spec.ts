import { describe, expect, it } from "vitest";
import { readViewStateHashNumber } from "./viewStateHash";

// ---------------------------------------------------------------------------
// readViewStateHashNumber
// ---------------------------------------------------------------------------

describe("readViewStateHashNumber", () => {
  it("returns finite numbers as-is", () => {
    expect(readViewStateHashNumber(42)).toBe(42);
    expect(readViewStateHashNumber(0)).toBe(0);
    expect(readViewStateHashNumber(-3.14)).toBe(-3.14);
  });

  it("parses numeric strings", () => {
    expect(readViewStateHashNumber("16.991")).toBeCloseTo(16.991, 6);
    expect(readViewStateHashNumber("0")).toBe(0);
  });

  it("returns undefined for non-numeric values", () => {
    expect(readViewStateHashNumber(undefined)).toBeUndefined();
    expect(readViewStateHashNumber(null)).toBeUndefined();
    expect(readViewStateHashNumber("abc")).toBeUndefined();
    expect(readViewStateHashNumber(NaN)).toBeUndefined();
    expect(readViewStateHashNumber(Infinity)).toBeUndefined();
  });
});

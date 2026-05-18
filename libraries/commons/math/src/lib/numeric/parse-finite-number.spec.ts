import { describe, expect, it } from "vitest";

import { parseFiniteNumber } from "./parse-finite-number";

describe("parseFiniteNumber", () => {
  it("rejects non-finite and non-numeric values", () => {
    expect(parseFiniteNumber(12.5)).toBe(12.5);
    expect(parseFiniteNumber("12.5")).toBe(12.5);
    expect(parseFiniteNumber(Number.NaN)).toBeUndefined();
    expect(parseFiniteNumber(Number.POSITIVE_INFINITY)).toBeUndefined();
    expect(parseFiniteNumber("not-a-number")).toBeUndefined();
    expect(parseFiniteNumber(undefined)).toBeUndefined();
    expect(parseFiniteNumber(true)).toBeUndefined();
  });
});

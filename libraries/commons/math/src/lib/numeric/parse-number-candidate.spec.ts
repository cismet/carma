import { describe, expect, it } from "vitest";

import { parseNumberCandidate } from "./parse-number-candidate";

describe("parseNumberCandidate", () => {
  it("returns number inputs unchanged for later validation", () => {
    expect(parseNumberCandidate(12.5)).toBe(12.5);
    expect(parseNumberCandidate(Number.POSITIVE_INFINITY)).toBe(
      Number.POSITIVE_INFINITY
    );
  });

  it("parses string inputs into number candidates", () => {
    expect(parseNumberCandidate("12.5")).toBe(12.5);
    expect(parseNumberCandidate("")).toBe(0);
    expect(Number.isNaN(parseNumberCandidate("not-a-number"))).toBe(true);
  });

  it("ignores unsupported input types instead of coercing them", () => {
    expect(parseNumberCandidate(undefined)).toBeUndefined();
    expect(parseNumberCandidate(null)).toBeUndefined();
    expect(parseNumberCandidate(true)).toBeUndefined();
    expect(parseNumberCandidate(false)).toBeUndefined();
    expect(parseNumberCandidate(1n)).toBeUndefined();
  });
});

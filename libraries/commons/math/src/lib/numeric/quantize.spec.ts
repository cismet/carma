import { describe, expect, it } from "vitest";

import { quantize } from "./quantize";

describe("quantize", () => {
  it("rounds a value to the nearest step", () => {
    expect(quantize(12.6, 5)).toBe(15);
    expect(quantize(-12.6, 5)).toBe(-15);
  });

  it("rejects invalid steps", () => {
    expect(() => quantize(1, 0)).toThrow(RangeError);
  });
});

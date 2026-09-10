import { describe, expect, it } from "vitest";
import { shadowRasterOffset } from "./shadow-raster-offset";

describe("shadow raster offsets", () => {
  it("bounds every phase to half a texel and balances every adjacent pair", () => {
    for (let round = 0; round < 8192; round += 2) {
      const first = shadowRasterOffset(round);
      const second = shadowRasterOffset(round + 1);
      for (const axis of [0, 1]) {
        expect(Math.abs(first[axis])).toBeLessThanOrEqual(0.5);
        expect(first[axis] + second[axis]).toBe(0);
      }
    }
  });
  it("repeats a given phase deterministically", () => {
    expect(shadowRasterOffset(234)).toEqual(shadowRasterOffset(234));
    expect(shadowRasterOffset(234)).not.toEqual(shadowRasterOffset(236));
  });
});

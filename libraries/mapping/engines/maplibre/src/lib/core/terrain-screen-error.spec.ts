import { describe, expect, it } from "vitest";
import {
  getTerrainScreenErrorColor,
  getTerrainScreenErrorRatio,
} from "./terrain-screen-error";

describe("terrain observer error debug metric", () => {
  it("uses the same focal length and distance floor as terrain selection", () => {
    expect(getTerrainScreenErrorRatio(10, 1000, 90, 1000, 5)).toBeCloseTo(1);
    expect(getTerrainScreenErrorRatio(10, 1000, 90, 2000, 5)).toBeCloseTo(0.5);
    expect(getTerrainScreenErrorRatio(10, 1000, 90, 1000, 10)).toBeCloseTo(0.5);
    expect(getTerrainScreenErrorRatio(10, 1000, 90, 0, 5)).toBeCloseTo(1000);
  });
  it("distinguishes over-refinement, target, and coarser fallback classes", () => {
    expect([0.5, 1, 2, 4, 8].map(getTerrainScreenErrorColor)).toEqual([
      0x38bdf8, 0x22c55e, 0xfacc15, 0xf97316, 0xef4444,
    ]);
  });
});

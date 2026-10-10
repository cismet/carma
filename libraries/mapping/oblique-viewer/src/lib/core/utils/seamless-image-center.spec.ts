import { describe, expect, it } from "vitest";
import {
  normalizeSeamlessCenterY,
  seamlessImageCenterDistance,
} from "./seamless-image-center";

describe("seamless image centre", () => {
  it("defaults to thirty percent above the bottom and clamps configuration", () => {
    expect(normalizeSeamlessCenterY()).toBe(0.3);
    expect(normalizeSeamlessCenterY(NaN)).toBe(0.3);
    expect(normalizeSeamlessCenterY(Infinity)).toBe(0.3);
    expect(normalizeSeamlessCenterY(-1)).toBe(0.1);
    expect(normalizeSeamlessCenterY(2)).toBe(0.9);
  });
  it("compares both sensor axes around the configured bottom-up centre", () => {
    expect(seamlessImageCenterDistance({ x: 0.5, y: 0.3 })).toBe(0);
    expect(seamlessImageCenterDistance({ x: 0.8, y: 0.7 })).toBeCloseTo(0.5);
    expect(seamlessImageCenterDistance({ x: 0.5, y: 0.9 }, 0.9)).toBe(0);
    expect(seamlessImageCenterDistance({ x: 0.5, y: 0.1 }, 0.9)).toBeCloseTo(
      0.8
    );
  });
  it("rejects missing, nonfinite and uncovered target points", () => {
    for (const point of [
      null,
      { x: NaN, y: 0.3 },
      { x: 0.5, y: Infinity },
      { x: -0.01, y: 0.3 },
      { x: 1.01, y: 0.3 },
      { x: 0.5, y: -0.01 },
      { x: 0.5, y: 1.01 },
    ]) {
      expect(seamlessImageCenterDistance(point)).toBeNull();
    }
    expect(seamlessImageCenterDistance({ x: 0, y: 1 })).not.toBeNull();
  });
});

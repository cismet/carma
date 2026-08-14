import { describe, expect, it } from "vitest";

import { constantsForSharpness, resolveNavConstants } from "./constants";

/** A4: the one knob, its anchors, and how an explicit override interacts. */
describe("sharpness", () => {
  it("produces the fuzzy anchor at 0", () => {
    expect(constantsForSharpness(0)).toEqual({
      coneAngleDeg: 75,
      angleWeight: 1,
    });
  });

  it("produces the strict anchor at 1", () => {
    expect(constantsForSharpness(1)).toEqual({
      coneAngleDeg: 40,
      angleWeight: 6,
    });
  });

  it("produces the defaults at 0.5, which is also the default sharpness", () => {
    expect(constantsForSharpness(0.5)).toEqual({
      coneAngleDeg: 60,
      angleWeight: 2.5,
    });
    expect(resolveNavConstants()).toEqual({
      coneAngleDeg: 60,
      angleWeight: 2.5,
      anglePower: 1,
    });
  });

  it("interpolates linearly between the anchors", () => {
    const quarter = constantsForSharpness(0.25);
    expect(quarter.coneAngleDeg).toBeCloseTo(67.5, 6);
    expect(quarter.angleWeight).toBeCloseTo(1.75, 6);
  });

  it("clamps rather than extrapolates outside 0..1", () => {
    expect(constantsForSharpness(-1)).toEqual(constantsForSharpness(0));
    expect(constantsForSharpness(2)).toEqual(constantsForSharpness(1));
  });

  it("lets an explicit cone angle win while the weight stays derived", () => {
    expect(resolveNavConstants({ sharpness: 1, coneAngleDeg: 55 })).toEqual({
      coneAngleDeg: 55,
      angleWeight: 6,
      anglePower: 1,
    });
  });

  it("keeps anglePower out of the sharpness derivation", () => {
    expect(resolveNavConstants({ sharpness: 0 }).anglePower).toBe(1);
    expect(
      resolveNavConstants({ sharpness: 1, anglePower: 2 }).anglePower
    ).toBe(2);
  });
});

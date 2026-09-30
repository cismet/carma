import { describe, expect, it } from "vitest";

import { WGS84_A, WGS84_B, getWgs84PrincipalCurvatureRadii } from "./geodetic";

describe("WGS84 principal curvature radii", () => {
  it("matches the ellipsoid axes at the equator", () => {
    const radii = getWgs84PrincipalCurvatureRadii(0);
    expect(radii.primeVerticalMeters).toBe(WGS84_A);
    expect(radii.meridionalMeters).toBeCloseTo(
      (WGS84_B * WGS84_B) / WGS84_A,
      6
    );
  });

  it("matches the WGS84 reference values at 60 degrees latitude", () => {
    const radii = getWgs84PrincipalCurvatureRadii(Math.PI / 3);
    expect(radii.primeVerticalMeters).toBeCloseTo(6_394_209.173848, 4);
    expect(radii.meridionalMeters).toBeCloseTo(6_383_453.857229, 4);
  });
});

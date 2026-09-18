import { describe, expect, test } from "vitest";

import { EARTH_CIRCUMFERENCE, EARTH_RADIUS } from "./earth";
import { GRS80_ELLIPSOID, WGS84_ELLIPSOID } from "./ellipsoids";

describe("earth constants derive from the WGS84 ellipsoid", () => {
  test("mean radius R1 matches the published IUGG value", () => {
    expect(EARTH_RADIUS).toBeCloseTo(6371008.7714, 4);
  });

  test("equatorial circumference matches the published value", () => {
    expect(EARTH_CIRCUMFERENCE).toBeCloseTo(40075016.6856, 4);
  });

  test("WGS84 and GRS80 share the semi-major axis and differ by 0.1 mm in b", () => {
    expect(WGS84_ELLIPSOID.semiMajorAxis).toBe(GRS80_ELLIPSOID.semiMajorAxis);
    expect(
      Math.abs(WGS84_ELLIPSOID.semiMinorAxis - GRS80_ELLIPSOID.semiMinorAxis)
    ).toBeLessThan(0.0002);
  });
});

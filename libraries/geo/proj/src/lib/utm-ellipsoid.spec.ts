import { describe, expect, it } from "vitest";

import {
  GRS80_ELLIPSOID,
  utmToEllipsoidSurface,
  WGS84_ELLIPSOID,
} from "./utm-ellipsoid";

describe("UTM ellipsoid surface projection", () => {
  it("maps the zone 32 central meridian at the equator", () => {
    const result = utmToEllipsoidSurface(500_000, 0, 125, {
      zone: 32,
      hemisphere: "north",
      ellipsoid: GRS80_ELLIPSOID,
    });

    expect(result.longitudeRadians).toBeCloseTo(Math.PI / 20, 12);
    expect(result.latitudeRadians).toBeCloseTo(0, 12);
    expect(Math.hypot(...result.ecef)).toBeCloseTo(
      GRS80_ELLIPSOID.semiMajorAxis + 125,
      6
    );
  });

  it("supports southern UTM zones and a different ellipsoid", () => {
    const result = utmToEllipsoidSurface(500_000, 10_000_000, 0, {
      zone: 56,
      hemisphere: "south",
      ellipsoid: WGS84_ELLIPSOID,
    });

    expect((result.longitudeRadians * 180) / Math.PI).toBeCloseTo(153, 10);
    expect(result.latitudeRadians).toBeCloseTo(0, 10);
  });

  it("rejects invalid zones instead of silently selecting one", () => {
    expect(() =>
      utmToEllipsoidSurface(500_000, 0, 0, {
        zone: 0,
        hemisphere: "north",
        ellipsoid: GRS80_ELLIPSOID,
      })
    ).toThrow(/zone/i);
  });
});

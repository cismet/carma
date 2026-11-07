import { describe, expect, it } from "vitest";
import type { Meters, MetricVector3 } from "@carma-units";

import { readEnuAxesAtEcef } from "./geodetic";
import {
  ecefFromGeographicCoordinate,
  geographicCoordinateFromEcef,
  getEllipsoidalUpDirectionAtAnchor,
  getGeographicSurfaceDistance,
  getLocalUpDirectionAtAnchor,
  interpolateGeographicCoordinate,
  metricVector3FromVector3,
  vector3FromMetricVector3,
} from "./geographic-ecef";

const wuppertal = { longitude: 7.2, latitude: 51.272, altitude: 155 };

describe("geographic-ecef", () => {
  it("round-trips a geographic coordinate through ECEF", () => {
    const back = geographicCoordinateFromEcef(
      ecefFromGeographicCoordinate(wuppertal)
    );
    expect(back.longitude).toBeCloseTo(7.2, 9);
    expect(back.latitude).toBeCloseTo(51.272, 9);
    expect(back.altitude).toBeCloseTo(155, 6);
  });

  it("tells the geodetic up from the geocentric up", () => {
    const anchor = ecefFromGeographicCoordinate(wuppertal);
    const geodetic = getEllipsoidalUpDirectionAtAnchor(anchor);
    expect(geodetic.angleTo(readEnuAxesAtEcef(anchor).up)).toBeLessThan(1e-9);
    expect(
      geodetic.angleTo(getLocalUpDirectionAtAnchor(anchor))
    ).toBeGreaterThan(1e-3);
  });

  it("interpolates and measures along the surface", () => {
    const east = { ...wuppertal, longitude: 7.21, altitude: 255 };
    const middle = interpolateGeographicCoordinate(wuppertal, east, 0.5);
    expect(middle.longitude).toBeCloseTo(7.205, 6);
    expect(middle.altitude).toBeCloseTo(205, 9);
    expect(getGeographicSurfaceDistance(wuppertal, east)).toBeCloseTo(697.5, 0);
  });

  it("converts between Vector3 and the metric carrier", () => {
    const metric = { x: 1, y: 2, z: 3 } as unknown as MetricVector3;
    const vector = vector3FromMetricVector3(metric);
    expect(metricVector3FromVector3(vector)).toEqual({
      x: 1 as Meters,
      y: 2 as Meters,
      z: 3 as Meters,
    });
  });
});

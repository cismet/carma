import { describe, expect, it } from "vitest";
import { MercatorCoordinate } from "maplibre-gl";
import { EARTH_CIRCUMFERENCE } from "@carma-geo/proj";

import {
  DZ_B_PRM_POSITION,
  dzbPrmLocalToLonLat,
  dzbPrmPhysicalDirectionToProjected,
} from "./shadow-texture-georef";

describe("DZ_B_PRM shadow image georeference", () => {
  it("places the local origin at the source footprint anchor", () => {
    expect(dzbPrmLocalToLonLat(0, 0)).toEqual([
      DZ_B_PRM_POSITION.longitude,
      DZ_B_PRM_POSITION.latitude,
    ]);
  });

  it("maps GLB X east and GLB Z south into the canvas corners", () => {
    const northwest = dzbPrmLocalToLonLat(-100, -100);
    const northeast = dzbPrmLocalToLonLat(100, -100);
    const southeast = dzbPrmLocalToLonLat(100, 100);
    const southwest = dzbPrmLocalToLonLat(-100, 100);

    expect(northeast[0]).toBeGreaterThan(northwest[0]);
    expect(southwest[1]).toBeLessThan(northwest[1]);
    expect(southeast[0]).toBe(northeast[0]);
    expect(southeast[1]).toBe(southwest[1]);
  });

  it("scales horizontal solar travel from physical metres into Mercator metres", () => {
    const [east, up, south] = dzbPrmPhysicalDirectionToProjected(1, 1, 0);
    expect(east).toBeCloseTo(
      1 / Math.cos((DZ_B_PRM_POSITION.latitude * Math.PI) / 180),
      10
    );
    expect(up).toBe(1);
    expect(south).toBe(0);
  });

  it("places a nadir canvas point at the same map position as its mounted GLB point", () => {
    const origin = MercatorCoordinate.fromLngLat([
      DZ_B_PRM_POSITION.longitude,
      DZ_B_PRM_POSITION.latitude,
    ]);
    const point = MercatorCoordinate.fromLngLat(
      dzbPrmLocalToLonLat(1000, -200)
    );
    const sceneMetersPerProjectedMeter =
      1 / (EARTH_CIRCUMFERENCE * origin.meterInMercatorCoordinateUnits());
    expect(
      (point.x - origin.x) / origin.meterInMercatorCoordinateUnits()
    ).toBeCloseTo(1000 * sceneMetersPerProjectedMeter, 4);
    expect(
      (origin.y - point.y) / origin.meterInMercatorCoordinateUnits()
    ).toBeCloseTo(200 * sceneMetersPerProjectedMeter, 3);
  });
});

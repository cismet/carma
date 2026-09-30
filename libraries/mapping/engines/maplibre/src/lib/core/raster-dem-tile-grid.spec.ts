import { describe, expect, it } from "vitest";
import { getRasterDemTileGridIdsForBounds } from "./raster-dem-tile-grid";

describe("raster DEM grid extent contract", () => {
  const source = {
    bounds: { west: -180, south: -85, east: 180, north: 85 },
    minzoom: 0,
    maxzoom: 4,
    meshSegments: 8,
  };

  it("keeps exact tile edges exclusive without duplicating adjacent columns", () => {
    expect(
      getRasterDemTileGridIdsForBounds(
        source,
        { west: 0, south: 0, east: 180, north: 85 },
        1
      )
    ).toEqual([{ level: 1, x: 1, y: 0 }]);
  });

  it("rejects wrapped requests and sources instead of silently selecting nothing", () => {
    const wrapped = { ...source.bounds, west: 170, east: -170 };
    expect(() => getRasterDemTileGridIdsForBounds(source, wrapped, 1)).toThrow(
      RangeError
    );
    expect(() =>
      getRasterDemTileGridIdsForBounds(
        { ...source, bounds: wrapped },
        source.bounds,
        1
      )
    ).toThrow(RangeError);
  });
});

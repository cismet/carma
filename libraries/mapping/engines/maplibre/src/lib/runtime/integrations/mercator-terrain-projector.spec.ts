import { MercatorCoordinate } from "maplibre-gl";
import { Vector3 } from "three";
import { describe, expect, it, vi } from "vitest";
import { createMercatorTerrainProjector } from "./mercator-terrain-projector";

describe("tile-local Mercator projector", () => {
  it("matches direct MapLibre projection including latitude-dependent elevation scale", () => {
    const origin = MercatorCoordinate.fromLngLat([7.1, 51.2], 100);
    const project = createMercatorTerrainProjector(origin);
    const scale = origin.meterInMercatorCoordinateUnits();
    for (const longitude of [7, 7.2])
      for (const latitude of [51, 51.4])
        for (const height of [-50, 200, 600]) {
          const expected = MercatorCoordinate.fromLngLat(
            [longitude, latitude],
            height
          );
          const actual = project(longitude, latitude, height, new Vector3());
          expect(actual.x).toBeCloseTo((expected.x - origin.x) / scale, 8);
          expect(actual.y).toBeCloseTo((expected.z - origin.z) / scale, 8);
          expect(actual.z).toBeCloseTo((expected.y - origin.y) / scale, 8);
        }
  });

  it("projects repeated raster coordinates only once per row and column", () => {
    const project = createMercatorTerrainProjector(
      MercatorCoordinate.fromLngLat([7, 51], 0)
    );
    const projection = vi.spyOn(MercatorCoordinate, "fromLngLat");
    try {
      for (let y = 0; y < 10; y++)
        for (let x = 0; x < 10; x++) {
          project(7 + x / 100, 51 + y / 100, x + y, new Vector3());
        }
      expect(projection).toHaveBeenCalledTimes(20);
    } finally {
      projection.mockRestore();
    }
  });
});

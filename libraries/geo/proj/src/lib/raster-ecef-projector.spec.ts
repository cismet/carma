import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { degToRadNumeric } from "@carma-units";
import { cartographicToEcef } from "./geodetic";
import { createRasterEcefProjector } from "./raster-ecef-projector";
import { WEB_MERCATOR_MAX_LATITUDE_DEG } from "./web-map";

describe("createRasterEcefProjector", () => {
  it("bounds reusable coordinate lookups without changing positions or tangent directions", () => {
    const bounded = createRasterEcefProjector({ maximumCacheEntries: 2 });
    const reference = createRasterEcefProjector();
    const a = new Vector3(),
      b = new Vector3(),
      direction = new Vector3(0.2, 0.9, -0.3);
    for (const [longitude, latitude] of [
      [7, 51],
      [8, 52],
      [9, 53],
      [7, 51],
      [9, 53],
    ]) {
      expect(
        bounded(longitude, latitude, 200, a).distanceTo(
          reference(longitude, latitude, 200, b)
        )
      ).toBe(0);
      expect(
        bounded
          .direction(longitude, latitude, direction, a)
          .distanceTo(reference.direction(longitude, latitude, direction, b))
      ).toBe(0);
      expect(bounded.cacheStats().columns).toBeLessThanOrEqual(2);
      expect(bounded.cacheStats().rows).toBeLessThanOrEqual(2);
    }
  });
  it("matches the independent WGS84 reference at global and Mercator boundaries", () => {
    const longitudes = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
    const latitudes = [
      -WEB_MERCATOR_MAX_LATITUDE_DEG,
      -85,
      -45,
      0,
      45,
      85,
      WEB_MERCATOR_MAX_LATITUDE_DEG,
    ];
    const heights = [-500, 0, 8_848];
    const project = createRasterEcefProjector();
    const actual = new Vector3();

    for (const longitude of longitudes)
      for (const latitude of latitudes)
        for (const height of heights) {
          project(longitude, latitude, height, actual);
          const expected = cartographicToEcef(
            degToRadNumeric(longitude),
            degToRadNumeric(latitude),
            height
          );
          expect(actual.distanceTo(expected)).toBeLessThan(1e-7);
        }
  });
});

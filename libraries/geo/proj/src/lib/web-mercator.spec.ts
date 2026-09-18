import { describe, expect, it } from "vitest";
import type { Degrees, Meters } from "@carma-units";

import { getToWebMercatorConverter } from "./proj4";
import {
  getWebMercatorFromWgs84Deg,
  getWgs84DegFromWebMercator,
} from "./web-mercator";

describe("Web Mercator closed forms", () => {
  it("matches the proj4 EPSG:3857 generator to a micrometre", () => {
    const converter = getToWebMercatorConverter("EPSG:4326");
    for (const [longitude, latitude] of [
      [7.15, 51.256],
      [-122.4194, 37.7749],
      [151.2093, -33.8688],
      [0, 0],
    ] as const) {
      const [x, y] = getWebMercatorFromWgs84Deg(
        longitude as Degrees,
        latitude as Degrees
      );
      const [px, py] = converter.forward([longitude, latitude] as never);
      expect(x).toBeCloseTo(px, 6);
      expect(y).toBeCloseTo(py, 6);
    }
  });

  it("inverts exactly", () => {
    const [x, y] = getWebMercatorFromWgs84Deg(
      7.15 as Degrees,
      51.256 as Degrees
    );
    const [longitude, latitude] = getWgs84DegFromWebMercator(
      x as Meters,
      y as Meters
    );
    expect(longitude).toBeCloseTo(7.15, 12);
    expect(latitude).toBeCloseTo(51.256, 12);
  });
});

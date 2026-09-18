import { describe, expect, test } from "vitest";

import { PI, degToRad } from "@carma-units";
import type { Degrees, Meters, Radians } from "@carma-units";
import {
  distanceFromMercatorZoomAtLatitudeDeg,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "./geo";

describe("geo utils mercator zoom/distance", () => {
  test("round trip between mercator zoom and distance at latitude", () => {
    const zoom = 12.5;
    const latitudeDeg = 51.27 as Degrees;
    const distance = distanceFromMercatorZoomAtLatitudeDeg(zoom, latitudeDeg, {
      fovVerticalRad: degToRad(60 as Degrees),
      viewportWidthPx: 1400,
      viewportHeightPx: 900,
    });

    expect(distance).not.toBeNull();

    const roundTripZoom = mercatorZoomFromDistanceAtLatitudeDeg(
      distance as Meters,
      latitudeDeg,
      {
        fovVerticalRad: degToRad(60 as Degrees),
        viewportWidthPx: 1400,
        viewportHeightPx: 900,
      }
    );

    expect(roundTripZoom).toBeCloseTo(zoom, 6);
  });
});

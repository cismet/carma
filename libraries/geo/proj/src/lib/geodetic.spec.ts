import { describe, expect, it } from "vitest";
import { degToRadNumeric } from "@carma-units";

import { cartographicToEcef, ecefToCartographic } from "./geodetic";

/** Double precision of an Earth-radius coordinate (ulp ~ 9e-10 m) with a few ulps of headroom. */
const ROUND_TRIP_TOLERANCE_METERS = 2e-8;
const ROUND_TRIP_TOLERANCE_RADIANS = 1e-14;
const HEIGHTS_METERS = [-10_000, -500, 0, 155, 5_000, 20_000, 400_000];

describe("ecefToCartographic", () => {
  it("closes the round trip through cartographicToEcef worldwide", () => {
    let worstPositionError = 0;
    let worstHeightError = 0;
    let worstAngleError = 0;
    for (let latitude = -89.9; latitude <= 89.9; latitude += 1.7) {
      for (let longitude = -180; longitude <= 180; longitude += 7.3) {
        const lon = degToRadNumeric(longitude);
        const lat = degToRadNumeric(latitude);
        for (const height of HEIGHTS_METERS) {
          const ecef = cartographicToEcef(lon, lat, height);
          const back = ecefToCartographic(ecef);
          worstPositionError = Math.max(
            worstPositionError,
            cartographicToEcef(
              back.longitude,
              back.latitude,
              back.altitude
            ).distanceTo(ecef)
          );
          worstHeightError = Math.max(
            worstHeightError,
            Math.abs(back.altitude - height)
          );
          worstAngleError = Math.max(
            worstAngleError,
            Math.abs(back.longitude - lon),
            Math.abs(back.latitude - lat)
          );
        }
      }
    }
    expect(worstPositionError).toBeLessThan(ROUND_TRIP_TOLERANCE_METERS);
    expect(worstHeightError).toBeLessThan(ROUND_TRIP_TOLERANCE_METERS);
    expect(worstAngleError).toBeLessThan(ROUND_TRIP_TOLERANCE_RADIANS);
  });

  it("keeps the height of a Wuppertal-sized scene to a few nanometres", () => {
    const ecef = cartographicToEcef(
      degToRadNumeric(7.2),
      degToRadNumeric(51.272),
      155
    );
    expect(ecefToCartographic(ecef).altitude).toBeCloseTo(155, 7);
  });
});

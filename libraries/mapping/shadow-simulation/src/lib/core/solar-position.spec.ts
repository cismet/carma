import { describe, expect, it } from "vitest";

import { getDaysInYear } from "@carma-commons/utils";

import {
  clampSelectionToDaylight,
  getDaylightWindow,
  getSolarPosition,
  MEAN_SOLAR_ANGULAR_RADIUS_DEGREES,
  solarSelectionToInstant,
  type SolarLocation,
  type SolarSelection,
} from "./solar-position";

const BERLIN = "Europe/Berlin";
const WUPPERTAL: SolarLocation = {
  latitude: 51.256,
  longitude: 7.15,
};
const createSelection = (
  dayOfYear: number,
  minutes: number,
  year = 2026
): SolarSelection => ({ year, dayOfYear, minutes, timeZone: BERLIN });

describe("solar position", () => {
  it("models the long Wuppertal summer day in local civil time", () => {
    const daylight = getDaylightWindow(createSelection(172, 720), WUPPERTAL);

    expect(daylight.sunriseMinutes).toBeGreaterThan(300);
    expect(daylight.sunriseMinutes).toBeLessThan(340);
    expect(daylight.sunsetMinutes).toBeGreaterThan(1_290);
    expect(daylight.sunsetMinutes).toBeLessThan(1_330);
  });

  it("clamps night input to the daylight curve", () => {
    const selection = clampSelectionToDaylight(
      createSelection(172, 120),
      WUPPERTAL
    );
    const daylight = getDaylightWindow(createSelection(172, 120), WUPPERTAL);

    expect(selection).not.toBeNull();
    expect(selection?.minutes).toBe(Math.ceil(daylight.sunriseMinutes));
  });

  it("limits selection to the lower solar limb touching the horizon", () => {
    const daylight = getDaylightWindow(createSelection(64, 720), WUPPERTAL);
    const sunrisePosition = getSolarPosition(
      createSelection(64, daylight.sunriseMinutes),
      WUPPERTAL
    );
    const sunsetPosition = getSolarPosition(
      createSelection(64, daylight.sunsetMinutes),
      WUPPERTAL
    );

    expect(sunrisePosition.elevationDegrees).toBeCloseTo(
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES,
      3
    );
    expect(sunsetPosition.elevationDegrees).toBeCloseTo(
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES,
      3
    );

    const earliestSelection = clampSelectionToDaylight(
      createSelection(64, 0),
      WUPPERTAL
    );
    const latestSelection = clampSelectionToDaylight(
      createSelection(64, 24 * 60 - 1),
      WUPPERTAL
    );

    expect(earliestSelection?.minutes).toBe(Math.ceil(daylight.sunriseMinutes));
    expect(latestSelection?.minutes).toBe(Math.floor(daylight.sunsetMinutes));
    expect(
      getSolarPosition(earliestSelection!, WUPPERTAL).elevationDegrees
    ).toBeGreaterThanOrEqual(MEAN_SOLAR_ANGULAR_RADIUS_DEGREES);
    expect(
      getSolarPosition(latestSelection!, WUPPERTAL).elevationDegrees
    ).toBeGreaterThanOrEqual(MEAN_SOLAR_ANGULAR_RADIUS_DEGREES);
  });

  it("keeps every selectable whole-minute edge above the horizon", () => {
    const selectedEdgeElevations: number[] = [];
    const excludedEdgeElevations: number[] = [];

    for (let dayOfYear = 1; dayOfYear <= getDaysInYear(2026); dayOfYear += 1) {
      const daylight = getDaylightWindow(
        createSelection(dayOfYear, 720),
        WUPPERTAL
      );
      const earliestMinutes = Math.ceil(daylight.sunriseMinutes);
      const latestMinutes = Math.floor(daylight.sunsetMinutes);
      selectedEdgeElevations.push(
        getSolarPosition(
          createSelection(dayOfYear, earliestMinutes),
          WUPPERTAL
        ).elevationDegrees,
        getSolarPosition(
          createSelection(dayOfYear, latestMinutes),
          WUPPERTAL
        ).elevationDegrees
      );
      excludedEdgeElevations.push(
        getSolarPosition(
          createSelection(dayOfYear, earliestMinutes - 1),
          WUPPERTAL
        ).elevationDegrees,
        getSolarPosition(
          createSelection(dayOfYear, latestMinutes + 1),
          WUPPERTAL
        ).elevationDegrees
      );
    }

    expect(Math.min(...selectedEdgeElevations)).toBeGreaterThanOrEqual(
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES
    );
    expect(Math.max(...excludedEdgeElevations)).toBeLessThan(
      MEAN_SOLAR_ANGULAR_RADIUS_DEGREES
    );
  });

  it("keeps local wall-clock time stable across the named time zone", () => {
    expect(
      solarSelectionToInstant(createSelection(172, 12 * 60)).toISOString()
    ).toBe("2026-06-21T10:00:00.000Z");
  });

  it("places the summer-noon sun high in the southern sky", () => {
    const daylight = getDaylightWindow(createSelection(172, 720), WUPPERTAL);
    const position = getSolarPosition(
      createSelection(172, daylight.solarNoonMinutes),
      WUPPERTAL
    );

    expect(position.azimuthDegrees).toBeGreaterThan(175);
    expect(position.azimuthDegrees).toBeLessThan(185);
    expect(position.elevationDegrees).toBeGreaterThan(60);
    expect(position.elevationDegrees).toBeLessThan(64);
  });

  it("keeps a March late morning selection above the local horizon", () => {
    const position = getSolarPosition(
      createSelection(71, 11 * 60 + 3),
      WUPPERTAL
    );

    expect(position.azimuthDegrees).toBeGreaterThan(140);
    expect(position.azimuthDegrees).toBeLessThan(160);
    expect(position.elevationDegrees).toBeGreaterThan(25);
    expect(position.elevationDegrees).toBeLessThan(35);
  });
});

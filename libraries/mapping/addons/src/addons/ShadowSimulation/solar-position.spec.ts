import { describe, expect, it } from "vitest";

import {
  clampSelectionToDaylight,
  getDaylightWindow,
  getSolarPosition,
  solarSelectionToInstant,
  type SolarLocation,
} from "./solar-position";

const WUPPERTAL: SolarLocation = {
  latitude: 51.256,
  longitude: 7.15,
  timeZone: "Europe/Berlin",
};

describe("solar position", () => {
  it("models the long Wuppertal summer day in local civil time", () => {
    const daylight = getDaylightWindow(2026, 172, WUPPERTAL);

    expect(daylight.sunriseMinutes).toBeGreaterThan(300);
    expect(daylight.sunriseMinutes).toBeLessThan(340);
    expect(daylight.sunsetMinutes).toBeGreaterThan(1_290);
    expect(daylight.sunsetMinutes).toBeLessThan(1_330);
  });

  it("clamps night input to the daylight curve", () => {
    const selection = clampSelectionToDaylight(
      { year: 2026, dayOfYear: 172, minutes: 120 },
      WUPPERTAL
    );
    const daylight = getDaylightWindow(2026, 172, WUPPERTAL);

    expect(selection).not.toBeNull();
    expect(selection?.minutes).toBeGreaterThan(daylight.sunriseMinutes);
    expect(selection?.minutes).toBeLessThan(daylight.sunsetMinutes);
  });

  it("keeps local wall-clock time stable across the named time zone", () => {
    expect(
      solarSelectionToInstant(
        { year: 2026, dayOfYear: 172, minutes: 12 * 60 },
        WUPPERTAL.timeZone
      ).toISOString()
    ).toBe("2026-06-21T10:00:00.000Z");
  });

  it("places the summer-noon sun high in the southern sky", () => {
    const daylight = getDaylightWindow(2026, 172, WUPPERTAL);
    const position = getSolarPosition(
      {
        year: 2026,
        dayOfYear: 172,
        minutes: daylight.solarNoonMinutes,
      },
      WUPPERTAL
    );

    expect(position.azimuthDegrees).toBeGreaterThan(175);
    expect(position.azimuthDegrees).toBeLessThan(185);
    expect(position.elevationDegrees).toBeGreaterThan(60);
    expect(position.elevationDegrees).toBeLessThan(64);
  });
});

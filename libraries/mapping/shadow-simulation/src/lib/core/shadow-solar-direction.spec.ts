import { describe, expect, it } from "vitest";

import { getDaylightWindow, getSolarPosition } from "./solar-position";
import { solarPositionToSceneDirection } from "./shadow-solar-direction";

describe("shadow scene sun direction", () => {
  const position = (azimuthDegrees: number, elevationDegrees: number) => ({
    instant: new Date("2026-06-21T10:00:00Z"),
    azimuthDegrees,
    elevationDegrees,
  });

  it("maps north to the shared scene's negative Z axis", () => {
    const direction = solarPositionToSceneDirection(position(0, 0));

    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });

  it("maps east and zenith into the shared local frame", () => {
    expect(solarPositionToSceneDirection(position(90, 0)).x).toBeCloseTo(1);
    expect(solarPositionToSceneDirection(position(180, 90)).y).toBeCloseTo(1);
  });

  it("maps Berlin civil time at Wuppertal into the local tangent plane", () => {
    const location = {
      latitude: 51.256,
      longitude: 7.15,
    };
    const selection = {
      year: 2026,
      dayOfYear: 172,
      minutes: 12 * 60,
      timeZone: "Europe/Berlin",
    };
    const daylight = getDaylightWindow(selection, location);
    const solarPosition = getSolarPosition(
      {
        ...selection,
        minutes: daylight.solarNoonMinutes,
      },
      location
    );
    const direction = solarPositionToSceneDirection(solarPosition);

    expect(solarPosition.instant.toISOString()).toContain("T11:");
    expect(direction.y).toBeGreaterThan(0.85);
    expect(direction.z).toBeGreaterThan(0);
    expect(Math.abs(direction.x)).toBeLessThan(0.05);
  });
});

import { describe, expect, it } from "vitest";

import { areSolarLocationsEqual, resolveSolarLocation } from "./solar-location";

describe("solar location", () => {
  const fallback = { latitude: 51.256, longitude: 7.15 };

  it("uses an available geographic position", () => {
    expect(
      resolveSolarLocation(
        { latitude: 51.3, longitude: 7.2 },
        fallback
      )
    ).toEqual({
      latitude: 51.3,
      longitude: 7.2,
    });
  });

  it("uses the fallback and compares locations by value", () => {
    const location = resolveSolarLocation(null, fallback);
    expect(location).toEqual(fallback);
    expect(areSolarLocationsEqual(location, { ...location })).toBe(true);
  });
});

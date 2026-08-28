import { describe, expect, it } from "vitest";

import {
  geographicBoundsContain,
  geographicBoundsIntersect,
  getGeographicRingBounds,
  padGeographicBounds,
  unionGeographicBounds,
} from "./geographic-bounds";

describe("geographic bounds", () => {
  const left = { west: 7, south: 51, east: 7.2, north: 51.2 };
  const right = { west: 7.1, south: 51.1, east: 7.3, north: 51.3 };

  it("tests intersection and containment", () => {
    expect(geographicBoundsIntersect(left, right)).toBe(true);
    expect(geographicBoundsContain(left, right)).toBe(false);
    expect(
      geographicBoundsContain(unionGeographicBounds(left, right), left)
    ).toBe(true);
  });

  it("pads an extent and clamps latitude", () => {
    expect(
      padGeographicBounds({ west: 7, south: -89, east: 8, north: 89 }, 0.5)
    ).toEqual({ west: 6.5, south: -90, east: 8.5, north: 90 });
  });

  it("computes a ring extent", () => {
    expect(
      getGeographicRingBounds([
        [7.2, 51.3],
        [7, 51.1],
        [7.4, 51.2],
      ])
    ).toEqual({ west: 7, south: 51.1, east: 7.4, north: 51.3 });
  });
});

import { describe, expect, it } from "vitest";
import type { Feature } from "geojson";

import { roundFeatureCoordinates, roundPosition } from "./coordinate-precision";

describe("coordinate precision", () => {
  it("rounds a snapped position to 9 decimals", () => {
    expect(roundPosition([7.179018259048462, 51.266634334968586])).toEqual([
      7.179018259, 51.266634335,
    ]);
  });

  it("rounds every coordinate of a stored line and keeps the rest", () => {
    const line: Feature = {
      type: "Feature",
      id: "a",
      geometry: {
        type: "LineString",
        coordinates: [
          [7.120629121, 51.25847467],
          [7.179018259048462, 51.266634334968586],
        ],
      },
      properties: { mode: "linestring", title: "L1" },
    };

    expect(roundFeatureCoordinates(line)).toEqual({
      ...line,
      geometry: {
        type: "LineString",
        coordinates: [
          [7.120629121, 51.25847467],
          [7.179018259, 51.266634335],
        ],
      },
    });
  });

  it("keeps a polygon closed", () => {
    const ring = [
      [7.123456789123, 51.1],
      [7.2, 51.1],
      [7.2, 51.2],
      [7.123456789123, 51.1],
    ];
    const polygon: Feature = {
      type: "Feature",
      id: "p",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { mode: "polygon" },
    };

    const rounded = roundFeatureCoordinates(polygon).geometry as {
      coordinates: number[][][];
    };
    const [first, , , last] = rounded.coordinates[0];
    expect(first).toEqual(last);
    expect(first).toEqual([7.123456789, 51.1]);
  });
});

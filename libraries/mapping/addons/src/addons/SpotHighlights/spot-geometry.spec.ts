import { describe, expect, it } from "vitest";

import {
  groundToMercator,
  mercatorToLngLat,
} from "@carma-mapping/show-remote";

import {
  nextSpotTitle,
  spotAt,
  spotPreviewFeatures,
  wheelPixels,
  wheeledDim,
  wheeledRadius,
} from "./spot-geometry";
import type { Spot } from "./spot-layer";

const center: [number, number] = [791700, 6664800];
/** `meters` on the ground east of `center`, in EPSG:3857 */
const east = (meters: number): [number, number] => [
  center[0] + groundToMercator(meters, center),
  center[1],
];

const spot: Spot = { id: "h1", title: "Zoo", center, radiusMeters: 80 };
const eastSpot: Spot = {
  id: "h2",
  title: "Punkt 2",
  center: east(100),
  radiusMeters: 80,
};

describe("spotAt", () => {
  it("returns the spot drawn last where two overlap", () => {
    expect(spotAt([spot, eastSpot], east(50))).toBe(eastSpot);
    expect(spotAt([eastSpot, spot], east(50))).toBe(spot);
  });

  it("returns the only spot a point is in", () => {
    expect(spotAt([spot, eastSpot], east(-50))).toBe(spot);
    expect(spotAt([spot, eastSpot], east(150))).toBe(eastSpot);
  });

  it("returns undefined outside every spot", () => {
    expect(spotAt([spot, eastSpot], east(-100))).toBeUndefined();
    expect(spotAt([], center)).toBeUndefined();
  });
});

describe("wheelPixels", () => {
  it("takes pixels as they are and turns lines and pages into pixels", () => {
    expect(wheelPixels(-100, 0)).toBe(-100);
    expect(wheelPixels(3, 1)).toBe(48);
    expect(wheelPixels(-1, 2)).toBe(-800);
  });
});

describe("wheeledRadius", () => {
  it("grows when the wheel turns away from the user", () => {
    expect(wheeledRadius(80, -100)).toBeCloseTo(92);
    expect(wheeledRadius(80, 100)).toBeCloseTo(80 / 1.15);
  });

  it("stays between 15 and 400 m", () => {
    expect(wheeledRadius(390, -1000)).toBe(400);
    expect(wheeledRadius(20, 1000)).toBe(15);
  });
});

describe("wheeledDim", () => {
  it("gets darker when the wheel turns away from the user", () => {
    expect(wheeledDim(0.5, -100)).toBeCloseTo(0.55);
    expect(wheeledDim(0.5, 100)).toBeCloseTo(0.45);
  });

  it("stays between 0.2 and 0.95", () => {
    expect(wheeledDim(0.9, -1000)).toBe(0.95);
    expect(wheeledDim(0.3, 1000)).toBe(0.2);
  });
});

describe("nextSpotTitle", () => {
  it("counts on from the number of spots", () => {
    expect(nextSpotTitle([])).toBe("Punkt 1");
    expect(nextSpotTitle([spot])).toBe("Punkt 2");
  });

  it("skips names already taken", () => {
    expect(nextSpotTitle([eastSpot])).toBe("Punkt 3");
    expect(
      nextSpotTitle([eastSpot, { ...spot, title: "Punkt 3" }])
    ).toBe("Punkt 4");
  });
});

describe("spotPreviewFeatures", () => {
  it("has nothing, not even a cover, without spots", () => {
    expect(spotPreviewFeatures([], 0.5).features).toEqual([]);
  });

  it("has one cover, then a ring and a middle for each spot", () => {
    const { features } = spotPreviewFeatures([spot, eastSpot], 0.6);
    expect(features.map(({ properties }) => properties?.["kind"])).toEqual([
      "cover",
      "ring",
      "ring",
      "middle",
      "middle",
    ]);
    expect(features[0].properties).toEqual({ kind: "cover", dim: 0.6 });
    const middle = features[3].geometry;
    expect(middle.type === "Point" && middle.coordinates).toEqual(
      mercatorToLngLat(center)
    );
  });

  /** the rings of the cover: the world's outline and one per opening */
  const coverRings = (spots: readonly Spot[]) => {
    const { geometry } = spotPreviewFeatures(spots, 0.6).features[0];
    return geometry.type === "Polygon" ? geometry.coordinates : undefined;
  };

  it("cuts spots apart from each other out one by one", () => {
    const farSpot = { ...eastSpot, center: east(400) };
    expect(coverRings([spot, farSpot])).toHaveLength(3);
  });

  it("leaves overlapping spots one opening, not two holes that cross", () => {
    expect(coverRings([spot, eastSpot])).toHaveLength(2);
  });
});

import { booleanPointInPolygon, centroid } from "@turf/turf";
import type { Feature, Polygon } from "geojson";
import { describe, expect, it } from "vitest";

import { resolveNavConstants } from "./constants";
import { normalize, subtract } from "./geometry";
import { interiorPointOf } from "./origin";
import { pickInDirection } from "./pick";
import type { PickInput, ScreenPoint } from "./types";

/**
 * A6: the origin has to lie inside the selected feature.
 *
 * A C-shaped polygon has its centroid in its own concavity, i.e. outside
 * itself, and every direction measured from there is inverted. The coordinates
 * double as screen pixels here — the picking core is coordinate-system
 * agnostic, which is exactly what makes this testable without a map.
 */

/** a 3x3 square with the right half of its middle row cut out */
const cShape: Feature<Polygon> = {
  type: "Feature",
  properties: {},
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [3, 0],
        [3, 1],
        [1, 1],
        [1, 2],
        [3, 2],
        [3, 3],
        [0, 3],
        [0, 0],
      ],
    ],
  },
};

const centroidOf = (): ScreenPoint => {
  const [x, y] = centroid(cShape).geometry.coordinates;
  return { x, y };
};

const inputFor = (
  origin: ScreenPoint,
  axis: ScreenPoint,
  at: ScreenPoint
): PickInput => ({
  origin,
  axis,
  candidates: [{ key: "neighbour", isArea: false, parts: [[at]] }],
  constants: resolveNavConstants(),
  originIsArea: false,
  strategy: "nearest-in-cone",
  crossLayer: "free",
  currentLayerBonus: 0.6,
  minStepPx: 0.001,
  fanDeg: 8,
  rayLengthPx: 100,
});

describe("interior origin", () => {
  it("returns a point on the feature where the centroid is outside it", () => {
    const interior = interiorPointOf(cShape.geometry);
    expect(interior).toBeDefined();

    expect(booleanPointInPolygon(interior as number[], cShape)).toBe(true);
    expect(booleanPointInPolygon(centroid(cShape), cShape)).toBe(false);
  });

  it("inverts every direction when the centroid is used instead", () => {
    const [ix, iy] = interiorPointOf(cShape.geometry) as number[];
    const interior: ScreenPoint = { x: ix, y: iy };
    const outside = centroidOf();

    // a neighbour halfway between the two: from the interior point it lies
    // towards the centroid, from the centroid it lies in the opposite direction
    const neighbour: ScreenPoint = {
      x: (interior.x + outside.x) / 2,
      y: (interior.y + outside.y) / 2,
    };
    const axis = normalize(subtract(outside, interior));

    expect(pickInDirection(inputFor(interior, axis, neighbour)).winnerKey).toBe(
      "neighbour"
    );
    // same key, same neighbour, centroid origin: it is now behind the axis
    const fromCentroid = pickInDirection(inputFor(outside, axis, neighbour));
    expect(fromCentroid.winnerKey).toBeUndefined();
    expect(fromCentroid.explanation.evaluations[0].rejectedBecause).toBe(
      "behind-origin"
    );
  });
});

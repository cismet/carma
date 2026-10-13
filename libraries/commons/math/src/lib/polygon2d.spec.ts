import { describe, expect, it } from "vitest";

import {
  applyPolygonWeights2d,
  findLargestInscribedPoint2d,
  getConvexHull2d,
  getMeanValueWeights2d,
  isPointInsidePolygon2d,
} from "./polygon2d";

const at = (x: number, y: number) => ({ x, y });
const square = [at(0, 0), at(100, 0), at(100, 100), at(0, 100)];
// an L whose centroid lies outside the shape
const lShape = [
  at(0, 0),
  at(200, 0),
  at(200, 30),
  at(30, 30),
  at(30, 200),
  at(0, 200),
];

describe("polygon2d", () => {
  it("tells inside, outline and outside apart on a concave polygon", () => {
    expect(isPointInsidePolygon2d(lShape, at(10, 150))).toBe(true);
    expect(isPointInsidePolygon2d(lShape, at(0, 50))).toBe(true);
    expect(isPointInsidePolygon2d(lShape, at(100, 100))).toBe(false);
  });

  it("finds the pole of inaccessibility inside a concave polygon", () => {
    const pole = findLargestInscribedPoint2d(lShape)!;
    expect(isPointInsidePolygon2d(lShape, pole.center)).toBe(true);
    expect(pole.radius).toBeGreaterThan(10);
    expect(findLargestInscribedPoint2d(square)!.radius).toBeCloseTo(50, 0);
  });

  it("rebuilds a point from its mean value weights", () => {
    const point = at(20, 120);
    const weights = getMeanValueWeights2d(point, lShape)!;
    const rebuilt = applyPolygonWeights2d(weights, lShape);
    expect(rebuilt.x).toBeCloseTo(point.x, 6);
    expect(rebuilt.y).toBeCloseTo(point.y, 6);
    expect(getMeanValueWeights2d(at(0, 0), lShape)).toBeNull();
  });

  it("wraps the points in their convex hull", () => {
    const hull = getConvexHull2d([...square, at(50, 50), at(50, 0)]);
    expect(hull).toHaveLength(4);
    expect(hull).toEqual(expect.arrayContaining(square));
  });
});

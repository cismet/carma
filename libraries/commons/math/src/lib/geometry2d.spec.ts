import { describe, expect, it } from "vitest";

import {
  addPoint2d,
  buildCirclePoints,
  classifyConvexPolygonIntersection2d,
  clipConvexPolygonByConvexPolygon2d,
  dotPoint2d,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  getLeftPerpendicular2d,
  hasPolygonSelfIntersection2d,
  getPolygonCentroid2d,
  getMidpoint2d,
  getPolygonArea2d,
  getPointLength2d,
  getSegmentFrame2d,
  getSignedPolygonArea2d,
  getSupportRadius2d,
  scalePoint2d,
  subtractPoint2d,
} from "./geometry2d";
const sortPoints = (
  points: readonly {
    x: number;
    y: number;
  }[]
) =>
  [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x
  );

describe("geometry2d", () => {
  it("computes equilateral triangle helpers", () => {
    const edge = 10;
    const expectedHeight = (edge * Math.sqrt(3)) / 2;

    expect(getEquilateralTriangleHeight(edge)).toBeCloseTo(expectedHeight);
    expect(getEquilateralTrianglePathD(edge)).toBe(
      `M 5 0 L 0 ${expectedHeight} L 10 ${expectedHeight} Z`
    );
    expect(getEquilateralTriangleViewBox(edge)).toBe(
      `0 0 10 ${expectedHeight}`
    );
  });

  it("builds circle points and returns support radius", () => {
    const points = buildCirclePoints(12, 24);

    expect(points).toHaveLength(24);
    expect(getSupportRadius2d(points)).toBeCloseTo(12);
  });

  it("computes signed and absolute polygon area", () => {
    const ccwSquare = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 2 },
    ];
    const cwSquare = [...ccwSquare].reverse();

    expect(getSignedPolygonArea2d(ccwSquare)).toBeCloseTo(4);
    expect(getSignedPolygonArea2d(cwSquare)).toBeCloseTo(-4);
    expect(getPolygonArea2d(cwSquare)).toBeCloseTo(4);
  });

  it("detects polygon self-intersections", () => {
    expect(
      hasPolygonSelfIntersection2d({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 3, y: -2 },
          { x: 0, y: 10 },
        ],
      })
    ).toBe(true);

    expect(
      hasPolygonSelfIntersection2d({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 2, y: 0 },
          { x: 8, y: 0 },
          { x: 0, y: 10 },
        ],
      })
    ).toBe(true);

    expect(
      hasPolygonSelfIntersection2d({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 10 },
          { x: 0, y: 10 },
        ],
      })
    ).toBe(false);

    expect(
      hasPolygonSelfIntersection2d({
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 10 },
          { x: 5, y: 0 },
        ],
      })
    ).toBe(false);
  });

  it("computes polygon centroids and handles degenerate polygons", () => {
    expect(
      getPolygonCentroid2d({
        points: [
          { x: 0, y: 0 },
          { x: 4, y: 0 },
          { x: 4, y: 4 },
          { x: 0, y: 4 },
        ],
      })
    ).toEqual({ x: 2, y: 2 });

    expect(
      getPolygonCentroid2d({
        points: [
          { x: 0, y: 0 },
          { x: 2, y: 0 },
          { x: 4, y: 0 },
        ],
        degenerateAreaEpsilon: 1e-9,
      })
    ).toEqual({ x: 2, y: 0 });
  });

  it("provides point and segment helpers", () => {
    const start = { x: 2, y: 4 };
    const end = { x: 8, y: 4 };

    expect(addPoint2d(start, end)).toEqual({ x: 10, y: 8 });
    expect(subtractPoint2d(end, start)).toEqual({ x: 6, y: 0 });
    expect(scalePoint2d({ x: 3, y: -2 }, 2)).toEqual({ x: 6, y: -4 });
    expect(dotPoint2d({ x: 3, y: 4 }, { x: -2, y: 5 })).toBe(14);
    expect(getPointLength2d({ x: 3, y: 4 })).toBe(5);
    expect(getMidpoint2d(start, end)).toEqual({ x: 5, y: 4 });
    expect(getLeftPerpendicular2d({ x: 6, y: 0 })).toEqual({ x: 0, y: 6 });
    expect(getSegmentFrame2d({ start, end })).toEqual({
      delta: { x: 6, y: 0 },
      length: 6,
      midpoint: { x: 5, y: 4 },
      leftUnitNormal: { x: 0, y: 1 },
    });
    expect(
      getSegmentFrame2d({
        start,
        end: start,
        epsilon: 1e-9,
      })
    ).toBeNull();
  });

  it("clips overlapping convex polygons", () => {
    const intersection = clipConvexPolygonByConvexPolygon2d({
      subject: [
        { x: -2, y: -2 },
        { x: 2, y: -2 },
        { x: 2, y: 2 },
        { x: -2, y: 2 },
      ],
      clip: [
        { x: 0, y: -1 },
        { x: 3, y: -1 },
        { x: 3, y: 1 },
        { x: 0, y: 1 },
      ],
    });

    expect(sortPoints(intersection)).toEqual(
      sortPoints([
        { x: 0, y: -1 },
        { x: 2, y: -1 },
        { x: 2, y: 1 },
        { x: 0, y: 1 },
      ])
    );
  });

  it("classifies disjoint, containment, and overlap relations", () => {
    const subject = [
      { x: -2, y: -2 },
      { x: 2, y: -2 },
      { x: 2, y: 2 },
      { x: -2, y: 2 },
    ];

    expect(
      classifyConvexPolygonIntersection2d({
        subject,
        clip: [
          { x: 3, y: 3 },
          { x: 4, y: 3 },
          { x: 4, y: 4 },
          { x: 3, y: 4 },
        ],
      })
    ).toBe("disjoint");

    expect(
      classifyConvexPolygonIntersection2d({
        subject: [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
          { x: -1, y: 1 },
        ],
        clip: subject,
      })
    ).toBe("subject-inside-clip");

    expect(
      classifyConvexPolygonIntersection2d({
        subject,
        clip: [
          { x: -1, y: -1 },
          { x: 1, y: -1 },
          { x: 1, y: 1 },
          { x: -1, y: 1 },
        ],
      })
    ).toBe("clip-inside-subject");

    expect(
      classifyConvexPolygonIntersection2d({
        subject,
        clip: [
          { x: 0, y: -3 },
          { x: 3, y: -3 },
          { x: 3, y: 0 },
          { x: 0, y: 0 },
        ],
      })
    ).toBe("overlap");
  });
});

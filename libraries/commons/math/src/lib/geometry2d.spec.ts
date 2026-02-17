import { describe, expect, it } from "vitest";

import {
  buildCirclePoints,
  getEquilateralTriangleHeight,
  getEquilateralTrianglePathD,
  getEquilateralTriangleViewBox,
  getSupportRadius2d,
} from "./geometry2d";

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
});

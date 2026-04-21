import { describe, expect, it } from "vitest";

import {
  crossPoint3,
  getPointLength3d,
  getPolygonArea3d,
  getTriangleArea3d,
  subtractPoint3,
} from "./point3";

describe("point3", () => {
  it("provides basic point helpers", () => {
    expect(
      subtractPoint3({ x: 5, y: 4, z: 3 }, { x: 1, y: 2, z: 3 })
    ).toEqual({
      x: 4,
      y: 2,
      z: 0,
    });

    expect(
      crossPoint3({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 })
    ).toEqual({
      x: 0,
      y: 0,
      z: 1,
    });

    expect(getPointLength3d({ x: 2, y: 3, z: 6 })).toBeCloseTo(7);
  });

  it("computes triangle and polygon areas in 3d", () => {
    expect(
      getTriangleArea3d({
        a: { x: 0, y: 0, z: 0 },
        b: { x: 2, y: 0, z: 0 },
        c: { x: 0, y: 3, z: 0 },
      })
    ).toBeCloseTo(3);

    expect(
      getPolygonArea3d([
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 2, y: 2, z: 0 },
        { x: 0, y: 2, z: 0 },
      ])
    ).toBeCloseTo(4);
  });
});

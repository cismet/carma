import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { clipConvexPolygonByPlanes3d } from "@carma/math";

import { createPerspectiveViewClipPlanes3 } from "./perspective-view-clip-planes";
const sortPointPairs = (points: readonly { x: number; y: number }[]) =>
  [...points].sort((left, right) =>
    left.x === right.x ? left.y - right.y : left.x - right.x
  );

describe("perspective view clip planes", () => {
  it("builds planes that clip a coplanar target according to the given camera basis and fovs", () => {
    const clipped = clipConvexPolygonByPlanes3d(
      [
        new Vector3(2, -2, 0),
        new Vector3(-2, -2, 0),
        new Vector3(-2, 2, 0),
        new Vector3(2, 2, 0),
      ],
      createPerspectiveViewClipPlanes3({
        apex: new Vector3(0, 0, -2),
        forward: new Vector3(0, 0, 1),
        up: new Vector3(0, 1, 0),
        fovHorizontalRad: Math.PI / 2,
        fovVerticalRad: Math.PI / 2,
      })
    );

    expect(
      sortPointPairs(
        clipped.map((point) => ({
          x: point.x,
          y: point.y,
        }))
      )
    ).toEqual(
      sortPointPairs([
        { x: 2, y: -2 },
        { x: -2, y: -2 },
        { x: -2, y: 2 },
        { x: 2, y: 2 },
      ])
    );
  });

  it("optionally adds near and far cap planes", () => {
    const clipped = clipConvexPolygonByPlanes3d(
      [
        new Vector3(3, 0, 0),
        new Vector3(-3, 0, 0),
        new Vector3(-3, 0, 5),
        new Vector3(3, 0, 5),
      ],
      createPerspectiveViewClipPlanes3({
        apex: new Vector3(0, 0, -1),
        forward: new Vector3(0, 0, 1),
        up: new Vector3(0, 1, 0),
        fovHorizontalRad: Math.PI / 2,
        fovVerticalRad: Math.PI / 2,
        near: 2,
        far: 4,
      })
    );

    expect(clipped.every((point) => point.z >= 1 - 1e-6)).toBe(true);
    expect(clipped.every((point) => point.z <= 3 + 1e-6)).toBe(true);
  });
});

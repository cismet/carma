import { describe, expect, it } from "vitest";
import { Plane, Vector3 } from "three";

import {
  clipConvexPolygonByPlanes3d,
  createPlaneBasisFromNormal,
  intersectRayWithPlane,
} from "./geometry3d";
import { Ray } from "three";

const createPlaneFromOriginAndNormal = ({
  origin,
  normal,
}: {
  origin: Vector3;
  normal: Vector3;
}): Plane => new Plane().setFromNormalAndCoplanarPoint(normal.clone(), origin);

const sortPointTriples = (points: readonly Vector3[]) =>
  [...points].sort((left, right) =>
    left.x === right.x
      ? left.z === right.z
        ? left.y - right.y
        : left.z - right.z
      : left.x - right.x
  );

describe("geometry3d", () => {
  it("intersects a ray with a plane", () => {
    const intersection = intersectRayWithPlane(
      new Ray(new Vector3(-2, 0, 0), new Vector3(1, 0, 0)),
      createPlaneFromOriginAndNormal({
        origin: new Vector3(0, 0, 0),
        normal: new Vector3(1, 0, 0),
      })
    );

    expect(intersection).not.toBeNull();
    expect(intersection?.x).toBeCloseTo(0);
    expect(intersection?.y).toBeCloseTo(0);
    expect(intersection?.z).toBeCloseTo(0);
  });

  it("clips a coplanar target polygon by multiple clip planes", () => {
    const clipped = clipConvexPolygonByPlanes3d(
      [
        new Vector3(2, 0, -2),
        new Vector3(-2, 0, -2),
        new Vector3(-2, 0, 2),
        new Vector3(2, 0, 2),
      ],
      [
        createPlaneFromOriginAndNormal({
          origin: new Vector3(1, 0, 0),
          normal: new Vector3(-1, 0, 0),
        }),
        createPlaneFromOriginAndNormal({
          origin: new Vector3(-1, 0, 0),
          normal: new Vector3(1, 0, 0),
        }),
        createPlaneFromOriginAndNormal({
          origin: new Vector3(0, 0, 1),
          normal: new Vector3(0, 0, -1),
        }),
        createPlaneFromOriginAndNormal({
          origin: new Vector3(0, 0, -1),
          normal: new Vector3(0, 0, 1),
        }),
      ]
    );

    expect(clipped).toHaveLength(4);
    expect(sortPointTriples(clipped)).toEqual(
      sortPointTriples([
        new Vector3(1, 0, -1),
        new Vector3(-1, 0, -1),
        new Vector3(-1, 0, 1),
        new Vector3(1, 0, 1),
      ])
    );
  });

  it("builds an orthonormal plane basis from a normal", () => {
    const planeBasis = createPlaneBasisFromNormal(new Vector3(0, 1, 0));

    expect(planeBasis.xAxis.length()).toBeCloseTo(1);
    expect(planeBasis.yAxis.length()).toBeCloseTo(1);
    expect(planeBasis.xAxis.dot(planeBasis.yAxis)).toBeCloseTo(0);
    expect(planeBasis.xAxis.dot(new Vector3(0, 1, 0))).toBeCloseTo(0);
    expect(planeBasis.yAxis.dot(new Vector3(0, 1, 0))).toBeCloseTo(0);
  });
});

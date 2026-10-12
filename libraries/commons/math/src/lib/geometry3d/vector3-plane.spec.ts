import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  getArcPointsInSpannedPlane,
  getNormalizedTriangleNormal,
  getSignedVector3DistanceToPlane,
  getVector3Centroid,
  moveVector3Toward,
  normalizeDirection,
  projectVector3OntoPlane,
  removeVector3ComponentAlongAxis,
} from "./vector3-plane";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const up = v(0, 0, 1);

describe("vector3-plane", () => {
  it("averages positions", () => {
    expect(getVector3Centroid([v(0, 0, 0), v(2, 4, 6)])).toEqual(v(1, 2, 3));
    expect(getVector3Centroid([])).toBeNull();
  });

  it("moves toward a target without passing it", () => {
    expect(moveVector3Toward(v(0, 0, 0), v(10, 0, 0), 3)).toEqual(v(3, 0, 0));
    expect(moveVector3Toward(v(0, 0, 0), v(2, 0, 0), 3)).toEqual(v(2, 0, 0));
  });

  it("removes and projects along an axis or plane", () => {
    expect(removeVector3ComponentAlongAxis(v(1, 2, 3), up)).toEqual(v(1, 2, 0));
    expect(projectVector3OntoPlane(v(1, 2, 3), v(0, 0, 1), up)).toEqual(
      v(1, 2, 1)
    );
    expect(getSignedVector3DistanceToPlane(v(1, 2, 3), v(0, 0, 1), up)).toBe(2);
    expect(normalizeDirection(v(0, 0, 0))).toBeNull();
  });

  it("returns the unit normal of a triangle, null when degenerate", () => {
    expect(
      getNormalizedTriangleNormal(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0))
    ).toEqual(up);
    expect(
      getNormalizedTriangleNormal(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0))
    ).toBeNull();
  });

  it("draws the arc from the first leg to the second", () => {
    const arc = getArcPointsInSpannedPlane(
      v(0, 0, 0),
      v(0, 0, 10),
      v(10, 0, 0),
      2,
      8
    )!;
    expect(arc[0]!.distanceTo(v(0, 0, 2))).toBeLessThan(1e-9);
    expect(arc.at(-1)!.distanceTo(v(2, 0, 0))).toBeLessThan(1e-9);
    expect(
      getArcPointsInSpannedPlane(v(0, 0, 0), v(0, 0, 10), v(0, 0, 20), 2, 8)
    ).toBeNull();
  });
});

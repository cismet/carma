import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  getArcPointsInSpannedPlane,
  getNormalizedPolygonNormal,
  getNormalizedTriangleNormal,
  getSignedVector3DistanceToPlane,
  projectVector3OntoPlane,
} from "./vector3-plane";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);
const up = v(0, 0, 1);

describe("vector3-plane", () => {
  it("projects onto a plane and measures the signed distance to it", () => {
    expect(projectVector3OntoPlane(v(1, 2, 3), v(0, 0, 1), up)).toEqual(
      v(1, 2, 1)
    );
    expect(getSignedVector3DistanceToPlane(v(1, 2, 3), v(0, 0, 1), up)).toBe(2);
  });

  it("returns the unit normal of a triangle, null when degenerate", () => {
    expect(
      getNormalizedTriangleNormal(v(0, 0, 0), v(1, 0, 0), v(0, 1, 0))
    ).toEqual(up);
    expect(
      getNormalizedTriangleNormal(v(0, 0, 0), v(1, 0, 0), v(2, 0, 0))
    ).toBeNull();
  });

  it("takes the polygon normal from its winding, not from three corners", () => {
    const square = [v(0, 0, 5), v(4, 0, 5), v(4, 4, 5), v(0, 4, 5)];
    expect(getNormalizedPolygonNormal(square)).toEqual(up);
    expect(getNormalizedPolygonNormal([...square].reverse())).toEqual(
      v(0, 0, -1)
    );
    // the first three corners are collinear, so a triangle normal has none
    const collinearStart = [v(0, 0, 0), v(1, 0, 0), v(2, 0, 0), v(2, 2, 0)];
    expect(getNormalizedPolygonNormal(collinearStart)).toEqual(up);
  });

  it("gives no polygon normal for corners that span no plane", () => {
    expect(getNormalizedPolygonNormal([v(0, 0, 0), v(1, 0, 0)])).toBeNull();
    expect(
      getNormalizedPolygonNormal([v(0, 0, 0), v(1, 0, 0), v(2, 0, 0)])
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

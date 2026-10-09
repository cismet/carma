import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { vector3FromMetricVector3 } from "../geometry";
import {
  createBestFitPlanePca,
  createPlaneFromLargestTriangle,
} from "./planar-geometry";

const normalizedAbsDot = (left: Vector3, right: Vector3) => {
  const normalizedLeft = left.clone().normalize();
  const normalizedRight = right.clone().normalize();
  return Math.abs(normalizedLeft.dot(normalizedRight));
};

describe("planar geometry plane fitting", () => {
  it("uses the largest consecutive non-collinear triangle to derive a plane", () => {
    const plane = createPlaneFromLargestTriangle([
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(0, 1, 0),
      new Vector3(10, 0, 0),
      new Vector3(0, 10, 10),
    ]);

    expect(plane).not.toBeNull();
    expect(
      normalizedAbsDot(
        vector3FromMetricVector3(plane!.normalECEF),
        new Vector3(0, -1, 1)
      )
    ).toBeGreaterThan(0.999);
  });

  it("keeps largest triangle selection linear by only comparing polygon-neighbor triples", () => {
    const plane = createPlaneFromLargestTriangle([
      new Vector3(0, 0, 0),
      new Vector3(1, 0, 0),
      new Vector3(2, 0, 0),
      new Vector3(3, 0, 0),
      new Vector3(0, 10, 10),
    ]);

    expect(plane).not.toBeNull();
    expect(
      normalizedAbsDot(
        vector3FromMetricVector3(plane!.normalECEF),
        new Vector3(0, -1, 1)
      )
    ).toBeGreaterThan(0.999);
  });

  it("fits a PCA plane from all non-collinear samples", () => {
    const plane = createBestFitPlanePca([
      new Vector3(-2, -1, -2.9),
      new Vector3(2, -1, 6.9),
      new Vector3(-2, 1, 4.9),
      new Vector3(2, 1, 12.9),
      new Vector3(0, 0, 5.1),
    ]);

    expect(plane).not.toBeNull();
    expect(
      normalizedAbsDot(
        vector3FromMetricVector3(plane!.normalECEF),
        new Vector3(-2, -3, 1)
      )
    ).toBeGreaterThan(0.99);
  });
});

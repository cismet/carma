import { Cartesian3 } from "@carma-cesium";
import { describe, expect, it } from "vitest";

import {
  createBestFitPlanePca,
  createPlaneFromLargestTriangle,
} from "./planar-geometry";
import { cartesian3FromMetricVector3 } from "@carma-mapping/engines/cesium/core";

const normalizedAbsDot = (left: Cartesian3, right: Cartesian3) => {
  const normalizedLeft = Cartesian3.normalize(left, new Cartesian3());
  const normalizedRight = Cartesian3.normalize(right, new Cartesian3());
  return Math.abs(Cartesian3.dot(normalizedLeft, normalizedRight));
};

describe("planar geometry plane fitting", () => {
  it("uses the largest non-collinear triangle to derive a plane", () => {
    const plane = createPlaneFromLargestTriangle([
      new Cartesian3(0, 0, 0),
      new Cartesian3(1, 0, 0),
      new Cartesian3(0, 1, 0),
      new Cartesian3(10, 0, 0),
      new Cartesian3(0, 10, 10),
    ]);

    expect(plane).not.toBeNull();
    expect(
      normalizedAbsDot(
        cartesian3FromMetricVector3(plane!.normalECEF),
        new Cartesian3(0, -1, 1)
      )
    ).toBeGreaterThan(0.999);
  });

  it("fits a PCA plane from all non-collinear samples", () => {
    const plane = createBestFitPlanePca([
      new Cartesian3(-2, -1, -2.9),
      new Cartesian3(2, -1, 6.9),
      new Cartesian3(-2, 1, 4.9),
      new Cartesian3(2, 1, 12.9),
      new Cartesian3(0, 0, 5.1),
    ]);

    expect(plane).not.toBeNull();
    expect(
      normalizedAbsDot(
        cartesian3FromMetricVector3(plane!.normalECEF),
        new Cartesian3(-2, -3, 1)
      )
    ).toBeGreaterThan(0.99);
  });
});

import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  computeCovarianceMatrix3,
  resolveSmallestEigenVectorSymmetricMatrix3,
} from "./symmetric-matrix3-eigen";

describe("computeCovarianceMatrix3", () => {
  it("sums the outer products around the center", () => {
    expect(
      computeCovarianceMatrix3(
        [new Vector3(1, 0, 0), new Vector3(-1, 2, 0)],
        new Vector3(0, 1, 0)
      )
    ).toEqual([
      [2, -2, 0],
      [-2, 2, 0],
      [0, 0, 0],
    ]);
  });
});

describe("resolveSmallestEigenVectorSymmetricMatrix3", () => {
  it("returns the axis of the smallest eigenvalue of a diagonal matrix", () => {
    expect(
      resolveSmallestEigenVectorSymmetricMatrix3([
        [3, 0, 0],
        [0, 1, 0],
        [0, 0, 2],
      ])
    ).toEqual([0, 1, 0]);
  });

  it("finds the normal of points spread in a tilted plane", () => {
    const normal = new Vector3(1, 1, 1).normalize();
    const inPlaneA = new Vector3(1, -1, 0).normalize();
    const inPlaneB = new Vector3().crossVectors(normal, inPlaneA);
    const points = [
      [0, 0],
      [4, 1],
      [-2, 3],
      [1, -5],
      [3, 3],
    ].map(([a, b]) =>
      inPlaneA
        .clone()
        .multiplyScalar(a!)
        .addScaledVector(inPlaneB, b!)
        .addScaledVector(normal, 10)
    );
    const center = points
      .reduce((sum, point) => sum.add(point), new Vector3())
      .divideScalar(points.length);
    const eigenVector = new Vector3(
      ...resolveSmallestEigenVectorSymmetricMatrix3(
        computeCovarianceMatrix3(points, center)
      )
    );
    expect(eigenVector.length()).toBeCloseTo(1, 9);
    expect(Math.abs(eigenVector.dot(normal))).toBeCloseTo(1, 9);
  });
});

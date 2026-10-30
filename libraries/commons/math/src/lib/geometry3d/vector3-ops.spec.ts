import { Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  getVector3Centroid,
  moveVector3Toward,
  normalizeVector3Direction,
  removeVector3ComponentAlongAxis,
} from "./vector3-ops";

const v = (x: number, y: number, z: number) => new Vector3(x, y, z);

describe("vector3-ops", () => {
  it("averages positions", () => {
    expect(getVector3Centroid([v(0, 0, 0), v(2, 4, 6)])).toEqual(v(1, 2, 3));
    expect(getVector3Centroid([])).toBeNull();
  });

  it("moves toward a target without passing it", () => {
    expect(moveVector3Toward(v(0, 0, 0), v(10, 0, 0), 3)).toEqual(v(3, 0, 0));
    expect(moveVector3Toward(v(0, 0, 0), v(2, 0, 0), 3)).toEqual(v(2, 0, 0));
  });

  it("removes the component along an axis", () => {
    expect(removeVector3ComponentAlongAxis(v(1, 2, 3), v(0, 0, 2))).toEqual(
      v(1, 2, 0)
    );
  });

  it("normalizes a copy, null for a degenerate direction", () => {
    const direction = v(0, 3, 4);
    const unit = normalizeVector3Direction(direction)!;
    expect(unit.length()).toBeCloseTo(1, 12);
    expect(unit.y).toBeCloseTo(0.6, 12);
    expect(unit.z).toBeCloseTo(0.8, 12);
    expect(direction).toEqual(v(0, 3, 4));
    expect(normalizeVector3Direction(v(0, 0, 0))).toBeNull();
  });
});

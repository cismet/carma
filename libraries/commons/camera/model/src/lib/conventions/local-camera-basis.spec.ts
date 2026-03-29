import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import {
  buildOrientationQuaternionFromLocalCameraBasis,
  readLocalCameraBasis,
} from "./local-camera-basis";

describe("local camera basis", () => {
  it("reads the identity orientation into the canonical local basis", () => {
    const basis = readLocalCameraBasis(new Quaternion());

    expect(basis.forward.distanceTo(new Vector3(0, 0, -1))).toBeLessThan(1e-8);
    expect(basis.up.distanceTo(new Vector3(0, 1, 0))).toBeLessThan(1e-8);
    expect(basis.right.distanceTo(new Vector3(1, 0, 0))).toBeLessThan(1e-8);
  });

  it("round-trips a quaternion through the local camera basis", () => {
    const orientation = new Quaternion()
      .setFromAxisAngle(new Vector3(0, 1, 0), 0.73)
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -0.41))
      .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), 0.22));

    const basis = readLocalCameraBasis(orientation);
    const rebuilt = buildOrientationQuaternionFromLocalCameraBasis(basis);

    expect(rebuilt.angleTo(orientation)).toBeLessThan(1e-8);
  });
});

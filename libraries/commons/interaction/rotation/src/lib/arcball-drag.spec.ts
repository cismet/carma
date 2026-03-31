import { describe, expect, it } from "vitest";
import { Quaternion, Vector3 } from "three";
import {
  buildVersorRotationFromArcballVectors,
  buildWorldVersorRotationFromArcballVectors,
  mapPointerToArcballVector,
  mapScreenVersorRotationToWorld,
} from "./arcball-drag";

describe("arcball-drag", () => {
  it("maps viewport center to the arcball north pole", () => {
    const vector = mapPointerToArcballVector({
      clientX: 110,
      clientY: 70,
      viewport: {
        left: 10,
        top: 20,
        width: 200,
        height: 100,
      },
    });

    expect(vector.x).toBeCloseTo(0, 8);
    expect(vector.y).toBeCloseTo(0, 8);
    expect(vector.z).toBeCloseTo(1, 8);
  });

  it("normalizes out-of-ring pointers onto the arcball rim", () => {
    const vector = mapPointerToArcballVector({
      clientX: 230,
      clientY: 70,
      viewport: {
        left: 10,
        top: 20,
        width: 200,
        height: 100,
      },
    });

    expect(vector.length()).toBeCloseTo(1, 8);
    expect(vector.z).toBeCloseTo(0, 8);
  });

  it("builds a quaternion that rotates start vector to current vector", () => {
    const rotation = buildVersorRotationFromArcballVectors({
      startVector: new Vector3(1, 0, 0),
      currentVector: new Vector3(0, 1, 0),
    });
    const rotated = new Vector3(1, 0, 0).applyQuaternion(rotation);

    expect(rotated.angleTo(new Vector3(0, 1, 0))).toBeLessThan(1e-6);
  });

  it("maps screen-space versor rotation into world space via camera frame", () => {
    const cameraWorldQuaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 2
    );
    const screenRotation = new Quaternion().setFromAxisAngle(
      new Vector3(0, 0, 1),
      Math.PI / 3
    );
    const worldRotation = mapScreenVersorRotationToWorld({
      screenRotation,
      cameraWorldQuaternion,
    });
    const screenFrameVector = new Vector3(0.2, 0.5, -0.3).normalize();
    const worldFrameVector = screenFrameVector
      .clone()
      .applyQuaternion(cameraWorldQuaternion);
    const rotatedInWorld = worldFrameVector
      .clone()
      .applyQuaternion(worldRotation);
    const expectedWorld = screenFrameVector
      .clone()
      .applyQuaternion(screenRotation)
      .applyQuaternion(cameraWorldQuaternion);

    expect(rotatedInWorld.angleTo(expectedWorld)).toBeLessThan(1e-6);
  });

  it("exposes a convenience helper for full arcball to world rotation", () => {
    const startVector = new Vector3(1, 0, 0);
    const currentVector = new Vector3(0, 1, 0);
    const cameraWorldQuaternion = new Quaternion().setFromAxisAngle(
      new Vector3(0, 1, 0),
      Math.PI / 4
    );

    const direct = buildWorldVersorRotationFromArcballVectors({
      startVector,
      currentVector,
      cameraWorldQuaternion,
    });
    const composed = mapScreenVersorRotationToWorld({
      screenRotation: buildVersorRotationFromArcballVectors({
        startVector,
        currentVector,
      }),
      cameraWorldQuaternion,
    });
    const probe = new Vector3(0.7, -0.2, 0.5).normalize();
    const directRotated = probe.clone().applyQuaternion(direct);
    const composedRotated = probe.clone().applyQuaternion(composed);

    expect(directRotated.angleTo(composedRotated)).toBeLessThan(1e-6);
  });
});

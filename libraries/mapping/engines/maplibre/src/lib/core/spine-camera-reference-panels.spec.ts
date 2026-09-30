import { Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createSpineCameraRig } from "./spine-camera-rig";
import { forward, referenceEdge } from "./camera-rig.test-support";

describe("spine camera reference panels", () => {
  it.each([1, -1] as const)(
    "joins reference panels at a bend, on side %s",
    (side) => {
      const views = createSpineCameraRig({
        points: [
          new Vector3(),
          new Vector3(100, 0, 0),
          new Vector3(100, 0, 100),
        ],
        closed: false,
        count: 4,
        height: 20,
        offset: 20,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        side,
        referenceSurfaceOffset: [10, 15],
        screenOrder: true,
      });
      for (let index = 1; index < views.length; index++)
        expect(
          referenceEdge(views[index - 1], 1).distanceTo(
            referenceEdge(views[index], -1)
          )
        ).toBeLessThan(1e-10);
      expect(views.map(({ distance }) => distance).sort()).toEqual([
        30, 30, 35, 35,
      ]);
      for (const view of views) {
        for (const sign of [-1, 1]) {
          const projected = referenceEdge(view, sign).project(view.camera);
          expect(projected.x).toBeCloseTo(sign);
          expect(Math.abs(projected.z)).toBeLessThan(1);
        }
      }
    }
  );

  it("closes the offset reference wall at the wrap seam", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(),
        new Vector3(100, 0, 0),
        new Vector3(100, 0, 100),
        new Vector3(0, 0, 100),
      ],
      closed: true,
      count: 4,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: 1,
      referenceSurfaceOffset: 10,
    });
    for (let index = 0; index < views.length; index++)
      expect(
        referenceEdge(views[index], 1).distanceTo(
          referenceEdge(views[(index + 1) % views.length], -1)
        )
      ).toBeLessThan(1e-10);
  });

  it("changes reference framing without moving the foreground cut", () => {
    const options = {
      points: [new Vector3(), new Vector3(100, 0, 0)],
      closed: false,
      count: 1,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 4,
      side: 1 as const,
    };
    const [original] = createSpineCameraRig(options);
    const [shifted] = createSpineCameraRig({
      ...options,
      referenceSurfaceOffset: 10,
    });
    expect(shifted.clipPlanes[0].equals(original.clipPlanes[0])).toBe(true);
    expect(shifted.distance).toBe(original.distance + 10);
    expect(
      shifted.camera.position.distanceTo(original.camera.position)
    ).toBeLessThan(1e-12);
  });

  it("rejects incompatible, folded and out-of-frustum reference surfaces", () => {
    const options = {
      points: [new Vector3(), new Vector3(10, 0, 0), new Vector3(10, 0, 10)],
      closed: false,
      count: 2,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: -1 as const,
    };
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: 15 })
    ).toThrow("folds");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: -30 })
    ).toThrow("between near and far");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: [1] })
    ).toThrow("one finite offset");
    expect(() =>
      createSpineCameraRig({ ...options, referenceSurfaceOffset: NaN })
    ).toThrow("one finite offset");
    expect(() =>
      createSpineCameraRig({
        ...options,
        points: [new Vector3(), new Vector3(10, 0, 0), new Vector3(20, 0, 0)],
        referenceSurfaceOffset: [1, 2],
      })
    ).toThrow("Parallel");
  });

  it.each([1, -1] as const)(
    "unfolds the opposite facade downward with side %s above",
    (side) => {
      const options = {
        points: [new Vector3(0, 0, 0), new Vector3(100, 0, 0)],
        closed: false,
        count: 2,
        height: 30,
        offset: 10,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        screenOrder: true,
      };
      const upper = createSpineCameraRig({ ...options, side });
      const lower = createSpineCameraRig({
        ...options,
        side: side === 1 ? -1 : 1,
        upsideDown: true,
      });
      upper.forEach((view, index) => {
        const opposite = lower[index].camera;
        expect(opposite.position.x).toBeCloseTo(view.camera.position.x);
        const axis = (camera: typeof opposite, x: number, y: number) =>
          new Vector3(x, y, 0).applyQuaternion(camera.quaternion);
        expect(axis(view.camera, 1, 0).dot(axis(opposite, 1, 0))).toBeCloseTo(
          1
        );
        expect(axis(view.camera, 0, 1).dot(axis(opposite, 0, 1))).toBeCloseTo(
          -1
        );
        expect(forward(view.camera).dot(forward(opposite))).toBeCloseTo(-1);
        expect(opposite.matrixWorld.determinant()).toBeCloseTo(1);
      });
    }
  );

  it("orders an opposite-facing open strip continuously in screen space", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 0, 0), new Vector3(100, 0, 0)],
      closed: false,
      count: 2,
      height: 30,
      offset: 10,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: -1,
      screenOrder: true,
    });
    expect(views.map((view) => view.camera.position.x)).toEqual([75, 25]);
    const right = new Vector3(1, 0, 0).applyQuaternion(
      views[0].camera.quaternion
    );
    expect(right.x).toBeCloseTo(-1);
  });
});

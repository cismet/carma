import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createSpineCameraRig, sampleSpine } from "./spine-camera-rig";
import { forward } from "./camera-rig.test-support";

describe("spine camera rig", () => {
  it("fits a whole facade and roof window including vertical padding", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 155, 0), new Vector3(12, 162, 0)],
      closed: false,
      count: 3,
      height: 8,
      offset: 5,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0,
      side: 1,
      verticalRange: [154, 225],
      verticalPadding: 5,
    });
    for (const { camera } of views) {
      expect(camera.position.y).toBe(189.5);
      expect((camera as OrthographicCamera).top).toBe(40.5);
      for (const elevation of [154, 225]) {
        const projected = new Vector3(camera.position.x, elevation, 0).project(
          camera
        );
        expect(Math.abs(projected.y)).toBeLessThan(1);
      }
    }
  });

  it.each([undefined, 145])(
    "keeps one wall baseline despite varying source heights (override %s)",
    (baselineElevation) => {
      const views = createSpineCameraRig({
        points: [new Vector3(0, 100, 0), new Vector3(12, 160, 0)],
        closed: false,
        count: 3,
        height: 70,
        offset: 5,
        near: 0.1,
        far: 100,
        clipBeforeSurface: 0,
        side: 1,
        verticalPadding: 5,
        baselineElevation,
      });
      expect(views.map(({ camera }) => camera.position.y)).toEqual([
        baselineElevation ?? 100,
        baselineElevation ?? 100,
        baselineElevation ?? 100,
      ]);
      for (const view of views) {
        const projected = new Vector3(
          view.camera.position.x,
          baselineElevation ?? 100,
          0
        ).project(view.camera);
        expect(projected.y).toBeCloseTo(0);
        expect(forward(view.camera).y).toBeCloseTo(0);
      }
      expect(
        views.every(({ camera }) => (camera as OrthographicCamera).top === 40)
      ).toBe(true);
    }
  );

  it("covers a straight open spine without seam gaps", () => {
    const views = createSpineCameraRig({
      points: [new Vector3(0, 2, 0), new Vector3(12, 2, 0)],
      closed: false,
      count: 3,
      height: 8,
      offset: 5,
      near: 0.1,
      far: 100,
      clipBeforeSurface: 0.25,
      side: 1,
    });
    expect(views.map(({ distance }) => distance)).toEqual([5, 5, 5]);
    expect(
      views.map(({ camera }) => [
        (camera as OrthographicCamera).left,
        (camera as OrthographicCamera).right,
      ])
    ).toEqual([
      [-2, 2],
      [-2, 2],
      [-2, 2],
    ]);
    expect(views.map(({ camera }) => camera.position.x)).toEqual([2, 6, 10]);
    expect(views[0].camera.position.z).toBe(5);
    expect(forward(views[0].camera).z).toBe(-1);
  });

  it("wraps closed sampling and ignores coincident adjacent points", () => {
    const points = [
      new Vector3(0, 0, 0),
      new Vector3(4, 0, 0),
      new Vector3(4, 0, 0),
      new Vector3(4, 0, 4),
    ];
    const totalLength = sampleSpine(points, true, 0).totalLength;
    expect(sampleSpine(points, true, totalLength).position).toEqual(
      sampleSpine(points, true, 0).position
    );
    expect(sampleSpine(points, true, -1).position).toEqual(
      sampleSpine(points, true, totalLength - 1).position
    );
    expect(sampleSpine(points, false, 100).position).toEqual(
      new Vector3(4, 0, 4)
    );
  });

  it("places clipping positive behind the surface and negative at the camera", () => {
    const [view] = createSpineCameraRig({
      points: [new Vector3(0, 0, 0), new Vector3(10, 0, 0)],
      closed: false,
      count: 1,
      height: 4,
      offset: 3,
      near: 0.1,
      far: 20,
      clipBeforeSurface: 0.5,
      side: 1,
    });
    const plane = view.clipPlanes[0];
    expect(plane.distanceToPoint(new Vector3(5, 0, -1))).toBeGreaterThan(0);
    expect(plane.distanceToPoint(view.camera.position)).toBeLessThan(0);
  });

  it("supports either spine side and adjustable counts", () => {
    const options = {
      points: [new Vector3(), new Vector3(8, 0, 0)],
      closed: false,
      count: 4,
      height: 4,
      offset: 2,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0.1,
    } as const;
    const left = createSpineCameraRig({ ...options, side: 1 });
    const right = createSpineCameraRig({ ...options, side: -1 });
    expect(left).toHaveLength(4);
    expect(left[0].camera.position.z).toBe(2);
    expect(right[0].camera.position.z).toBe(-2);
    expect(new Set(left.map(({ id }) => id)).size).toBe(4);
  });

  it("allocates whole strips within facade edges", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(9, 0, 0),
        new Vector3(9, 0, 3),
      ],
      closed: false,
      count: 4,
      height: 4,
      offset: 2,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0,
      side: 1,
    });
    expect(views).toHaveLength(4);
    expect(views.map(({ stripWidthMeters }) => stripWidthMeters)).toEqual([
      3, 3, 3, 3,
    ]);
    expect(
      views.slice(0, 3).every(({ camera }) => camera.position.z === 2)
    ).toBe(true);
    expect(views[3].camera.position.x).toBe(7);
    expect(
      views[3].clipPlanes[0].distanceToPoint(views[3].camera.position)
    ).toBeLessThan(0);
  });

  it("raises the actual count so every nondegenerate edge has a strip", () => {
    const views = createSpineCameraRig({
      points: [
        new Vector3(0, 0, 0),
        new Vector3(2, 0, 0),
        new Vector3(2, 0, 2),
        new Vector3(4, 0, 2),
      ],
      closed: false,
      count: 1,
      height: 2,
      offset: 1,
      near: 0.1,
      far: 10,
      clipBeforeSurface: 0,
      side: -1,
    });
    expect(views).toHaveLength(3);
  });
});

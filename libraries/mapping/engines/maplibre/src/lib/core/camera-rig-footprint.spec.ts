import { OrthographicCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { createSpineCameraRig } from "./spine-camera-rig";
import { forward } from "./camera-rig.test-support";

describe("camera rig footprint", () => {
  const square = [
    new Vector3(0, 0, 0),
    new Vector3(10, 0, 0),
    new Vector3(10, 0, 10),
    new Vector3(0, 0, 10),
  ];

  const footprintRig = (points = square, count = 16, clearance = 3) =>
    createSpineCameraRig({
      points,
      closed: true,
      count,
      height: 20,
      offset: 20,
      near: 0.1,
      far: 300,
      clipBeforeSurface: 0,
      side: 1,
      closedFootprint: { clearance, backPadding: 3 },
    });

  it.each([false, true])(
    "offsets every hull edge outward for reversed=%s",
    (reverse) => {
      const views = footprintRig(
        reverse ? [...square].reverse() : square,
        16,
        2
      );
      for (const view of views) {
        // Clipping/image plane is at least 2 m outside every original point.
        expect(
          Math.min(
            ...square.map((point) => view.clipPlanes[0].distanceToPoint(point))
          )
        ).toBeCloseTo(2);
        expect(
          view.clipPlanes[0].distanceToPoint(view.camera.position)
        ).toBeCloseTo(-20);
        expect(view.camera.far).toBeCloseTo(20 + 2 + 10 + 3);
      }
      for (const point of square) {
        expect(
          views.some(({ camera }) => {
            const ndc = point.clone().project(camera);
            return (
              Math.abs(ndc.x) <= 1 + 1e-8 &&
              Math.abs(ndc.y) <= 1 &&
              Math.abs(ndc.z) <= 1
            );
          })
        ).toBe(true);
      }
    }
  );

  it("keeps the buffered outline closed at adjacent camera-strip seams", () => {
    const views = footprintRig();
    const edgePoint = (index: number, right: boolean) => {
      const { camera, distance } = views[index];
      const ortho = camera as OrthographicCamera;
      return new Vector3(
        right ? ortho.right : ortho.left,
        0,
        -distance
      ).applyMatrix4(camera.matrixWorld);
    };
    for (let index = 0; index < views.length; index++) {
      expect(
        edgePoint(index, true).distanceTo(
          edgePoint((index + 1) % views.length, false)
        )
      ).toBeLessThan(1e-8);
    }
  });

  it("normalizes closed and consecutive duplicate vertices and accepts collinear edges", () => {
    const points = [
      square[0],
      square[0],
      new Vector3(5, 0, 0),
      ...square.slice(1),
      square[0],
    ];
    const views = footprintRig(points);
    expect(views).toHaveLength(16);
    expect(
      views.every(
        ({ camera }) => Number.isFinite(camera.far) && camera.far <= 36
      )
    ).toBe(true);
    expect(
      footprintRig(square)
        .map((view) => view.camera.far)
        .sort()
    ).toEqual(
      footprintRig([...square].reverse())
        .map((view) => view.camera.far)
        .sort()
    );
  });

  it("fits far from clipped edge intersections, not only vertices inside the strip", () => {
    const triangle = [
      new Vector3(0, 0, 0),
      new Vector3(10, 0, 0),
      new Vector3(5, 0, 10),
    ];
    const views = footprintRig(triangle, 40);
    const selected = views.find(({ camera }) => {
      const width = (camera as OrthographicCamera).right;
      return (
        forward(camera).z > 0.99 &&
        camera.position.x - width > 0 &&
        camera.position.x + width < 5
      );
    })!;
    expect(selected).toBeDefined();
    const camera = selected.camera as OrthographicCamera;
    const deepestX = camera.position.x + camera.right;
    expect(camera.far).toBeCloseTo(20 + 3 + deepestX * 2 + 3);
    expect(camera.far).toBeLessThan(36);
  });

  it("bounds margin-only strips instead of loading distant neighbours", () => {
    const views = footprintRig(square, 64);
    const empty = views.filter(({ camera }) => camera.far < 30);
    expect(empty.length).toBeGreaterThan(0);
    for (const { camera } of empty) expect(camera.far).toBeCloseTo(26);
  });

  it("rejects insufficient clearance and non-convex or degenerate footprints", () => {
    expect(() => footprintRig(square, 4, 1.99)).toThrow("at least 2 m");
    expect(() =>
      footprintRig([new Vector3(), new Vector3(1, 0, 0), new Vector3(2, 0, 0)])
    ).toThrow("zero area");
    expect(() =>
      footprintRig([
        ...square.slice(0, 2),
        new Vector3(2, 0, 2),
        ...square.slice(2),
      ])
    ).toThrow("convex");
  });
});

import { describe, expect, it } from "vitest";
import {
  Box3,
  Frustum,
  Matrix4,
  OrthographicCamera,
  PerspectiveCamera,
  Vector3,
} from "three";
import {
  createTileCameraDemand,
  snapshotTileCameraViews,
} from "../tile-camera-demand";
import { intersectTileFrustumPlanes } from "./tile-frustum-cuts";

const cameraRelations = (camera: PerspectiveCamera | OrthographicCamera) => {
  camera.updateMatrixWorld();
  const demand = createTileCameraDemand(
    snapshotTileCameraViews([
      {
        id: "observer",
        camera,
        viewport: [800, 600],
        errorTargetPixels: 6,
        role: "receiver",
      },
    ])
  );
  const frustum = new Frustum().setFromProjectionMatrix(
    camera.projectionMatrix.clone().multiply(camera.matrixWorldInverse)
  );
  return { demand, frustum };
};

describe("3D tile surface cuts and request geometry", () => {
  it.each([
    ["inside", [-0.1, -0.1, -3], [0.1, 0.1, -2], true],
    ["outside", [20, 20, -3], [21, 21, -2], false],
    ["crossing near only", [-0.1, -0.1, -1.1], [0.1, 0.1, -0.9], true],
    ["crossing far only", [-0.1, -0.1, -11], [0.1, 0.1, -9], true],
    ["behind the eye", [-1, -1, 1], [1, 1, 2], false],
    ["beyond far", [-1, -1, -20], [1, 1, -15], false],
    [
      "containing the entire frustum",
      [-100, -100, -100],
      [100, 100, 100],
      true,
    ],
  ] as const)(
    "does not invent tile outlines for %s",
    (_name, min, max, required) => {
      const { demand, frustum } = cameraRelations(
        new PerspectiveCamera(60, 1, 1, 10)
      );
      const bounds = new Box3(new Vector3(...min), new Vector3(...max));
      expect(demand.evaluate(bounds, 1).required).toBe(required);
      expect(intersectTileFrustumPlanes(bounds, frustum)).toHaveLength(0);
    }
  );

  it("keeps every cut on a tile face and a frustum plane, inside all other planes", () => {
    const { demand, frustum } = cameraRelations(
      new PerspectiveCamera(60, 1, 1, 10)
    );
    const box = new Box3(new Vector3(1, -0.5, -4), new Vector3(3, 0.5, -2));
    const cuts = intersectTileFrustumPlanes(box, frustum);
    expect(demand.evaluate(box, 1).required).toBe(true);
    expect(cuts.length).toBeGreaterThan(0);
    for (const cut of cuts)
      for (const point of [cut.start, cut.getCenter(new Vector3()), cut.end]) {
        expect(
          frustum.planes.every((plane) => plane.distanceToPoint(point) >= -1e-6)
        ).toBe(true);
        expect(
          frustum.planes.some(
            (plane) => Math.abs(plane.distanceToPoint(point)) < 1e-6
          )
        ).toBe(true);
        expect(
          (["x", "y", "z"] as const).some(
            (axis) =>
              Math.min(
                Math.abs(point[axis] - box.min[axis]),
                Math.abs(point[axis] - box.max[axis])
              ) < 1e-6
          )
        ).toBe(true);
      }
  });

  it.each([1.5, 0.9])(
    "uses the same oriented box for demand and cuts at offset %s",
    (offset) => {
      const { demand, frustum } = cameraRelations(
        new OrthographicCamera(-1, 1, 1, -1, 1, 10)
      );
      const bounds = new Box3(
        new Vector3(-3, -0.05, -0.05),
        new Vector3(3, 0.05, 0.05)
      );
      const transform = new Matrix4()
        .makeRotationZ(-Math.PI / 4)
        .setPosition(offset, offset, -5);
      expect(
        frustum.intersectsBox(bounds.clone().applyMatrix4(transform))
      ).toBe(true);
      const required = offset < 1;
      expect(
        demand.evaluate(bounds, 1, undefined, false, transform).required
      ).toBe(required);
      expect(
        intersectTileFrustumPlanes(bounds, frustum, transform).length > 0
      ).toBe(required);
      expect(
        demand.intersectionVertices(bounds, "observer", transform).length > 0
      ).toBe(required);
    }
  );
});

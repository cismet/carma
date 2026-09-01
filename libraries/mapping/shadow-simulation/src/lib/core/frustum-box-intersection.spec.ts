import { Box3, PerspectiveCamera, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { getFrustumBoxIntersectionPoints } from "./frustum-box-intersection";

const buildCamera = () => {
  const camera = new PerspectiveCamera(60, 1, 1, 20);
  camera.position.set(0, 0, 5);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

describe("getFrustumBoxIntersectionPoints", () => {
  it("returns the clipped volume vertices for an intersecting tile box", () => {
    const camera = buildCamera();
    const box = new Box3(
      new Vector3(-10, -0.5, -0.5),
      new Vector3(10, 0.5, 0.5)
    );

    const points = getFrustumBoxIntersectionPoints(camera, box);

    expect(points.length).toBeGreaterThan(0);
    expect(points.every((point) => box.containsPoint(point))).toBe(true);
    expect(Math.max(...points.map(({ x }) => Math.abs(x)))).toBeLessThan(10);
  });

  it("returns the frustum vertices when a tile volume contains the view", () => {
    const camera = buildCamera();
    const box = new Box3(
      new Vector3(-100, -100, -100),
      new Vector3(100, 100, 100)
    );

    const points = getFrustumBoxIntersectionPoints(camera, box);

    expect(points).toHaveLength(8);
  });

  it("returns no points for a tile outside the view frustum", () => {
    const points = getFrustumBoxIntersectionPoints(
      buildCamera(),
      new Box3(new Vector3(100, 100, 100), new Vector3(101, 101, 101))
    );

    expect(points).toEqual([]);
  });
});

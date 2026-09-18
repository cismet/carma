import { Box3, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { createCylinderCameraRig } from "./multi-camera-rig";
import {
  TILE_CAMERA_ROLE,
  createTileCameraDemand,
  snapshotTileCameraViews,
} from "./tile-camera-demand";

const demandFrom = (ids?: ReadonlySet<string>) => {
  const rig = createCylinderCameraRig({
    center: new Vector3(),
    radius: 10,
    height: 10,
    count: 64,
    mode: "panorama",
    aspect: 1,
    near: 0.1,
    far: 100,
  });
  return createTileCameraDemand(
    snapshotTileCameraViews(
      rig
        .filter(({ id }) => !ids || ids.has(id))
        .map(({ id, camera }) => ({
          id,
          camera,
          viewport: [256, 256] as const,
          errorTargetPixels: 2,
          role: TILE_CAMERA_ROLE.GEOMETRY,
        }))
    )
  );
};

describe("multi camera rig demand", () => {
  it("compiles 64 observers and demands geometry just outside the rig", () => {
    const demand = demandFrom();
    const bounds = new Box3(
      new Vector3(11.9, -0.1, -0.1),
      new Vector3(12.1, 0.1, 0.1)
    );
    expect(demand.views).toHaveLength(64);
    expect(demand.evaluate(bounds, 1)).toMatchObject({
      required: true,
      receiver: false,
    });
  });

  it("retains another observer when the matching observer is removed", () => {
    const bounds = new Box3(
      new Vector3(-0.1, -0.1, 11.9),
      new Vector3(0.1, 0.1, 12.1)
    );
    const retained = demandFrom(
      new Set(["cylinder-panorama-15", "cylinder-panorama-16"])
    );
    const removed = demandFrom(new Set(["cylinder-panorama-16"]));
    expect(retained.evaluate(bounds, 1).required).toBe(true);
    expect(removed.evaluate(bounds, 1).required).toBe(true);
  });
});

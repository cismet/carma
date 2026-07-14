import { describe, expect, it, vi } from "vitest";

import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

import { registerCesiumScenePickExclusionResolver } from "./CesiumScenePickingHost";
import { isPointOccluded } from "./Occlusion";

describe("isPointOccluded", () => {
  it("uses an exclusion-aware ray pick instead of helper depth", () => {
    const helper = { show: true };
    const pickPosition = vi.fn(() => new Cartesian3(10, 0, 0));
    const scene = {
      canvas: {
        clientWidth: 800,
        clientHeight: 600,
      },
      drawingBufferWidth: 800,
      drawingBufferHeight: 600,
      isDestroyed: () => false,
      camera: {
        position: Cartesian3.ZERO,
        getPickRay: () => ({}),
      },
      pickPosition,
      pickFromRay: () => ({ position: new Cartesian3(120, 0, 0) }),
    } as unknown as Scene;
    const unregister = registerCesiumScenePickExclusionResolver(scene, () => [
      helper,
    ]);

    expect(
      isPointOccluded(
        scene,
        new Cartesian3(100, 0, 0),
        new Cartesian2(400, 300)
      )
    ).toBe(false);
    expect(pickPosition).not.toHaveBeenCalled();
    expect(helper.show).toBe(true);

    unregister();
  });
});

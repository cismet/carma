import { describe, expect, it, vi } from "vitest";
import { Cartesian2, Cartesian3, type Scene } from "@carma-cesium";

vi.mock("@carma-commons/utils", () => ({
  warnOnce: vi.fn(),
}));

import { resolvePreferredSurfacePick } from "./SurfacePicking";
import { registerCesiumScenePickExclusionResolver } from "./CesiumScenePickingHost";

type FakeScene = Scene & {
  frameState: {
    frameNumber: number;
  };
  pickPositionSupported: boolean;
  pickPosition: ReturnType<typeof vi.fn>;
  pickFromRay: ReturnType<typeof vi.fn>;
  camera: {
    getPickRay: ReturnType<typeof vi.fn>;
  };
  globe: {
    pick: ReturnType<typeof vi.fn>;
  };
};

const createFakeScene = (): FakeScene =>
  ({
    frameState: {
      frameNumber: 1,
    },
    pickPositionSupported: true,
    pickPosition: vi.fn(),
    pickFromRay: vi.fn(),
    camera: {
      getPickRay: vi.fn(() => ({ ray: true })),
    },
    globe: {
      pick: vi.fn(),
    },
  } as unknown as FakeScene);

describe("resolvePreferredSurfacePick", () => {
  it("prefers depth-buffer picks from scene.pickPosition", () => {
    const scene = createFakeScene();
    const screenPosition = new Cartesian2(10, 20);
    const depthPick = new Cartesian3(1, 2, 3);
    scene.pickPosition.mockReturnValue(depthPick);

    const resolvedPick = resolvePreferredSurfacePick(scene, screenPosition, {
      resolveGlobePosition: false,
    });

    expect(scene.pickPosition).toHaveBeenCalledWith(screenPosition);
    expect(resolvedPick.surfacePositionECEF).toBe(depthPick);
    expect(resolvedPick.globePositionECEF).toBeNull();
  });

  it("falls back to globe picking when the depth buffer misses", () => {
    const scene = createFakeScene();
    const screenPosition = new Cartesian2(10, 20);
    const globePick = new Cartesian3(7, 8, 9);
    scene.pickPosition.mockReturnValue(null);
    scene.globe.pick.mockReturnValue(globePick);

    const resolvedPick = resolvePreferredSurfacePick(scene, screenPosition);

    expect(scene.pickPosition).toHaveBeenCalledWith(screenPosition);
    expect(scene.camera.getPickRay).toHaveBeenCalledWith(screenPosition);
    expect(scene.globe.pick).toHaveBeenCalledWith({ ray: true }, scene);
    expect(resolvedPick.surfacePositionECEF).toBeNull();
    expect(resolvedPick.globePositionECEF).toBe(globePick);
  });

  it("reuses the same per-frame depth pick result for repeated screen queries", () => {
    const scene = createFakeScene();
    const screenPosition = new Cartesian2(10, 20);
    const depthPick = new Cartesian3(1, 2, 3);
    scene.pickPosition.mockReturnValue(depthPick);

    const firstPick = resolvePreferredSurfacePick(scene, screenPosition, {
      resolveGlobePosition: false,
    });
    const secondPick = resolvePreferredSurfacePick(scene, screenPosition, {
      resolveGlobePosition: false,
    });

    expect(scene.pickPosition).toHaveBeenCalledTimes(1);
    expect(firstPick.surfacePositionECEF).toBe(depthPick);
    expect(secondPick.surfacePositionECEF).toBe(depthPick);
  });

  it("ray-picks past registered tool helpers instead of sampling their depth", () => {
    const scene = createFakeScene();
    const screenPosition = new Cartesian2(10, 20);
    const queryDisc = {};
    const underlyingSurface = new Cartesian3(4, 5, 6);
    const unregister = registerCesiumScenePickExclusionResolver(scene, () => [
      queryDisc,
    ]);
    scene.pickFromRay.mockReturnValue({ position: underlyingSurface });

    const resolvedPick = resolvePreferredSurfacePick(scene, screenPosition, {
      resolveGlobePosition: false,
    });

    expect(scene.pickFromRay).toHaveBeenCalledWith({ ray: true }, [queryDisc]);
    expect(scene.pickPosition).not.toHaveBeenCalled();
    expect(resolvedPick.surfacePositionECEF).toBe(underlyingSurface);

    unregister();
  });
});

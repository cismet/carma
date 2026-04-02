import { Cartesian2, type Cartesian3, type Scene } from "@carma-cesium";
import { beforeEach, describe, expect, it, vi } from "vitest";

const corePickingMocks = vi.hoisted(() => ({
  pickGlobePositionAtScreenPosition: vi.fn(),
  getLocalUpDirectionAtPosition: vi.fn(),
}));

vi.mock("@carma-mapping/engines/cesium/core", () => ({
  GUIDE_NORMAL_EPSILON_SQUARED: 1e-8,
  getLocalUpDirectionAtPosition:
    corePickingMocks.getLocalUpDirectionAtPosition,
  pickGlobePositionAtScreenPosition:
    corePickingMocks.pickGlobePositionAtScreenPosition,
}));

import {
  registerCesiumScenePointQueryTileset,
} from "./pointQueryTileset";
import {
  resolvePreferredPointQueryPick,
  samplePreferredPointQuerySurfaceNormal,
} from "./pointQueryPicking";

const createPosition = (x: number, y: number, z: number) =>
  ({ x, y, z } as Cartesian3);

const createFakeScene = (
  screenPositionToPosition: Map<string, Cartesian3 | null>
) => {
  const scene = {
    camera: {
      getPickRay: (screenPosition: Cartesian2) => ({
        key: `${screenPosition.x}:${screenPosition.y}`,
      }),
    },
    frameState: {},
  } as Scene;

  const tileset = {
    isDestroyed: () => false,
    pick: (ray: { key: string }) => screenPositionToPosition.get(ray.key),
  };

  return {
    scene,
    tileset,
  };
};

describe("resolvePreferredPointQueryPick", () => {
  beforeEach(() => {
    corePickingMocks.pickGlobePositionAtScreenPosition.mockReset();
    corePickingMocks.getLocalUpDirectionAtPosition.mockReset();
  });

  it("uses the registered query tileset as the authoritative scene pick", () => {
    const scenePick = createPosition(1, 2, 3);
    const { scene, tileset } = createFakeScene(
      new Map([["10:20", scenePick]])
    );
    const unregister = registerCesiumScenePointQueryTileset(
      scene,
      tileset as never
    );

    try {
      const result = resolvePreferredPointQueryPick(
        scene,
        new Cartesian2(10, 20),
        {
          resolveGlobePosition: false,
        }
      );

      expect(
        corePickingMocks.pickGlobePositionAtScreenPosition
      ).not.toHaveBeenCalled();
      expect(result).toEqual({
        pickedPositionECEF: scenePick,
        scenePositionECEF: scenePick,
        globePositionECEF: null,
      });
    } finally {
      unregister();
    }
  });

  it("returns no authoritative pick when the query tileset is missed", () => {
    const { scene, tileset } = createFakeScene(new Map());
    const unregister = registerCesiumScenePointQueryTileset(
      scene,
      tileset as never
    );

    try {
      const result = resolvePreferredPointQueryPick(
        scene,
        new Cartesian2(30, 40),
        {
          resolveGlobePosition: false,
        }
      );

      expect(result).toEqual({
        pickedPositionECEF: null,
        scenePositionECEF: null,
        globePositionECEF: null,
      });
    } finally {
      unregister();
    }
  });

  it("keeps globe picks auxiliary even when no query-tileset hit exists", () => {
    const globePick = createPosition(4, 5, 6);
    const { scene, tileset } = createFakeScene(new Map());
    corePickingMocks.pickGlobePositionAtScreenPosition.mockReturnValue(
      globePick
    );
    const unregister = registerCesiumScenePointQueryTileset(
      scene,
      tileset as never
    );

    try {
      const result = resolvePreferredPointQueryPick(
        scene,
        new Cartesian2(50, 60)
      );

      expect(result).toEqual({
        pickedPositionECEF: null,
        scenePositionECEF: null,
        globePositionECEF: globePick,
      });
    } finally {
      unregister();
    }
  });
});

describe("samplePreferredPointQuerySurfaceNormal", () => {
  beforeEach(() => {
    corePickingMocks.pickGlobePositionAtScreenPosition.mockReset();
    corePickingMocks.getLocalUpDirectionAtPosition.mockReset();
  });

  it("derives a stable normal from the query tileset using partial neighbor samples", () => {
    const centerPosition = createPosition(0, 0, 0);
    const rightPosition = createPosition(1, 0, 0);
    const upPosition = createPosition(0, -1, 0);
    const localUp = createPosition(0, 0, 1);
    const { scene, tileset } = createFakeScene(
      new Map([
        ["100:100", centerPosition],
        ["102:100", rightPosition],
        ["100:98", upPosition],
      ])
    );
    corePickingMocks.getLocalUpDirectionAtPosition.mockReturnValue(localUp);
    const unregister = registerCesiumScenePointQueryTileset(
      scene,
      tileset as never
    );

    try {
      const sampledNormal = samplePreferredPointQuerySurfaceNormal(
        scene,
        new Cartesian2(100, 100),
        centerPosition
      );

      expect(sampledNormal).toEqual(localUp);
    } finally {
      unregister();
    }
  });

  it("reuses the previous normal when tileset neighbors are unavailable", () => {
    const centerPosition = createPosition(0, 0, 0);
    const previousNormal = createPosition(0, 1, 0);
    const fallbackUp = createPosition(0, 0, 1);
    const { scene, tileset } = createFakeScene(
      new Map([["100:100", centerPosition]])
    );
    corePickingMocks.getLocalUpDirectionAtPosition.mockReturnValue(fallbackUp);
    const unregister = registerCesiumScenePointQueryTileset(
      scene,
      tileset as never
    );

    try {
      const sampledNormal = samplePreferredPointQuerySurfaceNormal(
        scene,
        new Cartesian2(100, 100),
        centerPosition,
        {
          previousSurfaceNormalECEF: previousNormal,
        }
      );

      expect(sampledNormal).toEqual(previousNormal);
    } finally {
      unregister();
    }
  });
});

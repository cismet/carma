import { describe, expect, it, vi } from "vitest";

import type { ImageryLayer, Scene } from "@carma-cesium";

import type { CesiumContextType } from "../CesiumContext";
import type { SceneStyle } from "../index.d";
import {
  classifyCesiumSceneStyleChange,
  diffCesiumSceneStyles,
  setupSceneStyle,
} from "./sceneStyles";

type FakeLayerCollection = {
  contains: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  raiseToTop: ReturnType<typeof vi.fn>;
};

const createScene = (options: { containsLayer?: boolean } = {}) => {
  let containsLayer = options.containsLayer ?? false;
  const calls: string[] = [];
  const layers: FakeLayerCollection = {
    contains: vi.fn(() => containsLayer),
    add: vi.fn((layer: ImageryLayer) => {
      calls.push(`add:${String(layer.show)}`);
      containsLayer = true;
    }),
    remove: vi.fn((_layer: ImageryLayer, destroy?: boolean) => {
      calls.push(`remove:${String(destroy)}`);
      containsLayer = false;
    }),
    raiseToTop: vi.fn(() => calls.push("raiseToTop")),
  };
  const scene = {
    imageryLayers: layers,
    globe: {
      baseColor: undefined,
      depthTestAgainstTerrain: false,
      enableLighting: false,
      translucency: {
        enabled: false,
        frontFaceAlpha: 1,
        backFaceAlpha: 1,
      },
    },
    requestRender: vi.fn(() => calls.push("requestRender")),
    terrainProvider: { id: "terrain" },
  } as unknown as Scene;

  return { scene, layers, calls };
};

const createImageryLayer = () =>
  ({
    show: false,
    alpha: 0,
    imageryProvider: {},
  } as unknown as ImageryLayer);

describe("diffCesiumSceneStyles", () => {
  it("reports direct scene and globe live property changes", () => {
    const previous: SceneStyle = {
      live: {
        scene: { backgroundColor: [1, 1, 1, 1] },
        globe: {
          baseColor: [1, 1, 1, 1],
          translucency: { enabled: false, frontFaceAlpha: 1 },
        },
      },
    };
    const next: SceneStyle = {
      live: {
        scene: { backgroundColor: [0, 0, 0, 1] },
        globe: {
          baseColor: [0, 0, 0, 1],
          translucency: { enabled: true, frontFaceAlpha: 0.5 },
        },
      },
    };

    const diff = diffCesiumSceneStyles(previous, next);

    expect(diff.mode).toBe("live");
    expect(diff.changes.map(({ path }) => path)).toEqual([
      "live.scene.backgroundColor",
      "live.globe.baseColor",
      "live.globe.translucency.enabled",
      "live.globe.translucency.frontFaceAlpha",
    ]);
  });

  it("classifies resource reload when effective terrain or tileset init signatures change", () => {
    const previous: SceneStyle = {
      members: {
        terrainProviderId: "terrain-2020",
        tilesets: [{ id: "lod2" }],
      },
    };
    const next: SceneStyle = {
      members: {
        terrainProviderId: "terrain-2024",
        tilesets: [{ id: "mesh" }],
      },
    };

    const diff = diffCesiumSceneStyles(previous, next, {
      terrainProviders: {
        "terrain-2020": "terrain:url-a",
        "terrain-2024": "terrain:url-b",
      },
      tilesets: {
        lod2: "tileset:url-a",
        mesh: "tileset:url-b",
      },
    });

    expect(diff.mode).toBe("resource-reload");
    expect(diff.reasons).toEqual([
      "terrain provider init options changed",
      "tileset init options changed",
    ]);
    expect(
      classifyCesiumSceneStyleChange(previous, next, {
        terrainProviders: {
          "terrain-2020": "terrain:url-a",
          "terrain-2024": "terrain:url-b",
        },
        tilesets: {
          lod2: "tileset:url-a",
          mesh: "tileset:url-b",
        },
      })
    ).toEqual({
      mode: "resource-reload",
      reasons: [
        "terrain provider init options changed",
        "tileset init options changed",
      ],
    });
  });

  it("keeps equivalent resource ids in the live lane when init signatures match", () => {
    const previous: SceneStyle = {
      members: {
        terrainProviderId: "terrain-a",
        tilesets: [{ id: "tileset-a" }],
      },
    };
    const next: SceneStyle = {
      members: {
        terrainProviderId: "terrain-b",
        tilesets: [{ id: "tileset-b" }],
      },
    };

    const diff = diffCesiumSceneStyles(previous, next, {
      terrainProviders: {
        "terrain-a": "same-terrain-init",
        "terrain-b": "same-terrain-init",
      },
      tilesets: {
        "tileset-a": "same-tileset-init",
        "tileset-b": "same-tileset-init",
      },
    });

    expect(diff.mode).toBe("live");
    expect(diff.reasons).toEqual([
      "terrain provider id changed without init option change",
      "tileset member ids changed without init option change",
    ]);
  });

  it("reports live member property changes per imagery layer and tileset", () => {
    const previous: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 1 }],
        tilesets: [{ id: "lod2" }],
      },
    };
    const next: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 0.5 }],
        tilesets: [
          {
            id: "lod2",
            appearance: {
              type: "cesium-3d-tile-style",
              style: { color: "color('red')" },
            },
          },
        ],
      },
    };

    const diff = diffCesiumSceneStyles(previous, next, {
      tilesets: { lod2: "lod2-init" },
    });

    expect(diff.mode).toBe("live");
    expect(diff.changes.map(({ path }) => path)).toEqual([
      "members.imageryLayers.basemap.opacity",
      "members.tilesets.lod2.appearance",
    ]);
  });
});

describe("setupSceneStyle imagery layer visibility", () => {
  it("adds an active imagery layer visible before raising it", () => {
    const { scene, calls } = createScene({ containsLayer: false });
    const imageryLayer = createImageryLayer();
    const terrainProvider = scene.terrainProvider;
    const ctx = {
      withScene: <T>(cb: (scene: Scene) => T) => cb(scene),
      withImageryLayerById: <T>(
        _id: string,
        cb: (imageryLayer: ImageryLayer, scene: Scene) => T
      ) => cb(imageryLayer, scene),
      getTerrainProviderById: () => terrainProvider,
      getTerrainProviderInitSignatureById: () => "terrain-init",
      requestRender: vi.fn(),
    } as unknown as CesiumContextType;
    const previous: SceneStyle = {
      members: {
        tilesets: [{ id: "mesh" }],
      },
    };
    const next: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 1 }],
        tilesets: [{ id: "lod2" }],
      },
    };

    setupSceneStyle(ctx, next, previous);

    expect(imageryLayer.show).toBe(true);
    expect(imageryLayer.alpha).toBe(1);
    expect(calls).toContain("add:true");
    expect(calls).toContain("raiseToTop");
  });

  it("removes inactive imagery layers from the collection without destroying them", () => {
    const { scene, layers } = createScene({ containsLayer: true });
    const imageryLayer = createImageryLayer();
    imageryLayer.show = true;
    imageryLayer.alpha = 1;
    const terrainProvider = scene.terrainProvider;
    const ctx = {
      withScene: <T>(cb: (scene: Scene) => T) => cb(scene),
      withImageryLayerById: <T>(
        _id: string,
        cb: (imageryLayer: ImageryLayer, scene: Scene) => T
      ) => cb(imageryLayer, scene),
      getTerrainProviderById: () => terrainProvider,
      getTerrainProviderInitSignatureById: () => "terrain-init",
      requestRender: vi.fn(),
    } as unknown as CesiumContextType;
    const lod2: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 1 }],
      },
    };
    const mesh: SceneStyle = {
      members: {
        tilesets: [{ id: "mesh" }],
      },
    };

    setupSceneStyle(ctx, mesh, lod2);

    expect(layers.remove).toHaveBeenCalledWith(imageryLayer, false);
    expect(layers.add).not.toHaveBeenCalled();
    expect(imageryLayer.show).toBe(false);
    expect(imageryLayer.alpha).toBe(1);

    setupSceneStyle(ctx, lod2, mesh);

    expect(layers.add).toHaveBeenCalledWith(imageryLayer);
    expect(imageryLayer.show).toBe(true);
    expect(imageryLayer.alpha).toBe(1);
  });

  it("leaves missing inactive imagery layers outside the collection so Cesium does not fetch them", () => {
    const { scene, calls, layers } = createScene({ containsLayer: false });
    const imageryLayer = createImageryLayer();
    imageryLayer.show = true;
    imageryLayer.alpha = 1;
    const terrainProvider = scene.terrainProvider;
    const ctx = {
      withScene: <T>(cb: (scene: Scene) => T) => cb(scene),
      withImageryLayerById: <T>(
        _id: string,
        cb: (imageryLayer: ImageryLayer, scene: Scene) => T
      ) => cb(imageryLayer, scene),
      getTerrainProviderById: () => terrainProvider,
      getTerrainProviderInitSignatureById: () => "terrain-init",
      requestRender: vi.fn(),
    } as unknown as CesiumContextType;
    const lod2: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 1 }],
      },
    };
    const mesh: SceneStyle = {
      members: {
        tilesets: [{ id: "mesh" }],
      },
    };

    setupSceneStyle(ctx, mesh, lod2);

    expect(layers.remove).not.toHaveBeenCalled();
    expect(layers.add).not.toHaveBeenCalled();
    expect(calls).not.toContain("add:false");
    expect(imageryLayer.show).toBe(false);
    expect(imageryLayer.alpha).toBe(1);
  });

  it("re-adds a legacy hidden-in-collection imagery layer visible to trigger Cesium layerAdded", () => {
    const { scene, calls, layers } = createScene({ containsLayer: true });
    const imageryLayer = createImageryLayer();
    imageryLayer.show = false;
    imageryLayer.alpha = 1;
    const terrainProvider = scene.terrainProvider;
    const ctx = {
      withScene: <T>(cb: (scene: Scene) => T) => cb(scene),
      withImageryLayerById: <T>(
        _id: string,
        cb: (imageryLayer: ImageryLayer, scene: Scene) => T
      ) => cb(imageryLayer, scene),
      getTerrainProviderById: () => terrainProvider,
      getTerrainProviderInitSignatureById: () => "terrain-init",
      requestRender: vi.fn(),
    } as unknown as CesiumContextType;
    const lod2: SceneStyle = {
      members: {
        imageryLayers: [{ id: "basemap", opacity: 1 }],
      },
    };
    const mesh: SceneStyle = {
      members: {
        tilesets: [{ id: "mesh" }],
      },
    };

    setupSceneStyle(ctx, lod2, mesh);

    expect(layers.remove).toHaveBeenCalledWith(imageryLayer, false);
    expect(calls).toContain("add:true");
    expect(imageryLayer.show).toBe(true);
    expect(imageryLayer.alpha).toBe(1);
  });
});

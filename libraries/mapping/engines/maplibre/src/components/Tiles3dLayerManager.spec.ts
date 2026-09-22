// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveTiles3dErrorTarget,
  resolveTiles3dConfig,
  Tiles3dLayerManager,
} from "./Tiles3dLayerManager";
import type { Tiles3dConfig } from "./Tiles3dLayerManager";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

// The shipped styles are read at run time on purpose. A static import would
// make this library depend on the geoportal app and the stories playground in
// the Nx project graph, inverting the package layering and closing a
// build cycle. The assertion still compares the real files, not a copy.
const findRepositoryRoot = (start: string): string => {
  let directory = start;
  while (!existsSync(resolve(directory, "nx.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error("repository root not found");
    directory = parent;
  }
  return directory;
};
const repositoryRoot = findRepositoryRoot(process.cwd());
const readShippedStyle = (relativePath: string) =>
  JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8"));
const geoportalMeshStyle = readShippedStyle(
  "apps/geoportal/public/data/mesh2024-cesium-parity.style.json"
);
const storyMeshStyle = readShippedStyle(
  "playgrounds/stories/src/stories/mapping/maplibre/data/mesh2024-cesium-parity.style.json"
);

vi.hoisted(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:vitest-maplibre-worker",
  });
});

const mocks = vi.hoisted(() => ({
  map: {
    style: {},
    _removed: false,
    getCenter: () => ({ lng: 7.15, lat: 51.25 }),
    getTerrain: () => null,
    getSource: () => ({}),
    setTerrain: vi.fn(),
    on: vi.fn(),
    off: vi.fn(),
  },
  buildRuntime: vi.fn(),
  addRuntime: vi.fn(),
  removeRuntime: vi.fn(),
}));

vi.mock("../contexts/LibreContext", () => ({
  useLibreContext: () => ({ map: mocks.map }),
}));
vi.mock("../lib/runtime/integrations/three-tiles-runtime", () => ({
  buildThreeTilesRuntime: mocks.buildRuntime,
}));
vi.mock("../lib/runtime/integrations/shared-three-scene-registry", () => ({
  acquireSharedThreeScene: () => ({
    layer: {
      addRuntime: mocks.addRuntime,
      hasRuntime: () => true,
      removeRuntime: mocks.removeRuntime,
    },
    setLocationLabelColor: vi.fn(),
    release: vi.fn(),
  }),
}));
vi.mock(
  "../lib/runtime/integrations/shared-three-scene-content-registry",
  () => ({
    notifySharedThreeSceneContentChanged: vi.fn(),
    notifySharedThreeSceneRequestStateChanged: vi.fn(),
    registerSharedThreeSceneRuntime: () => () => undefined,
  })
);
vi.mock("../utils/threeDPresence", () => ({
  add3dPresence: vi.fn(),
  remove3dPresence: vi.fn(),
}));

const buildFakeRuntime = (id: string) => ({
  scene: { id },
  appearance: {
    setOpacity: vi.fn(),
    setOutlineVisible: vi.fn(),
    setOutlineStyle: vi.fn(),
  },
  loading: {
    setErrorTarget: vi.fn(),
    setTilesetMinResolution: vi.fn(),
    setCacheBudget: vi.fn(),
  },
});

const baseConfig: Tiles3dConfig = {
  renderMode: "tiles3d",
  tilesetUrl: "https://tiles.test/mesh/tileset.json",
  errorTarget: 4,
  providesTerrain: true,
};

const renderManager = (config: Tiles3dConfig, layerOpacity?: number) =>
  createElement(Tiles3dLayerManager, { config, layerOpacity });

describe("resolveTiles3dErrorTarget", () => {
  it("uses a 4 px target for a regular 3D tiles mesh", () => {
    expect(resolveTiles3dErrorTarget({})).toBe(4);
  });

  it("keeps an explicit style target", () => {
    expect(resolveTiles3dErrorTarget({ errorTarget: 1.25 })).toBe(1.25);
  });
});

describe("resolveTiles3dConfig", () => {
  const legacy: Tiles3dConfig = {
    renderMode: "tiles3d",
    tilesetUrl: "https://tiles.test/mesh/tileset.json",
    terrainMandatory: true,
  };

  it("completes a legacy mesh style with the mesh loading defaults", () => {
    expect(resolveTiles3dConfig({ ...legacy, providesTerrain: true })).toEqual({
      ...legacy,
      providesTerrain: true,
      version: 1,
      errorTarget: 6,
      baseErrorTarget: 16,
      tilesetMinResolutionPx: 1024,
      basemap: "labels",
      outline: true,
      diagnostics: false,
      shadowBuildingStyle: false,
    });
  });

  it("leaves the mesh strategy off for a tileset that provides no terrain", () => {
    const resolved = resolveTiles3dConfig(legacy);
    expect(resolved.baseErrorTarget).toBeUndefined();
    expect(resolved.tilesetMinResolutionPx).toBeUndefined();
    expect(resolved.errorTarget).toBe(4);
  });

  it("keeps explicit values, including the zero that defers to the entry hint", () => {
    const resolved = resolveTiles3dConfig({
      ...legacy,
      version: 1,
      providesTerrain: true,
      errorTarget: 6,
      baseErrorTarget: 12,
      tilesetMinResolutionPx: 0,
      basemap: "none",
      outline: false,
      diagnostics: true,
      shadowBuildingStyle: true,
    });
    expect(resolved).toMatchObject({
      version: 1,
      errorTarget: 6,
      baseErrorTarget: 12,
      tilesetMinResolutionPx: 0,
      basemap: "none",
      outline: false,
      diagnostics: true,
      shadowBuildingStyle: true,
    });
  });
});

describe("Tiles3dLayerManager", () => {
  beforeEach(() => {
    mocks.buildRuntime.mockReset();
    mocks.addRuntime.mockReset();
    mocks.removeRuntime.mockReset();
    mocks.map.setTerrain.mockReset();
    mocks.buildRuntime.mockImplementation((id: string) => buildFakeRuntime(id));
  });
  afterEach(() => {
    cleanup();
  });

  it("preserves the ad-hoc mesh metadata in both hosts and forwards its loading hints", () => {
    expect(storyMeshStyle).toEqual(geoportalMeshStyle);
    const metadata = geoportalMeshStyle.metadata.carmaConf["3d"];
    expect(metadata.entry.levels.length).toBeGreaterThan(0);
    // The reference file declares the tuned base target and leaves the rest
    // to the defaults, so a legacy style and this one share every other value.
    expect(metadata).toMatchObject({ errorTarget: 6, baseErrorTarget: 12 });
    expect(metadata).not.toHaveProperty("tilesetMinResolutionPx");
    // Use the normal draped host to inspect creation synchronously; standalone
    // mounting adds a DEM lookup but must pass the same hierarchy hints.
    render(renderManager({ ...metadata, basemap: "labels" } as Tiles3dConfig));
    expect(mocks.buildRuntime.mock.calls[0]?.[3]).toMatchObject({
      entry: metadata.entry,
      providesTerrain: metadata.providesTerrain,
      baseErrorTargetPixels: metadata.baseErrorTarget,
      colorCorrection: metadata.colorCorrection,
    });
    const runtime = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(6, 12);
    expect(runtime.loading.setTilesetMinResolution).toHaveBeenLastCalledWith(
      1024
    );
  });

  it("forwards independent cold image and handover targets from configuration", () => {
    render(
      renderManager({
        ...baseConfig,
        providesTerrain: true,
        firstImageErrorTarget: 96,
        baseErrorTarget: 24,
        handoverErrorTarget: 8,
        errorTarget: 4,
      })
    );
    expect(mocks.buildRuntime.mock.calls[0]?.[3]).toMatchObject({
      firstImageErrorTargetPixels: 96,
      baseErrorTargetPixels: 24,
      handoverErrorTargetPixels: 8,
    });
    const runtime = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(4, 24);
  });
  it("updates initial and residual targets without replacing the tile pool", () => {
    const { rerender } = render(renderManager(baseConfig));
    const runtime = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;
    // A terrain-providing style without a residual resolution gets the default.
    expect(runtime.loading.setTilesetMinResolution).toHaveBeenLastCalledWith(
      1024
    );
    rerender(
      renderManager({
        ...baseConfig,
        baseErrorTarget: 12,
        tilesetMinResolutionPx: 2048,
      })
    );
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(4, 12);
    expect(runtime.loading.setTilesetMinResolution).toHaveBeenLastCalledWith(
      2048
    );
    rerender(
      renderManager({
        ...baseConfig,
        baseErrorTarget: 16,
        tilesetMinResolutionPx: 4096,
      })
    );
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(4, 16);
    expect(runtime.loading.setTilesetMinResolution).toHaveBeenLastCalledWith(
      4096
    );
    rerender(renderManager({ ...baseConfig, tilesetMinResolutionPx: 0 }));
    expect(runtime.loading.setTilesetMinResolution).toHaveBeenLastCalledWith(
      null
    );
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
  });

  it("applies target, opacity, outline and cache changes through the setters without a rebuild", () => {
    const { rerender } = render(renderManager(baseConfig, 1));
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    const runtime = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;
    // The base target defaults for a terrain-providing tileset.
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(4, 16);
    expect(mocks.addRuntime).toHaveBeenCalledWith(runtime.scene);

    rerender(renderManager({ ...baseConfig, errorTarget: 1 }, 1));
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.loading.setErrorTarget).toHaveBeenLastCalledWith(1, 16);

    rerender(
      renderManager({ ...baseConfig, errorTarget: 1, opacity: 0.5 }, 0.5)
    );
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.appearance.setOpacity).toHaveBeenLastCalledWith(0.25);

    rerender(
      renderManager(
        {
          ...baseConfig,
          errorTarget: 1,
          opacity: 0.5,
          cacheBudgetBytes: 256 * 1024 ** 2,
          cacheOverflowBytes: 64 * 1024 ** 2,
        },
        0.5
      )
    );
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.loading.setCacheBudget).toHaveBeenLastCalledWith(
      256 * 1024 ** 2,
      {
        overflowBytes: 64 * 1024 ** 2,
      }
    );

    rerender(
      renderManager(
        {
          ...baseConfig,
          errorTarget: 1,
          opacity: 0.5,
          outline: false,
          outlineColor: "#ff0000",
          outlineOpacity: 0.3,
        },
        0.5
      )
    );
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.appearance.setOutlineVisible).toHaveBeenLastCalledWith(
      false
    );
    expect(runtime.appearance.setOutlineStyle).toHaveBeenLastCalledWith({
      color: "#ff0000",
      opacity: 0.3,
    });
    expect(mocks.removeRuntime).not.toHaveBeenCalled();
  });

  it("rebuilds the runtime for another tileset or terrain role", () => {
    const { rerender } = render(renderManager(baseConfig));
    const first = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;

    rerender(
      renderManager({
        ...baseConfig,
        tilesetUrl: "https://tiles.test/other/tileset.json",
      })
    );
    expect(mocks.buildRuntime).toHaveBeenCalledTimes(2);
    expect(mocks.removeRuntime).toHaveBeenCalledWith(first.scene.id);

    rerender(
      renderManager({
        ...baseConfig,
        tilesetUrl: "https://tiles.test/other/tileset.json",
        providesTerrain: false,
      })
    );
    expect(mocks.buildRuntime).toHaveBeenCalledTimes(3);
  });

  it("keeps MapLibre terrain active while Three owns the visible ground", () => {
    const { unmount } = render(renderManager(baseConfig));

    expect(mocks.map.setTerrain).toHaveBeenCalledWith({
      source: expect.any(String),
      exaggeration: 1,
    });
    unmount();
    expect(mocks.map.setTerrain).toHaveBeenCalledTimes(1);
  });
});

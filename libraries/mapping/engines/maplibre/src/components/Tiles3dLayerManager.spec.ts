// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  resolveTiles3dErrorTarget,
  Tiles3dLayerManager,
} from "./Tiles3dLayerManager";
import type { Tiles3dConfig } from "./Tiles3dLayerManager";

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
  removeRuntime: vi.fn(),
  releaseMeshComposition: vi.fn(),
}));

vi.mock("../contexts/LibreContext", () => ({
  useLibreContext: () => ({ map: mocks.map }),
}));
vi.mock("../lib/runtime/integrations/three-tiles-runtime", () => ({
  buildThreeTilesRuntime: mocks.buildRuntime,
  TILES_ERROR_TARGET_DEFAULT_PIXELS: 4,
  THREE_TILES_DEFAULT_REQUEST_CONCURRENCY: 64,
}));
vi.mock("../lib/runtime/integrations/shared-three-scene-registry", () => ({
  acquireSharedThreeScene: () => ({
    layer: {
      addRuntime: vi.fn(),
      hasRuntime: () => true,
      removeRuntime: mocks.removeRuntime,
    },
    release: vi.fn(),
  }),
}));
vi.mock("../lib/runtime/integrations/map-style-layer-suppression", () => ({
  acquireMapLibreTerrainMeshComposition: vi.fn(
    () => mocks.releaseMeshComposition
  ),
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
  id,
  setErrorTarget: vi.fn(),
  setOpacity: vi.fn(),
  setOutlineVisible: vi.fn(),
  setOutlineStyle: vi.fn(),
  setCacheBudget: vi.fn(),
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

describe("Tiles3dLayerManager", () => {
  beforeEach(() => {
    mocks.buildRuntime.mockReset();
    mocks.removeRuntime.mockReset();
    mocks.releaseMeshComposition.mockReset();
    mocks.map.setTerrain.mockReset();
    mocks.buildRuntime.mockImplementation((id: string) => buildFakeRuntime(id));
  });
  afterEach(() => {
    cleanup();
  });

  it("applies target, opacity, outline and cache changes through the setters without a rebuild", () => {
    const { rerender } = render(renderManager(baseConfig, 1));
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    const runtime = mocks.buildRuntime.mock.results[0]?.value as ReturnType<
      typeof buildFakeRuntime
    >;
    expect(runtime.setErrorTarget).toHaveBeenLastCalledWith(4);

    rerender(renderManager({ ...baseConfig, errorTarget: 1 }, 1));
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.setErrorTarget).toHaveBeenLastCalledWith(1);

    rerender(
      renderManager({ ...baseConfig, errorTarget: 1, opacity: 0.5 }, 0.5)
    );
    expect(mocks.buildRuntime).toHaveBeenCalledOnce();
    expect(runtime.setOpacity).toHaveBeenLastCalledWith(0.25);

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
    expect(runtime.setCacheBudget).toHaveBeenLastCalledWith(256 * 1024 ** 2, {
      overflowBytes: 64 * 1024 ** 2,
    });

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
    expect(runtime.setOutlineVisible).toHaveBeenLastCalledWith(false);
    expect(runtime.setOutlineStyle).toHaveBeenLastCalledWith({
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
    expect(mocks.removeRuntime).toHaveBeenCalledWith(first.id);

    rerender(
      renderManager({
        ...baseConfig,
        tilesetUrl: "https://tiles.test/other/tileset.json",
        providesTerrain: false,
      })
    );
    expect(mocks.buildRuntime).toHaveBeenCalledTimes(3);
  });

  it("keeps MapLibre terrain active for draped style content over a terrain mesh", () => {
    const { unmount } = render(renderManager(baseConfig));

    expect(mocks.map.setTerrain).toHaveBeenCalledWith({
      source: expect.any(String),
      exaggeration: 1,
    });
    expect(mocks.releaseMeshComposition).not.toHaveBeenCalled();

    unmount();
    expect(mocks.releaseMeshComposition).toHaveBeenCalledOnce();
  });
});

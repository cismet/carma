// @vitest-environment node

import "./shadow-scene.test-mocks";

import * as THREE from "three";
import { SkyMaterial } from "@takram/three-atmosphere";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import {
  acquireSharedThreeScene,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  MAPLIBRE_EVENT,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  isSharedThreeTerrainLoading,
  subscribeSharedThreeTerrainLoading,
  suppressMapLibreRegularStyleLayers,
  type SharedThreeSceneLayer,
  type SharedThreeSceneFrame,
} from "@carma-mapping/engines/maplibre";

import { buildShadowSimulationScene } from "./shadow-scene";
import { configureReceiverPlaneShadow } from "./shadow-receiver-plane-material";
import {
  AtmosphericSunlightEvaluator,
  evaluateAtmosphericSunlight,
} from "./atmospheric-sunlight";
import { ATMOSPHERIC_SKY_NAME } from "./atmospheric-sky";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";
import { SHADOW_BUFFER_LAYOUT, SHADOW_QUALITY } from "../core/shadow-types";
import { ShadowTiledScene } from "./shadow-tiled-scene";
import {
  releaseScene,
  setLocationLabelColor,
  setPointLabelOverlayVisible,
  setMapStyleProjectionVisible,
  scene,
  frameGroup,
  findShadowLights,
  sharedRuntimes,
  accumulationController,
  sharedLayer,
  localFrameAt,
  updateShadows,
  createIdleTerrainHost,
  TEST_TERRAIN_SOURCE,
  type SharedRuntimeFixture,
} from "./shadow-scene.test-support";

describe("shadow scene tiled rendering and debug publication", () => {
  it("switches mono/tiled in situ, keeps fetch coverage and releases the tiled cache", () => {
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "committed-mesh",
        root: new THREE.Group(),
        dispose: vi.fn(),
        getActiveTileVolumes: () => [
          {
            id: "mesh-2024/root/tile-1",
            kind: "tiles3d",
            minimum: [-512, 0, -512],
            maximum: [512, 200, 512],
          },
        ],
      },
    ] as never);
    sharedLayer.projectLngLatToScene = () => new THREE.Vector3();
    const renderer = {
      capabilities: { maxTextureSize: 4096 },
      shadowMap: { type: THREE.PCFShadowMap },
      getContext: () => ({
        getInternalformatParameter: () => new Int32Array([4, 2]),
        getParameter: () => 4096,
      }),
    } as unknown as THREE.WebGLRenderer;
    sharedLayer.getRenderer = () => renderer;
    const map = {
      getCenter: () => ({ lng: 7.15, lat: 51.256 }),
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getLight: () => ({ anchor: "viewport" }),
      isStyleLoaded: () => true,
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const renderTiled = vi
      .spyOn(ShadowTiledScene.prototype, "render")
      .mockReturnValue(true);
    const progressiveResult = {
      progress: 0.5,
      settled: false,
      needsRepaint: true,
    };
    const renderProgressive = vi
      .spyOn(ShadowTiledScene.prototype, "renderProgressive")
      .mockReturnValue(progressiveResult);
    const disposeTiled = vi.spyOn(ShadowTiledScene.prototype, "dispose");
    const controller = buildShadowSimulationScene(map as never);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(0, 150, 300);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    const accumulation = accumulationController!;
    const runtimeCount = sharedRuntimes.size;
    const epoch = accumulation.visualEpoch();
    expect(accumulation.renderScene?.(camera, null)).toBe(false);
    const nativeFrame = {
      width: 1600,
      height: 1200,
      viewKey: "physical-pose",
      styleEpoch: 3,
      active: true,
    };
    expect(
      accumulation.renderProgressive?.(camera, nativeFrame)
    ).toBeUndefined();
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    updateShadows(map, camera);
    expect(accumulation.visualEpoch()).toBeGreaterThan(epoch);
    expect(accumulation.renderScene?.(camera, 7)).toBe(true);
    expect(renderTiled).toHaveBeenLastCalledWith(camera, 7, 64, true);
    const directPasses = renderTiled.mock.calls.length;
    expect(accumulation.renderProgressive?.(camera, nativeFrame)).toBe(
      progressiveResult
    );
    expect(renderProgressive).toHaveBeenLastCalledWith(camera, {
      ...nativeFrame,
      samples: 64,
      maxRenderTargetPixels: Number.POSITIVE_INFINITY,
      options: { format: "rgba16f-32f", msaaSamples: 0 },
    });
    expect(renderTiled).toHaveBeenCalledTimes(directPasses);
    expect(sharedRuntimes.size).toBe(runtimeCount);
    expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(1);
    expect(accumulation.renderScene?.(camera, null)).toBe(true);
    expect(renderTiled).toHaveBeenLastCalledWith(camera, null, 64, true);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    expect(disposeTiled).toHaveBeenCalledOnce();
    updateShadows(map, camera);
    expect(accumulation.renderScene?.(camera, 0)).toBe(false);
    controller.dispose();
    renderTiled.mockRestore();
    renderProgressive.mockRestore();
    disposeTiled.mockRestore();
  });

  it("reprojects retained tiled shadows during motion without refitting or replacing the native view", () => {
    let regionReady = false;
    const isShadowRegionReady = vi.fn(() => regionReady);
    const readVolumes = vi.fn(() => [
      {
        id: "mesh-2024/root/tile-1",
        kind: "tiles3d",
        minimum: [-512, 0, -512],
        maximum: [512, 200, 512],
      },
    ]);
    const acknowledgeShadowStage = vi.fn();
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "committed-mesh",
        root: new THREE.Group(),
        dispose: vi.fn(),
        getActiveTileVolumes: readVolumes,
        isShadowRegionReady,
        acknowledgeShadowStage,
      },
    ] as never);
    sharedLayer.projectLngLatToScene = () => new THREE.Vector3();
    const canvas = {
      clientWidth: 1280,
      clientHeight: 720,
      width: 2560,
      height: 1440,
    };
    const renderer = {
      domElement: canvas,
      capabilities: { maxTextureSize: 4096 },
      shadowMap: { type: THREE.PCFShadowMap },
      getContext: () => ({
        getInternalformatParameter: () => new Int32Array([4, 2]),
        getParameter: () => 4096,
      }),
    } as unknown as THREE.WebGLRenderer;
    sharedLayer.getRenderer = () => renderer;
    const map = {
      getCenter: () => ({ lng: 7.15, lat: 51.256 }),
      getCanvas: () => canvas,
      getLight: () => ({ anchor: "viewport" }),
      isStyleLoaded: () => true,
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const viewport = new THREE.Vector2(2560, 1440);
    const updateTiled = vi
      .spyOn(ShadowTiledScene.prototype, "update")
      .mockImplementation((_cells, actualFrame) => {
        expect(actualFrame.viewport).toBe(viewport);
        expect(actualFrame.viewport.toArray()).toEqual([2560, 1440]);
      });
    const updatePresentation = vi
      .spyOn(ShadowTiledScene.prototype, "updatePresentation")
      .mockImplementation((actualFrame) => {
        expect(actualFrame.viewport).toBe(viewport);
        expect(actualFrame.viewport.toArray()).toEqual([2560, 1440]);
      });
    const renderTiled = vi
      .spyOn(ShadowTiledScene.prototype, "render")
      .mockImplementation(function () {
        const host = (
          this as unknown as {
            host: {
              receiverStageError: (bounds: THREE.Box3) => number;
              isCorridorReady: (
                bounds: THREE.Box3,
                errorPixels?: number,
                receiverBounds?: THREE.Box3
              ) => boolean;
              onPresentedPages: (
                presented: unknown[],
                visible: unknown[]
              ) => void;
            };
          }
        ).host;
        const bounds = new THREE.Box3(
          new THREE.Vector3(-512, 0, -512),
          new THREE.Vector3(512, 200, 512)
        );
        for (let page = 0; page < 100; page += 1) {
          host.receiverStageError(bounds);
          expect(host.isCorridorReady(bounds.clone(), 4, bounds.clone())).toBe(
            regionReady
          );
          expect(
            host.isCorridorReady(bounds.clone(), undefined, bounds.clone())
          ).toBe(regionReady);
        }
        const pages = [{ id: "page", receiverBounds: bounds }];
        host.onPresentedPages(pages, pages);
        return true;
      });
    const disposeTiled = vi.spyOn(ShadowTiledScene.prototype, "dispose");
    const controller = buildShadowSimulationScene(map as never);
    try {
      controller.updateShadowQuality(SHADOW_QUALITY.FPS_30);
      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      });
      controller.updateSolarPosition({
        instant: new Date("2026-06-21T10:00:00Z"),
        azimuthDegrees: 135,
        elevationDegrees: 45,
      });
      const camera = new THREE.PerspectiveCamera(60, 16 / 9, 1, 20_000);
      camera.position.set(0, 150, 300);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      const frame = {
        map,
        renderCamera: camera,
        lodCamera: camera,
        lookTarget: new THREE.Vector3(),
        viewport,
        localFrame: {
          lngLat: [7.15, 51.25] as const,
          revision: 1,
          sceneFromLocal: new THREE.Matrix4(),
          sceneFromLocalRotation: new THREE.Matrix4(),
          referenceLngLat: [7.15, 51.25] as const,
          sceneFromLocalReference: new THREE.Matrix4(),
          referenceToCurrent: new THREE.Matrix4(),
          currentToReference: new THREE.Matrix4(),
        },
      };
      const runtime = sharedRuntimes.get("shadow-simulation-controller")!;
      const accumulation = accumulationController!;
      const renderFrame = (refit: boolean) => {
        const updateCount = updateTiled.mock.calls.length;
        const presentationCount = updatePresentation.mock.calls.length;
        const renderCount = renderTiled.mock.calls.length;
        runtime.update?.(frame);
        const volumeReads = readVolumes.mock.calls.length;
        const regionReads = isShadowRegionReady.mock.calls.length;
        expect(accumulation.renderScene?.(camera, null)).toBe(true);
        expect(readVolumes).toHaveBeenCalledTimes(volumeReads + 1);
        expect(isShadowRegionReady).toHaveBeenCalledTimes(regionReads + 2);
        regionReady = !regionReady;
        expect(acknowledgeShadowStage).toHaveBeenLastCalledWith([
          "mesh-2024/root/tile-1",
        ]);
        expect(updateTiled).toHaveBeenCalledTimes(
          updateCount + (refit ? 1 : 0)
        );
        expect(updatePresentation).toHaveBeenCalledTimes(
          presentationCount + (refit ? 0 : 1)
        );
        expect(renderTiled).toHaveBeenCalledTimes(renderCount + 1);
        expect(renderTiled.mock.lastCall?.[3]).toBe(refit);
      };
      const moveStart = map.on.mock.calls.find(
        ([event]) => event === MAPLIBRE_EVENT.MOVE_START
      )?.[1] as () => void;
      const move = map.on.mock.calls.find(
        ([event]) => event === MAPLIBRE_EVENT.MOVE
      )?.[1] as () => void;
      const moveEnd = map.on.mock.calls.find(
        ([event]) => event === MAPLIBRE_EVENT.MOVE_END
      )?.[1] as () => void;
      const advanceMotion = (frames: number) => {
        for (let index = 0; index < frames; index += 1) {
          move();
          renderFrame(false);
        }
      };
      const runtimeCount = sharedRuntimes.size;
      renderFrame(true);
      expect(updateTiled).toHaveBeenCalledOnce();
      expect(updatePresentation).not.toHaveBeenCalled();
      expect(renderTiled).toHaveBeenCalledOnce();
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);

      moveStart();
      renderFrame(false);
      advanceMotion(3);
      expect(updateTiled).toHaveBeenCalledOnce();
      expect(updatePresentation).toHaveBeenCalledTimes(4);
      moveEnd();
      renderFrame(true);
      expect(updateTiled).toHaveBeenCalledTimes(2);
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);

      for (const [, actualFrame] of updateTiled.mock.calls) {
        expect(actualFrame).toBe(frame);
        expect(actualFrame.viewport).toBe(viewport);
        expect(actualFrame.viewport.toArray()).toEqual([2560, 1440]);
      }
      for (const [actualFrame] of updatePresentation.mock.calls) {
        expect(actualFrame).toBe(frame);
      }
      expect(renderTiled).toHaveBeenCalledTimes(
        updateTiled.mock.calls.length + updatePresentation.mock.calls.length
      );
      expect(updateTiled.mock.instances[0]).toBeInstanceOf(ShadowTiledScene);
      expect(new Set(updateTiled.mock.instances).size).toBe(1);
      expect(sharedRuntimes.size).toBe(runtimeCount);
      expect(sharedLayer.getRenderer()).toBe(renderer);
      expect(renderer.domElement).toBe(canvas);
      expect(canvas.width).toBe(2560);
      expect(canvas.height).toBe(1440);
      expect(acquireSharedThreeScene).toHaveBeenCalledTimes(1);
      expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(1);
      expect(disposeTiled).not.toHaveBeenCalled();
      expect(releaseScene).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      updateTiled.mockRestore();
      updatePresentation.mockRestore();
      renderTiled.mockRestore();
      disposeTiled.mockRestore();
    }
  });

  it("publishes configured samples and trailing tiled stats at most ten times per second", () => {
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "committed-mesh",
        root: new THREE.Group(),
        dispose: vi.fn(),
        getActiveTileVolumes: () => [
          {
            id: "mesh-2024/root/tile-1",
            kind: "tiles3d",
            minimum: [-512, 0, -512],
            maximum: [512, 200, 512],
          },
        ],
      },
    ] as never);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
    sharedLayer.projectLngLatToScene = () => new THREE.Vector3();
    sharedLayer.getRenderer = () =>
      ({
        capabilities: { maxTextureSize: 4096 },
        shadowMap: { type: THREE.PCFShadowMap },
        getContext: () => ({
          getInternalformatParameter: () => new Int32Array([4, 2]),
          getParameter: () => 4096,
        }),
      } as unknown as THREE.WebGLRenderer);
    const map = {
      getCenter: () => ({ lng: 7.15, lat: 51.256 }),
      getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
      getLight: () => ({ anchor: "viewport" }),
      isStyleLoaded: () => true,
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const renderTiled = vi
      .spyOn(ShadowTiledScene.prototype, "render")
      .mockReturnValue(true);
    let tiledStats = {
      pages: 3,
      cachedSamplePages: 2,
      cacheBytes: 1024,
      scratchBytes: 512,
      hits: 0,
      misses: 2,
      depthRenders: 2,
      colorPasses: 3,
      limitedPages: 0,
      dimensions: ["128×256"],
    };
    const readTiledStats = vi
      .spyOn(ShadowTiledScene.prototype, "stats", "get")
      .mockImplementation(() => tiledStats);
    const controller = buildShadowSimulationScene(map as never);
    const listener = vi.fn();
    const unsubscribe = subscribeShadowProjectionDebugSnapshot(
      map as never,
      listener
    );
    try {
      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowSunDiscSamples: 256,
      });
      controller.updateSolarPosition({
        instant: new Date("2026-06-21T10:00:00Z"),
        azimuthDegrees: 135,
        elevationDegrees: 45,
      });
      const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
      camera.position.set(0, 150, 300);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld(true);
      updateShadows(map, camera);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(readShadowProjectionDebugSnapshot(map as never)).toMatchObject({
        bufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        sunDiscSamples: 256,
        tiledStats: null,
        shadow: { sampleCount: 1 },
      });

      const accumulation = accumulationController!;
      expect(accumulation.renderScene?.(camera, 0)).toBe(true);
      vi.advanceTimersByTime(20);
      tiledStats = { ...tiledStats, depthRenders: 4, colorPasses: 6 };
      accumulation.renderScene?.(camera, 1);
      vi.advanceTimersByTime(79);
      expect(listener).toHaveBeenCalledTimes(1);
      expect(readTiledStats).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(readShadowProjectionDebugSnapshot(map as never)?.tiledStats).toBe(
        tiledStats
      );

      accumulation.renderScene?.(camera, 2);
      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledTimes(2);
      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowSunDiscSamples: 512,
      });
      expect(listener).toHaveBeenCalledTimes(3);
      expect(
        readShadowProjectionDebugSnapshot(map as never)?.sunDiscSamples
      ).toBe(512);

      tiledStats = { ...tiledStats, depthRenders: 8, colorPasses: 12 };
      accumulation.renderScene?.(camera, 511);
      map.triggerRepaint.mockClear();
      vi.advanceTimersByTime(100);
      expect(listener).toHaveBeenCalledTimes(4);
      expect(readShadowProjectionDebugSnapshot(map as never)?.tiledStats).toBe(
        tiledStats
      );
      expect(map.triggerRepaint).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);

      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
        shadowSunDiscSamples: 512,
      });
      vi.advanceTimersByTime(100);
      expect(readShadowProjectionDebugSnapshot(map as never)).toMatchObject({
        bufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
        tiledStats: null,
      });
      controller.updateRenderQuality({ shadowSunDiscSamples: 1024 });
      controller.dispose();
      const callsAfterDispose = listener.mock.calls.length;
      vi.advanceTimersByTime(1000);
      expect(listener).toHaveBeenCalledTimes(callsAfterDispose);
      expect(readShadowProjectionDebugSnapshot(map as never)).toBeNull();
    } finally {
      unsubscribe();
      controller.dispose();
      renderTiled.mockRestore();
      readTiledStats.mockRestore();
      vi.useRealTimers();
    }
  });

  it.each(["loaded", "failed", "disposed"] as const)(
    "transfers DEM/DSM coverage (%s) without replacing style or lighting",
    async (outcome) => {
      let resolveReplacement!: (loaded: boolean) => void;
      const createTerrain = (id: string, ready: Promise<boolean>) => ({
        id,
        originLngLat: [7.15, 51.256] as [number, number],
        root: new THREE.Group(),
        ready,
        update: vi.fn(),
        setShadowView: vi.fn(),
        setMaterialColor: vi.fn(),
        adoptPresentation: vi.fn(),
        getElevation: vi.fn(() => 150),
        getActiveTileVolumes: vi.fn(() => []),
        getViewElevationRange: vi.fn(() => [100, 200] as const),
        dispose: vi.fn(),
      });
      const original = createTerrain("original", Promise.resolve(true));
      const replacement = createTerrain(
        "replacement",
        new Promise((resolve) => {
          resolveReplacement = resolve;
        })
      );
      vi.mocked(buildRasterDemTerrainRuntime)
        .mockReturnValueOnce(original)
        .mockReturnValueOnce(replacement);
      const map = {
        getCenter: () => ({ lng: 7.15, lat: 51.256 }),
        getLight: () => ({ anchor: "viewport" }),
        isStyleLoaded: () => true,
        setLight: vi.fn(),
        on: vi.fn(),
        off: vi.fn(),
        triggerRepaint: vi.fn(),
      };
      const controller = buildShadowSimulationScene(map as never, {
        terrain: TEST_TERRAIN_SOURCE,
      });
      await original.ready;
      const lights = accumulationController;
      controller.updateTerrain({
        ...TEST_TERRAIN_SOURCE,
        id: "dsm",
        url: "/dsm/{z}/{x}/{y}",
      });
      expect(replacement.adoptPresentation).toHaveBeenCalledWith(original);
      expect(original.dispose).toHaveBeenCalledOnce();
      expect(
        replacement.adoptPresentation.mock.invocationCallOrder[0]
      ).toBeLessThan(original.dispose.mock.invocationCallOrder[0]);
      expect(buildRasterDemTerrainRuntime).toHaveBeenLastCalledWith(
        expect.any(String),
        expect.objectContaining({ id: "dsm" }),
        original.originLngLat,
        expect.objectContaining({ receivesMapStyleTexture: true })
      );
      expect(releaseScene).not.toHaveBeenCalled();
      expect(accumulationController).toBe(lights);
      if (outcome === "disposed") controller.dispose();
      resolveReplacement(outcome !== "failed");
      await replacement.ready;
      if (outcome === "disposed") {
        expect(replacement.dispose).toHaveBeenCalledOnce();
        return;
      }
      // A failed source still owns the transferred surface; do not remove it.
      expect(replacement.dispose).not.toHaveBeenCalled();
      expect(original.dispose).toHaveBeenCalledOnce();
      expect(accumulationController).toBe(lights);
      expect(releaseScene).not.toHaveBeenCalled();
      controller.dispose();
    }
  );

  it("updates render quality in place and skips equivalent invalidations", () => {
    vi.mocked(buildRasterDemTerrainRuntime).mockReturnValue({
      id: "terrain",
      originLngLat: [7.15, 51.256],
      root: new THREE.Group(),
      ready: Promise.resolve(true),
      update: vi.fn(),
      setShadowView: vi.fn(),
      setMaterialColor: vi.fn(),
      getElevation: vi.fn(() => 150),
      dispose: vi.fn(),
    });
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const controller = buildShadowSimulationScene(map as never, {
      terrain: TEST_TERRAIN_SOURCE,
    });
    const accumulation = accumulationController!;
    const initialEpoch = accumulation.epoch();
    const initialRuntimeCount = vi.mocked(sharedLayer.addRuntime).mock.calls
      .length;
    const initialOptions = accumulation.options;
    expect(accumulation.rounds).toBe(64);
    // The default mono strategy retains its requested geometry MSAA.
    expect(initialOptions).toEqual({ format: "rgba16f-32f", msaaSamples: 4 });

    map.triggerRepaint.mockClear();
    controller.updateRenderQuality({
      shadowBufferFormat: "rgba16f-32f",
      shadowMsaaSamples: 4,
    });
    expect(accumulation.epoch()).toBe(initialEpoch);
    expect(accumulation.options).toBe(initialOptions);
    expect(map.triggerRepaint).not.toHaveBeenCalled();

    controller.updateRenderQuality({
      shadowBufferFormat: "rgba32f",
      shadowSunDiscSamples: 256,
    });
    expect(accumulation.epoch()).toBeGreaterThan(initialEpoch);
    expect(accumulation.rounds).toBe(256);
    expect(accumulation.options).toEqual({ format: "rgba32f", msaaSamples: 0 });
    expect(map.triggerRepaint).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sharedLayer.addRuntime).mock.calls.length).toBe(
      initialRuntimeCount
    );
    expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(1);
    expect(buildRasterDemTerrainRuntime).toHaveBeenCalledTimes(1);

    controller.updateShadowQuality(4);
    expect(accumulation.rounds).toBe(256);
    controller.updateRenderQuality({});
    expect(accumulation.rounds).toBe(64);
    controller.dispose();
  });
});

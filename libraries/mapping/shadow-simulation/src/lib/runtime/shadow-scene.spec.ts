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

describe("shadow scene resource and idle coverage", () => {
  it("preserves native pixel ratio with mobile resource limits through startup and disposal", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "iPhone",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    const f = await createIdleTerrainHost();
    try {
      expect(f.map.getPixelRatio()).toBe(3);
      expect(f.map.setPixelRatio).not.toHaveBeenCalled();
      expect(
        vi.mocked(buildRasterDemTerrainRuntime).mock.lastCall?.[3]
      ).toMatchObject({
        meshSegments: 128,
        maximumMeshSegments: 128,
        maxSelectionTiles: 48,
        requestConcurrency: 2,
        maxCachedMeshBytes: 32 * 1024 ** 2,
        maxCacheBytes: 16 * 1024 ** 2,
      });
      expect(accumulationController!.active()).toBe(false);
      f.controller.updateSoftSunShadows(true);
      f.controller.updateShadowQuality(SHADOW_QUALITY.ULTRA);
      f.controller.updateRenderQuality({
        shadowBufferLayout: "tiled",
        shadowBufferFormat: "rgba32f",
        shadowMsaaSamples: "max",
      });
      expect(accumulationController!.active()).toBe(false);
      expect(accumulationController!.options).toMatchObject({
        format: "rgba8",
        msaaSamples: 0,
      });
      f.controller.updateTerrain({
        ...TEST_TERRAIN_SOURCE,
        meshSegments: 512,
        maxCachedMeshBytes: 1024 ** 3,
      });
      expect(
        vi.mocked(buildRasterDemTerrainRuntime).mock.lastCall?.[3]
      ).toMatchObject({
        meshSegments: 128,
        maximumMeshSegments: 128,
        maxCachedMeshBytes: 32 * 1024 ** 2,
      });
      expect(f.postTask).not.toHaveBeenCalled();
    } finally {
      f.controller.dispose();
      expect(f.map.getPixelRatio()).toBe(3);
      expect(f.map.setPixelRatio).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });

  it("keeps caster LOD demand in CSS pixels while HiDPI depth buffers remain native", async () => {
    const f = await createIdleTerrainHost();
    try {
      const capture = (dpr: number) => {
        sharedRuntimes.get("shadow-simulation-controller")!.update!({
          map: f.map,
          renderCamera: f.camera,
          lodCamera: f.camera,
          lookTarget: new THREE.Vector3(),
          viewport: new THREE.Vector2(800 * dpr, 600 * dpr),
          cssViewport: new THREE.Vector2(800, 600),
          localFrame: localFrameAt(1),
        });
        const view = f.raster.setShadowView.mock.lastCall?.[0];
        expect(view).toBeTruthy();
        const sizes: number[] = [];
        scene.traverse((object) => {
          if (object instanceof THREE.DirectionalLight)
            sizes.push(object.shadow.mapSize.x * object.shadow.mapSize.y);
        });
        return {
          pixelsPerMeterX:
            view.shadowMapSize.width / (view.camera.right - view.camera.left),
          pixelsPerMeterY:
            view.shadowMapSize.height / (view.camera.top - view.camera.bottom),
          depthPixels: Math.max(...sizes),
        };
      };
      const baseline = capture(1);
      for (const dpr of [1.25, 2, 3]) {
        const hidpi = capture(dpr);
        expect(hidpi.pixelsPerMeterX).toBeCloseTo(baseline.pixelsPerMeterX, 10);
        expect(hidpi.pixelsPerMeterY).toBeCloseTo(baseline.pixelsPerMeterY, 10);
        expect(hidpi.depthPixels).toBeGreaterThan(baseline.depthPixels);
      }
      expect(f.map.setPixelRatio).not.toHaveBeenCalled();
    } finally {
      f.controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("retains native desktop terrain and soft HDR shadows at 4K after quality changes", async () => {
    vi.stubGlobal("navigator", {
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      platform: "MacIntel",
      maxTouchPoints: 0,
    });
    const f = await createIdleTerrainHost();
    try {
      expect(f.map.getPixelRatio()).toBe(3);
      expect(f.map.setPixelRatio).not.toHaveBeenCalled();
      const terrainOptions = vi.mocked(buildRasterDemTerrainRuntime).mock
        .lastCall?.[3];
      expect(terrainOptions?.meshSegments).toBe(512);
      expect(terrainOptions?.maximumMeshSegments).toBeUndefined();
      const update4K = () =>
        sharedRuntimes.get("shadow-simulation-controller")!.update!({
          map: f.map,
          renderCamera: f.camera,
          lodCamera: f.camera,
          lookTarget: new THREE.Vector3(),
          viewport: new THREE.Vector2(3840, 2160),
          localFrame: localFrameAt(1),
        });
      update4K();
      expect(accumulationController!.active()).toBe(true);
      expect(accumulationController!.rounds).toBe(64);
      expect(accumulationController!.options?.msaaSamples).toBe(4);
      f.controller.updateShadowQuality(SHADOW_QUALITY.ULTRA);
      f.controller.updateRenderQuality({
        shadowBufferFormat: "rgba32f",
        shadowSunDiscSamples: 128,
      });
      update4K();
      expect(accumulationController!.active()).toBe(true);
      expect(accumulationController!.rounds).toBe(128);
      expect(accumulationController!.options?.format).toBe("rgba32f");
      f.controller.updateTerrain({
        ...TEST_TERRAIN_SOURCE,
        meshSegments: 512,
        maxCachedMeshBytes: 1024 ** 3,
      });
      expect(
        vi.mocked(buildRasterDemTerrainRuntime).mock.lastCall?.[3]
      ).toMatchObject({
        meshSegments: 512,
        maximumMeshSegments: undefined,
        maxCachedMeshBytes: 1024 ** 3,
      });
    } finally {
      f.controller.dispose();
      expect(f.map.setPixelRatio).not.toHaveBeenCalled();
      vi.unstubAllGlobals();
    }
  });

  it("defaults to direct hard then sun-disc draws without full-tile capture planning", async () => {
    const f = await createIdleTerrainHost();
    const rendererLookup = vi.fn(() => null);
    sharedLayer.getRenderer = rendererLookup;
    expect(accumulationController!.renderProgressive).toBeUndefined();
    expect(accumulationController!.rounds).toBe(64);
    expect(accumulationController!.active()).toBe(true);
    expect(f.raster.setShadowView).toHaveBeenCalledWith(
      expect.objectContaining({
        camera: expect.any(THREE.Camera),
        casterAngularRadiusRadians: expect.any(Number),
      })
    );
    rendererLookup.mockClear();
    f.raster.getActiveTileVolumes.mockClear();
    f.raster.setShadowView.mockClear();
    expect(accumulationController!.renderScene!(f.camera, null)).toBe(false);
    for (let round = 0; round < 64; round += 1) {
      accumulationController!.prepareRound(round);
      expect(accumulationController!.renderScene!(f.camera, round)).toBe(false);
      accumulationController!.finishRound?.();
    }
    expect(rendererLookup).not.toHaveBeenCalled();
    expect(f.raster.getActiveTileVolumes).not.toHaveBeenCalled();
    f.fire("movestart");
    expect(accumulationController!.active()).toBe(false);
    expect(accumulationController!.renderScene!(f.camera, null)).toBe(false);
    // Moving uses the direct hard draw, never clears the offscreen caster view.
    expect(f.raster.setShadowView).not.toHaveBeenCalledWith(null);
    f.controller.dispose();
  });

  it.each(["point-light", "animation"])(
    "uses a direct hard draw without receiver planning during %s",
    async (mode) => {
      const f = await createIdleTerrainHost();
      const rendererLookup = vi.fn(() => null);
      sharedLayer.getRenderer = rendererLookup;
      f.controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      });
      if (mode === "point-light") f.controller.updateSoftSunShadows(false);
      else f.controller.updateTimeAnimating(true);
      updateShadows(f.map, f.camera);
      expect(accumulationController!.retainSettledFrame!()).toBe(false);
      rendererLookup.mockClear();
      f.raster.getActiveTileVolumes.mockClear();
      for (let tick = 0; tick < 10; tick += 1) {
        expect(accumulationController!.renderScene!(f.camera, null)).toBe(
          false
        );
        expect(
          accumulationController!.renderProgressive!(f.camera, {
            width: 800,
            height: 600,
            viewKey: "hard-animation",
            styleEpoch: tick,
            active: false,
          })
        ).toBeNull();
      }
      expect(rendererLookup).not.toHaveBeenCalled();
      // No snapshot/traversal is needed just to select the direct draw.
      expect(f.raster.getActiveTileVolumes).not.toHaveBeenCalled();
      expect(f.raster.setShadowView).toHaveBeenCalledWith(
        expect.objectContaining({ camera: expect.any(THREE.Camera) })
      );
      f.controller.dispose();
    }
  );

  it("re-selects runtime casters at most once a second while animating and once more on stop", async () => {
    const f = await createIdleTerrainHost();
    let now = 100_000;
    const clock = vi.spyOn(performance, "now").mockImplementation(() => now);
    const sun = (tick: number) => ({
      instant: new Date(Date.UTC(2026, 5, 21, 10, tick)),
      azimuthDegrees: 135 + tick,
      elevationDegrees: 45,
    });
    f.controller.updateTimeAnimating(true);
    f.raster.setShadowView.mockClear();
    for (let tick = 1; tick <= 12; tick += 1) {
      now += 33;
      f.controller.updateSolarPosition(sun(tick));
      updateShadows(f.map, f.camera);
    }
    // Twelve sun changes inside one second: one caster re-selection.
    expect(f.raster.setShadowView).toHaveBeenCalledTimes(1);
    now += 1_000;
    f.controller.updateSolarPosition(sun(13));
    updateShadows(f.map, f.camera);
    expect(f.raster.setShadowView).toHaveBeenCalledTimes(2);
    now += 33;
    f.controller.updateSolarPosition(sun(14));
    updateShadows(f.map, f.camera);
    expect(f.raster.setShadowView).toHaveBeenCalledTimes(2);
    // The stop applies the deferred final view instead of waiting for a move.
    f.controller.updateTimeAnimating(false);
    expect(f.raster.setShadowView).toHaveBeenCalledTimes(3);
    expect(f.raster.setShadowView.mock.lastCall?.[0]).toMatchObject(
      f.raster.setLiveShadowView.mock.lastCall![0]
    );
    clock.mockRestore();
    f.controller.dispose();
  });

  it("retains the common hard depth target across same-size sun updates", async () => {
    const f = await createIdleTerrainHost();
    f.controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    f.controller.updateSoftSunShadows(false);
    updateShadows(f.map, f.camera);
    const lights: THREE.DirectionalLight[] = [];
    scene.traverse((object) => {
      if (object instanceof THREE.DirectionalLight && object.castShadow)
        lights.push(object);
    });
    expect(lights.length).toBeGreaterThan(0);
    const light = lights[0];
    const depth = new THREE.WebGLRenderTarget(
      light.shadow.mapSize.x,
      light.shadow.mapSize.y
    );
    light.shadow.map = depth;
    const dispose = vi.spyOn(depth, "dispose");
    for (let tick = 0; tick < 10; tick += 1) {
      f.controller.updateSolarPosition({
        instant: new Date(2026, 5, 21, 12, tick),
        azimuthDegrees: 135 + tick * 0.01,
        elevationDegrees: 45,
      });
      updateShadows(f.map, f.camera);
      expect(light.shadow.map).toBe(depth);
    }
    expect(dispose).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("reuses corridor revisions within a draw and refreshes null and changed cuts next draw", async () => {
    const f = await createIdleTerrainHost();
    const revision = vi.fn(() => null as string | null);
    Object.assign(f.raster, { getShadowRegionRevision: revision });
    sharedLayer.getRenderer = () =>
      ({
        capabilities: { maxTextureSize: 4096 },
        shadowMap: { type: THREE.PCFShadowMap },
        getContext: () => ({
          getInternalformatParameter: () => new Int32Array([4, 2]),
          getParameter: () => 4096,
        }),
      } as unknown as THREE.WebGLRenderer);
    const update = vi
      .spyOn(ShadowTiledScene.prototype, "update")
      .mockImplementation(() => {});
    const bounds = new THREE.Box3(
      new THREE.Vector3(6650, 100, 50756),
      new THREE.Vector3(7650, 200, 51756)
    );
    const render = vi
      .spyOn(ShadowTiledScene.prototype, "render")
      .mockImplementation(function () {
        const host = (
          this as unknown as {
            host: {
              corridorRevision: (
                bounds: THREE.Box3,
                error?: number,
                receiver?: THREE.Box3
              ) => string | null;
            };
          }
        ).host;
        const before = revision.mock.calls.length;
        for (let index = 0; index < 100; index += 1) {
          expect(
            host.corridorRevision(bounds.clone(), 4, bounds.clone())
          ).toEqual(
            revision.getMockImplementation()!() === null
              ? null
              : JSON.stringify([JSON.stringify([f.raster.id, "new-cut"])])
          );
          host.corridorRevision(bounds.clone(), undefined, bounds.clone());
        }
        expect(revision).toHaveBeenCalledTimes(before + 2);
        return true;
      });
    try {
      f.controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      });
      updateShadows(f.map, f.camera);
      expect(accumulationController!.renderScene!(f.camera, null)).toBe(true);
      revision.mockReturnValue("new-cut");
      expect(accumulationController!.renderScene!(f.camera, null)).toBe(true);
      expect(render).toHaveBeenCalledTimes(2);
    } finally {
      f.controller.dispose();
      render.mockRestore();
      update.mockRestore();
    }
  });

  it("starts one deferred terrain-cache job only after visible shadow convergence", async () => {
    const { controller, raster, map, postTask, tasks } =
      await createIdleTerrainHost();
    try {
      expect(postTask).not.toHaveBeenCalled();
      expect(accumulationController?.onSettled).toBeTypeOf("function");
      accumulationController!.onSettled!();
      accumulationController!.onSettled!();
      expect(postTask).toHaveBeenCalledTimes(1);
      expect(postTask).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({ priority: "background", delay: 150 })
      );
      expect(raster.prefetchIdleTerrain).not.toHaveBeenCalled();
      map.triggerRepaint.mockClear();
      await tasks[0].callback();
      tasks[0].finish();
      expect(raster.prefetchIdleTerrain).toHaveBeenCalledWith(tasks[0].signal);
      expect(map.triggerRepaint).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("keeps caster fetch coverage and owns the render while the first committed native cut is empty", async () => {
    const f = await createIdleTerrainHost(true, false);
    const update = vi
      .spyOn(ShadowTiledScene.prototype, "update")
      .mockImplementation(() => undefined);
    const render = vi
      .spyOn(ShadowTiledScene.prototype, "render")
      .mockReturnValue(true);
    sharedLayer.getRenderer = () =>
      ({
        capabilities: { maxTextureSize: 4096 },
        shadowMap: { type: THREE.PCFShadowMap },
        getContext: () => ({
          getInternalformatParameter: () => new Int32Array([4, 2]),
          getParameter: () => 4096,
        }),
      } as unknown as THREE.WebGLRenderer);
    try {
      f.controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
      });
      f.raster.setShadowView.mockClear();
      for (let frame = 0; frame < 3; frame += 1) {
        f.fire(MAPLIBRE_EVENT.MOVE);
        updateShadows(f.map, f.camera);
        // Returning false delegates to the bare shared-scene render, which
        // bypasses the corridor barrier and caused the startup strobe loop.
        expect(accumulationController!.renderScene?.(f.camera, null)).toBe(
          true
        );
      }
      expect(f.raster.getActiveTileVolumes()).toEqual([]);
      expect(update).toHaveBeenCalledTimes(3);
      expect(update.mock.calls.every(([cells]) => cells.length === 0)).toBe(
        true
      );
      expect(render).toHaveBeenCalledTimes(3);
      expect(f.raster.setShadowView).toHaveBeenCalled();
      expect(
        f.raster.setShadowView.mock.calls.every(([view]) => view !== null)
      ).toBe(true);
      expect(
        f.raster.setShadowView.mock.lastCall?.[0]?.camera.isOrthographicCamera
      ).toBe(true);
    } finally {
      f.controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it.each([
    "initial",
    "loading",
    "moving",
    "animation",
    "content",
    "coverage",
    "point-light",
  ] as const)(
    "does not queue idle terrain work while %s blocks a settled foreground",
    async (blocker) => {
      const { controller, raster, fire, postTask } =
        await createIdleTerrainHost(blocker !== "initial");
      try {
        if (blocker === "loading")
          vi.mocked(isSharedThreeTerrainLoading).mockReturnValue(true);
        else if (blocker === "moving") fire(MAPLIBRE_EVENT.MOVE_START);
        else if (blocker === "animation") controller.updateTimeAnimating(true);
        else if (blocker === "content")
          vi.mocked(subscribeSharedThreeSceneContent).mock.lastCall![1]();
        else if (blocker === "coverage")
          raster.getIdlePrefetchAvailability.mockReturnValue({
            ready: false,
            remaining: 8,
          });
        else if (blocker === "point-light")
          controller.updateSoftSunShadows(false);
        accumulationController!.onSettled!();
        accumulationController!.onSettled!();
        expect(postTask).not.toHaveBeenCalled();
        expect(raster.prefetchIdleTerrain).not.toHaveBeenCalled();
      } finally {
        controller.dispose();
        vi.unstubAllGlobals();
      }
    }
  );

  it("still schedules background cache maintenance when neighbour terrain is warm", async () => {
    const { controller, raster, postTask, tasks } =
      await createIdleTerrainHost();
    try {
      raster.getIdlePrefetchAvailability.mockReturnValue({
        ready: true,
        remaining: 0,
      });
      accumulationController!.onSettled!();
      expect(postTask).toHaveBeenCalledTimes(1);
      await tasks[0].callback();
      tasks[0].finish();
      expect(raster.prefetchIdleTerrain).toHaveBeenCalledOnce();
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it.each([
    "movestart",
    "move",
    "resize",
    "presentation",
    "shadow-map",
    "source",
    "animation",
    "content",
    "loading",
    "dispose",
  ] as const)("aborts a scheduled terrain-cache job on %s", async (change) => {
    const { controller, raster, fire, tasks } = await createIdleTerrainHost();
    try {
      accumulationController!.onSettled!();
      expect(tasks).toHaveLength(1);
      if (change === "movestart" || change === "move" || change === "resize")
        fire(change);
      else if (change === "presentation") controller.updateShadowIntensity(0.5);
      else if (change === "shadow-map")
        vi.mocked(buildRasterDemTerrainRuntime).mock.lastCall![3]!
          .onContentChanged!([]);
      else if (change === "source") {
        vi.mocked(buildRasterDemTerrainRuntime).mockReturnValueOnce({
          ...raster,
          id: "next-idle-terrain",
          root: new THREE.Group(),
        });
        controller.updateTerrain({ ...TEST_TERRAIN_SOURCE, id: "next-source" });
      } else if (change === "animation") controller.updateTimeAnimating(true);
      else if (change === "content")
        vi.mocked(subscribeSharedThreeSceneContent).mock.lastCall![1]();
      else if (change === "loading") {
        vi.mocked(isSharedThreeTerrainLoading).mockReturnValue(true);
        vi.mocked(subscribeSharedThreeTerrainLoading).mock.lastCall![1]();
      } else controller.dispose();
      expect(tasks[0].signal.aborted).toBe(true);
      await tasks[0].callback();
      tasks[0].finish();
      expect(raster.prefetchIdleTerrain).not.toHaveBeenCalled();
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it.each([false, true])(
    "warms native terrain neighbours without interpreting source IDs as legacy shadow-grid coordinates (external=%s)",
    async (external) => {
      const prewarm = vi
        .spyOn(ShadowTiledScene.prototype, "prewarm")
        .mockResolvedValue(null);
      const render = vi
        .spyOn(ShadowTiledScene.prototype, "render")
        .mockReturnValue(true);
      const update = vi
        .spyOn(ShadowTiledScene.prototype, "update")
        .mockImplementation(() => undefined);
      const f = await createIdleTerrainHost();
      const renderer = {
        capabilities: { maxTextureSize: 4096 },
        shadowMap: { type: THREE.PCFShadowMap },
        getContext: () => ({
          getInternalformatParameter: () => new Int32Array([4, 2]),
          getParameter: () => 4096,
        }),
      } as unknown as THREE.WebGLRenderer;
      sharedLayer.getRenderer = () => renderer;
      try {
        f.controller.updateRenderQuality({
          shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        });
        updateShadows(f.map, f.camera);
        expect(accumulationController!.renderScene?.(f.camera, 0)).toBe(true);
        if (external)
          vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
            {
              id: "unloaded-building-corridor",
              root: new THREE.Group(),
              update: vi.fn(),
              dispose: vi.fn(),
            } as never,
          ]);
        accumulationController!.onSettled!();
        await f.tasks[0].callback();
        f.tasks[0].finish();
        expect(f.raster.prefetchIdleTerrain).toHaveBeenCalledOnce();
        // Native-source neighbour planning is not implemented by the legacy
        // spacing:x:z ring. Terrain warming continues; arbitrary shadow pages
        // must not be fabricated from these source tile IDs.
        expect(prewarm).not.toHaveBeenCalled();
      } finally {
        f.controller.dispose();
        prewarm.mockRestore();
        render.mockRestore();
        update.mockRestore();
        vi.unstubAllGlobals();
      }
    }
  );
});

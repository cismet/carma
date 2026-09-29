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

describe("shadow scene terrain provider lifecycle", () => {
  it("adds configured raster DEM terrain to the shared scene", async () => {
    const terrainRoot = new THREE.Group();
    let resolveTerrainReady!: (loaded: boolean) => void;
    const terrainReady = new Promise<boolean>((resolve) => {
      resolveTerrainReady = resolve;
    });
    const terrainRuntime = {
      id: "terrain",
      originLngLat: [7.15, 51.256] as [number, number],
      root: terrainRoot,
      ready: terrainReady,
      update: vi.fn(),
      setShadowView: vi.fn(),
      setMaterialColor: vi.fn(),
      getElevation: vi.fn(() => 150),
      getActiveTileVolumes: vi.fn(() => [
        {
          id: "terrain-source:14/8512/5421",
          kind: "terrain-tile" as const,
          minimum: [6_650, 100, 50_756] as const,
          maximum: [7_650, 200, 51_756] as const,
        },
      ]),
      dispose: vi.fn(),
    };
    vi.mocked(buildRasterDemTerrainRuntime).mockReturnValue(terrainRuntime);
    const addRuntime = vi.fn();
    const removeRuntime = vi.fn();
    vi.mocked(acquireSharedThreeScene).mockReturnValue({
      layer: {
        getScene: () => scene,
        getRenderer: () =>
          ({
            capabilities: { maxTextureSize: 16_384 },
            getContext: () => ({
              getInternalformatParameter: () => new Int32Array([4, 2]),
              getParameter: () => 16_384,
            }),
          } as THREE.WebGLRenderer),
        addRuntime,
        hasRuntime: vi.fn(() => true),
        removeRuntime,
        setAccumulationController: sharedLayer.setAccumulationController,
        projectLngLatToScene: (
          [longitude, latitude]: [number, number],
          altitude = 0
        ) => new THREE.Vector3(longitude * 1_000, altitude, latitude * 1_000),
      } as never,
      setLocationLabelColor,
      setMeshLabelStyle: vi.fn(),
      setMapStyleElevationVisibility: vi.fn(),
      release: releaseScene,
    });
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: 7.15 + (x / 800 - 0.5) * 0.02,
        lat: 51.256 + (0.5 - y / 600) * 0.02,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never, {
      shadowAreaMeters: 600,
      terrain: {
        ...TEST_TERRAIN_SOURCE,
        minimumLevel: 10,
        maximumLevel: 16,
      },
    });
    expect(buildRasterDemTerrainRuntime).toHaveBeenCalledWith(
      "shadow-simulation-raster-dem-1",
      TEST_TERRAIN_SOURCE,
      [7.15, 51.256],
      expect.objectContaining({ minimumLevel: 10, maximumLevel: 16 })
    );
    expect(addRuntime).toHaveBeenCalledWith(terrainRuntime);
    expect(map.setTerrain).toBeUndefined();

    controller.updateTerrainColor("#8c7a66");
    expect(terrainRuntime.setMaterialColor).toHaveBeenCalledWith("#8c7a66");

    const evaluateAtmosphere = vi.spyOn(
      AtmosphericSunlightEvaluator.prototype,
      "evaluate"
    );
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const shadowRuntime = addRuntime.mock.calls.find(
      ([runtime]) => runtime.id === "shadow-simulation-controller"
    )?.[0] as SharedRuntimeFixture;
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 475, 55_256);
    camera.lookAt(7_150, 150, 51_256);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    shadowRuntime.update?.({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(7_150, 150, 51_256),
      viewport: new THREE.Vector2(800, 600),
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
    });
    expect(accumulationController?.active()).toBe(false);

    resolveTerrainReady(true);
    await terrainRuntime.ready;
    expect(accumulationController?.active()).toBe(true);

    const shadowView = terrainRuntime.setShadowView.mock.lastCall?.[0];
    expect(shadowView.camera.name).toBe("shadow-simulation-shadow-camera");
    expect(
      (shadowView.camera as THREE.OrthographicCamera).isOrthographicCamera
    ).toBe(true);
    // The 30 FPS preset budgets 4096² depth texels at native 2560×1440.
    expect(shadowView.shadowMapSize.width).toBe(
      Math.floor(Math.sqrt((4096 ** 2 * (800 * 600)) / (2560 * 1440)))
    );
    expect(shadowView.shadowMapSize.width).not.toBe(800);
    // Ground irradiance is evaluated at the stable scene reference, not at the
    // moving observer's altitude. The sky camera remains view-dependent.
    expect(evaluateAtmosphere.mock.lastCall?.[1].altitudeMeters).toBe(100);

    controller.dispose();
    expect(removeRuntime).toHaveBeenCalledWith("terrain");
  });

  it("replaces shadow terrain while a Mesh tiles runtime provides terrain", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const makeTerrainRuntime = () => ({
      id: "shadow-simulation-raster-dem",
      originLngLat: [7.15, 51.256] as [number, number],
      root: new THREE.Group(),
      ready: Promise.resolve(true),
      update: vi.fn(),
      setShadowView: vi.fn(),
      setMaterialColor: vi.fn(),
      getElevation: vi.fn(() => 150),
      dispose: vi.fn(),
    });
    const initialTerrain = makeTerrainRuntime();
    const restoredTerrain = makeTerrainRuntime();
    vi.mocked(buildRasterDemTerrainRuntime)
      .mockReturnValueOnce(initialTerrain)
      .mockReturnValueOnce(restoredTerrain);
    let contentChanged = () => undefined;
    vi.mocked(subscribeSharedThreeSceneContent).mockImplementation(
      (_map, listener) => {
        contentChanged = listener;
        return vi.fn();
      }
    );
    const activeContentRuntimes: SharedRuntimeFixture[] = [];
    vi.mocked(getSharedThreeSceneRuntimes).mockImplementation(
      () => activeContentRuntimes as never
    );
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: 7.15 + (x / 800 - 0.5) * 0.02,
        lat: 51.256 + (0.5 - y / 600) * 0.02,
      })),
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
    await initialTerrain.ready;
    expect(sharedRuntimes.has(initialTerrain.id)).toBe(true);

    let meshRenderable = false;
    activeContentRuntimes.push({
      id: "mesh2024",
      root: new THREE.Group(),
      providesTerrain: true,
      hasRenderableContent: () => meshRenderable,
      dispose: vi.fn(),
    });
    contentChanged();
    vi.advanceTimersByTime(1_000);

    expect(sharedRuntimes.has(initialTerrain.id)).toBe(false);
    expect(initialTerrain.dispose).toHaveBeenCalledOnce();

    expect(sharedLayer.setAccumulationController).toHaveBeenCalledWith(null);
    const resetCalls = vi.mocked(sharedLayer.setAccumulationController).mock
      .calls.length;

    meshRenderable = true;
    contentChanged();
    vi.advanceTimersByTime(1_000);
    expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(
      resetCalls
    );

    expect(sharedRuntimes.has(initialTerrain.id)).toBe(false);
    expect(initialTerrain.dispose).toHaveBeenCalledOnce();

    controller.updateTerrainColor("#8c7a66");

    activeContentRuntimes.length = 0;
    contentChanged();
    vi.advanceTimersByTime(1_000);
    await restoredTerrain.ready;

    expect(buildRasterDemTerrainRuntime).toHaveBeenCalledTimes(2);
    expect(sharedRuntimes.get(restoredTerrain.id)).toBe(restoredTerrain);
    expect(restoredTerrain.setMaterialColor).toHaveBeenCalled();

    controller.dispose();
    vi.unstubAllGlobals();
  });
});

import "./shadow-scene.test-mocks";

import * as THREE from "three";
import { afterEach, beforeEach, expect, vi } from "vitest";

import { buildRasterDemTerrainRuntime } from "@carma-mapping/engines/maplibre/terrain";
import {
  acquireSharedThreeScene,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  isSharedThreeTerrainLoading,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  type SharedThreeSceneFrame,
  type SharedThreeSceneLayer,
} from "@carma-mapping/engines/maplibre";

import { buildShadowSimulationScene } from "./shadow-scene";
import { TEST_TERRAIN_SOURCE } from "./shadow-scene.test-mocks";

export { TEST_TERRAIN_SOURCE } from "./shadow-scene.test-mocks";

export const releaseScene = vi.fn();
export const setLocationLabelColor = vi.fn();
export const setPointLabelOverlayVisible = vi.fn();
export const setMapStyleProjectionVisible = vi.fn();
export let scene: THREE.Scene;
export let frameGroup: THREE.Group;
/** Shadow suns live in the local-frame group, not among the scene's children. */
export const findShadowLights = () => {
  const lights: THREE.DirectionalLight[] = [];
  scene.traverse((object) => {
    if (
      (object as THREE.DirectionalLight).isDirectionalLight &&
      object.name.startsWith("shadow-simulation-sun")
    )
      lights.push(object as THREE.DirectionalLight);
  });
  return lights;
};
export type SharedRuntimeFixture = {
  id: string;
  root: THREE.Object3D;
  providesTerrain?: boolean;
  hasRenderableContent?: () => boolean;
  getActiveTileVolumes?: () => readonly {
    id: string;
    kind: "terrain-tile" | "tiles3d";
    minimum: readonly [number, number, number];
    maximum: readonly [number, number, number];
  }[];
  updatePriority?: number;
  update?: (frame: unknown) => void;
  dispose: () => void;
};
export let sharedRuntimes: Map<string, SharedRuntimeFixture>;
export let accumulationController: Parameters<
  SharedThreeSceneLayer["setAccumulationController"]
>[0];
export let sharedLayer: {
  getScene: () => THREE.Scene;
  addRuntime: (runtime: SharedRuntimeFixture) => void;
  hasRuntime: (runtimeId: string) => boolean;
  removeRuntime: (runtimeId: string) => void;
  getRenderer: () => THREE.WebGLRenderer | null;
  runIdleRender: (render: () => void) => boolean;
  setAccumulationController: SharedThreeSceneLayer["setAccumulationController"];
  setMapStyleProjectionVisible: (visible: boolean) => void;
  projectLngLatToScene?: (
    lngLat: [number, number],
    altitude?: number
  ) => THREE.Vector3;
};

beforeEach(() => {
  vi.clearAllMocks();
  // This Node scene fixture has no GPU/LUT decoding. Real atmosphere downloads
  // can finish after assertions and emit browser-only ProgressEvent errors.
  vi.spyOn(THREE.FileLoader.prototype, "load").mockReturnValue(undefined);
  scene = new THREE.Scene();
  frameGroup = new THREE.Group();
  frameGroup.matrixAutoUpdate = false;
  scene.add(frameGroup);
  sharedRuntimes = new Map();
  accumulationController = null;
  sharedLayer = {
    getScene: () => scene,
    getLocalFrameGroup: () => frameGroup,
    getRenderer: () => null,
    runIdleRender: (render) => {
      render();
      return true;
    },
    addRuntime: vi.fn((runtime) => {
      sharedRuntimes.set(runtime.id, runtime);
      scene.add(runtime.root);
    }),
    hasRuntime: vi.fn((runtimeId) => sharedRuntimes.has(runtimeId)),
    removeRuntime: vi.fn((runtimeId) => {
      const runtime = sharedRuntimes.get(runtimeId);
      if (!runtime) return;
      scene.remove(runtime.root);
      runtime.dispose();
      sharedRuntimes.delete(runtimeId);
    }),
    setAccumulationController: vi.fn((controller) => {
      accumulationController = controller;
    }),
    setMapStyleProjectionVisible,
  };
  vi.mocked(getGenericThreeLayers).mockReturnValue([]);
  vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([]);
  vi.mocked(subscribeGenericThreeLayers).mockReturnValue(vi.fn());
  vi.mocked(subscribeSharedThreeSceneContent).mockReturnValue(vi.fn());
  vi.mocked(isSharedThreeTerrainLoading).mockReturnValue(false);
  vi.mocked(acquireSharedThreeScene).mockReturnValue({
    layer: sharedLayer as never,
    setLocationLabelColor,
    setPointLabelOverlayVisible,
    setMeshLabelStyle: vi.fn(),
    setMapStyleElevationVisibility: vi.fn(),
    release: releaseScene,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A frame whose current fit is `rotation` away from an identity reference. */
export const localFrameAt = (
  revision: number,
  rotation = new THREE.Matrix4()
): SharedThreeSceneFrame["localFrame"] => ({
  lngLat: [7.15, 51.256] as const,
  revision,
  sceneFromLocal: rotation.clone(),
  sceneFromLocalRotation: rotation.clone(),
  referenceLngLat: [7.15, 51.256] as const,
  sceneFromLocalReference: new THREE.Matrix4(),
  referenceToCurrent: rotation.clone(),
  currentToReference: rotation.clone().invert(),
});

export const updateShadows = (
  map: unknown,
  camera: THREE.PerspectiveCamera,
  lookTarget = new THREE.Vector3(),
  localFrame = localFrameAt(1)
) => {
  const runtime = sharedRuntimes.get("shadow-simulation-controller");
  expect(runtime?.update).toBeTypeOf("function");
  runtime?.update?.({
    map: map as never,
    renderCamera: camera,
    lodCamera: camera,
    lookTarget,
    viewport: new THREE.Vector2(800, 600),
    localFrame,
  });
};

export const createIdleTerrainHost = async (
  initialReady = true,
  committedTiles = true
) => {
  vi.stubGlobal("window", { setTimeout, clearTimeout });
  const tasks: Array<{
    callback: () => Promise<void>;
    signal: AbortSignal;
    finish: () => void;
  }> = [];
  const postTask = vi.fn(
    (callback: () => Promise<void>, options: { signal: AbortSignal }) =>
      new Promise<void>((resolve) => {
        tasks.push({ callback, signal: options.signal, finish: resolve });
      })
  );
  vi.stubGlobal("scheduler", { postTask });
  const raster = {
    id: "idle-shadow-terrain",
    setLiveShadowView: vi.fn(),
    originLngLat: [7.15, 51.256] as [number, number],
    root: new THREE.Group(),
    ready: initialReady
      ? Promise.resolve(true)
      : new Promise<boolean>(() => undefined),
    update: vi.fn(),
    setShadowView: vi.fn(),
    setMaterialColor: vi.fn(),
    adoptPresentation: vi.fn(),
    getElevation: vi.fn(() => 150),
    getActiveTileVolumes: vi.fn(() =>
      committedTiles
        ? [
            {
              id: "terrain-source:14/8512/5421",
              kind: "terrain-tile" as const,
              minimum: [6_650, 100, 50_756] as const,
              maximum: [7_650, 200, 51_756] as const,
            },
          ]
        : []
    ),
    getViewElevationRange: vi.fn(() => [100, 200] as const),
    getIdlePrefetchAvailability: vi.fn(() => ({ ready: true, remaining: 8 })),
    getIdleShadowRegions: vi.fn(() => [
      {
        id: "idle",
        terrainLevel: 14,
        receiverBounds: new THREE.Box3(
          new THREE.Vector3(-1e6, -1000, -1e6),
          new THREE.Vector3(1e6, 1000, 1e6)
        ),
      },
    ]),
    prepareIdleShadowRegion: vi.fn(async () => ({
      covered: false,
      group: null,
      dependencyBounds: [],
      isCurrent: () => false,
      dispose: () => undefined,
    })),
    prefetchIdleTerrain: vi.fn(async (signal?: AbortSignal) => ({
      prepared: 8,
      failed: 0,
      remaining: 0,
      aborted: signal?.aborted ?? false,
    })),
    dispose: vi.fn(),
  };
  vi.mocked(buildRasterDemTerrainRuntime).mockReturnValue(raster);
  sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
    new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
  let pixelRatio = 3;
  const map = {
    getPixelRatio: () => pixelRatio,
    setPixelRatio: vi.fn((ratio: number) => {
      pixelRatio = ratio;
    }),
    getCenter: () => ({ lng: 7.15, lat: 51.256 }),
    getCanvas: () => ({ clientWidth: 800, clientHeight: 600 }),
    unproject: ([x, y]: [number, number]) => ({
      lng: 7.15 + (x / 800 - 0.5) * 0.02,
      lat: 51.256 + (0.5 - y / 600) * 0.02,
    }),
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
  await Promise.resolve();
  controller.updateSolarPosition({
    instant: new Date("2026-06-21T10:00:00Z"),
    azimuthDegrees: 135,
    elevationDegrees: 45,
  });
  const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
  camera.position.set(7_150, 4_000, 51_256);
  camera.lookAt(7_150, 0, 51_256);
  camera.updateMatrixWorld(true);
  updateShadows(map, camera);
  const fire = (event: string) => {
    const listener = map.on.mock.calls.find(([name]) => name === event)?.[1];
    expect(listener).toBeTypeOf("function");
    listener();
  };
  return { controller, raster, map, camera, fire, postTask, tasks };
};

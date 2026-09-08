// @vitest-environment node

import * as THREE from "three";
import { SkyMaterial } from "@takram/three-atmosphere";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mapLibreEventMock = vi.hoisted(() => ({
  MOVE: "move",
  MOVE_END: "moveend",
  MOVE_START: "movestart",
  RESIZE: "resize",
  STYLE_DATA: "styledata",
  STYLE_LOAD: "style.load",
  TERRAIN: "terrain",
}));

const TEST_TERRAIN_SOURCE = {
  id: "terrain-source",
  url: "https://example.test/terrain/{z}/{x}/{y}.png",
  tileSize: 512,
  minzoom: 5,
  maxzoom: 15,
  encoding: "terrarium" as const,
  bounds: [6.4, 50.8, 7.8, 51.6] as const,
};

vi.mock("@carma-mapping/engines/maplibre", async () => {
  // Node-only renderer fixtures: load the pure implementation, not Leaflet/UI.
  const { isTerrainShadingStyleLayer, TERRAIN_MAP_STYLE } =
    await vi.importActual<
      typeof import("../../../../engines/maplibre/src/lib/core/terrain-map-style")
    >("../../../../engines/maplibre/src/lib/core/terrain-map-style");
  const { meshShadowStageError } = await vi.importActual<
    typeof import("../../../../engines/maplibre/src/lib/runtime/integrations/three-tiles-load-policy")
  >(
    "../../../../engines/maplibre/src/lib/runtime/integrations/three-tiles-load-policy"
  );
  return {
    meshShadowStageError,
    isTerrainShadingStyleLayer,
    TERRAIN_MAP_STYLE,
    MAPLIBRE_EVENT: mapLibreEventMock,
    WUPPERTAL_TERRAIN_SOURCE_ID: "terrain-source",
    acquireSharedThreeScene: vi.fn(),
    buildRasterDemTerrainRuntime: vi.fn(),
    getGenericThreeLayers: vi.fn(() => []),
    getSharedThreeShadowViewSignature: vi.fn(({ camera, shadowMapSize }) =>
      [
        ...camera.matrixWorld.elements,
        ...camera.projectionMatrix.elements,
        shadowMapSize.width,
        shadowMapSize.height,
      ].join(",")
    ),
    getSharedThreeSceneRuntimes: vi.fn(() => []),
    subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
    subscribeSharedThreeSceneContent: vi.fn(() => vi.fn()),
    isSharedThreeTerrainLoading: vi.fn(() => false),
    subscribeSharedThreeTerrainLoading: vi.fn(() => vi.fn()),
    isMapStyleContourLineLayer: (layer: {
      type?: string;
      id?: string;
      "source-layer"?: string;
    }) =>
      layer.type === "line" &&
      /hoehenlinie/i.test(`${layer.id}:${layer["source-layer"]}`),
    suppressMapLibreRegularStyleLayers: vi.fn(() => vi.fn()),
  };
});

import {
  acquireSharedThreeScene,
  buildRasterDemTerrainRuntime,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  MAPLIBRE_EVENT,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  isSharedThreeTerrainLoading,
  subscribeSharedThreeTerrainLoading,
  suppressMapLibreRegularStyleLayers,
  type SharedThreeSceneLayer,
} from "@carma-mapping/engines/maplibre";

import {
  acquireShadowMapLibreTerrain,
  buildShadowSimulationScene,
  solarPositionToSceneDirection,
} from "./shadow-scene";
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
import { getDaylightWindow, getSolarPosition } from "../core/solar-position";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_QUALITY,
} from "../core/shadow-types";
import { ShadowTiledScene } from "./shadow-tiled-scene";

describe("shadow scene sun direction", () => {
  const position = (azimuthDegrees: number, elevationDegrees: number) => ({
    instant: new Date("2026-06-21T10:00:00Z"),
    azimuthDegrees,
    elevationDegrees,
  });

  it("maps north to the shared scene's negative Z axis", () => {
    const direction = solarPositionToSceneDirection(position(0, 0));

    expect(direction.x).toBeCloseTo(0);
    expect(direction.y).toBeCloseTo(0);
    expect(direction.z).toBeCloseTo(-1);
  });

  it("maps east and zenith into the shared local frame", () => {
    expect(solarPositionToSceneDirection(position(90, 0)).x).toBeCloseTo(1);
    expect(solarPositionToSceneDirection(position(180, 90)).y).toBeCloseTo(1);
  });

  it("maps Berlin civil time at Wuppertal into the local tangent plane", () => {
    const location = {
      latitude: 51.256,
      longitude: 7.15,
    };
    const selection = {
      year: 2026,
      dayOfYear: 172,
      minutes: 12 * 60,
      timeZone: "Europe/Berlin",
    };
    const daylight = getDaylightWindow(selection, location);
    const solarPosition = getSolarPosition(
      {
        ...selection,
        minutes: daylight.solarNoonMinutes,
      },
      location
    );
    const direction = solarPositionToSceneDirection(solarPosition);

    expect(solarPosition.instant.toISOString()).toContain("T11:");
    expect(direction.y).toBeGreaterThan(0.85);
    expect(direction.z).toBeGreaterThan(0);
    expect(Math.abs(direction.x)).toBeLessThan(0.05);
  });
});

describe("shadow scene MapLibre terrain", () => {
  it("leaves the label drape to the shared scene for a textured terrain mesh", () => {
    type Handler = () => void;
    const handlers = new Map<string, Set<Handler>>();
    let terrain: { source: string; exaggeration: number } | null = null;
    let terrainSourceAdded = false;
    const layers = [
      { id: "background", type: "background" },
      { id: "basemap", type: "raster", source: "basemap-source" },
      { id: "landcover", type: "fill", source: "vector-source" },
      { id: "roads", type: "line", source: "vector-source" },
      {
        id: "bg-basemap_relief-Hoehenlinie_10er",
        type: "line",
        source: "vector-source",
        "source-layer": "Hoehenlinie",
      },
      { id: "road-labels", type: "symbol", source: "vector-source" },
      { id: "three", type: "custom" },
    ];
    const paint = new Map<string, unknown>([["basemap:raster-opacity", 0.9]]);
    const layout = new Map<string, unknown>([["roads:visibility", "visible"]]);
    const map = {
      terrain: null,
      getTerrain: vi.fn(() => terrain),
      getSource: vi.fn((sourceId: string) =>
        sourceId === "terrain-source" && terrainSourceAdded
          ? { id: sourceId }
          : undefined
      ),
      isStyleLoaded: vi.fn(() => true),
      addSource: vi.fn((sourceId: string) => {
        if (sourceId === "terrain-source") terrainSourceAdded = true;
      }),
      setTerrain: vi.fn((next: typeof terrain) => {
        terrain = next;
      }),
      getStyle: vi.fn(() => ({ layers })),
      getLayer: vi.fn((layerId: string) =>
        layers.find(({ id }) => id === layerId)
      ),
      addLayer: vi.fn((layer: (typeof layers)[number]) => {
        layers.unshift(layer);
      }),
      removeLayer: vi.fn((layerId: string) => {
        const index = layers.findIndex(({ id }) => id === layerId);
        if (index >= 0) layers.splice(index, 1);
      }),
      getPaintProperty: vi.fn((layerId: string, property: string) =>
        paint.get(`${layerId}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          paint.set(`${layerId}:${property}`, value);
        }
      ),
      getLayoutProperty: vi.fn((layerId: string, property: string) =>
        layout.get(`${layerId}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          if (value == null) layout.delete(`${layerId}:${property}`);
          else layout.set(`${layerId}:${property}`, value);
        }
      ),
      on: vi.fn((event: string, handler: Handler) => {
        const listeners = handlers.get(event) ?? new Set<Handler>();
        listeners.add(handler);
        handlers.set(event, listeners);
      }),
      off: vi.fn(),
    };

    let drapeMode: "opaque" | "labels" = "labels";
    const release = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE,
      () => true,
      () => drapeMode
    );

    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(map.addSource).toHaveBeenCalledWith(
      "terrain-source",
      expect.objectContaining({
        type: "raster-dem",
        tiles: [TEST_TERRAIN_SOURCE.url],
        encoding: "terrarium",
      })
    );
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    // Hiding fills and strokes is the registry's job; the scene leaves the
    // authored visibilities and opacities alone in labels mode.
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("road-labels:visibility")).toBe(false);
    expect(layout.has("three:visibility")).toBe(false);
    expect(paint.get("basemap:raster-opacity")).toBe(0.9);

    // The mesh leaves the scene: the opaque basemap drape takes over again.
    drapeMode = "opaque";
    release.refresh();
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("basemap:visibility")).toBe(false);
    expect(paint.get("basemap:raster-opacity")).toBe(1);
    expect(layers[0]).toMatchObject({ id: "carma-shadow-map-style-base" });

    drapeMode = "labels";
    release.refresh();
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    expect(paint.get("basemap:raster-opacity")).toBe(0.9);
    expect(layout.get("roads:visibility")).toBe("visible");

    release();
    expect(layout.get("roads:visibility")).toBe("visible");
    expect(layout.has("basemap:visibility")).toBe(false);
  });
  it("keeps the native terrain enabled and restores the previous setting", () => {
    type Handler = () => void;
    const handlers = new Map<string, Set<Handler>>();
    const previousTerrain = { source: "previous-terrain", exaggeration: 0.75 };
    let terrain: typeof previousTerrain | null = previousTerrain;
    const terrainRuntime = {
      getMeshFrameDelta: vi.fn(() => 42),
    };
    const sources = new Set(["terrain-source", "previous-terrain"]);
    const layers = [
      {
        id: "basemap",
        type: "raster",
        source: "basemap-source",
      },
      { id: "landcover", type: "fill", source: "vector-source" },
      { id: "terrain-shading", type: "hillshade", source: "terrain-source" },
      { id: "terrain-relief", type: "color-relief", source: "terrain-source" },
      {
        id: "bg-basemap_relief::Schummerung_Col",
        type: "raster",
        source: "bg-basemap_relief::schummerung_col",
      },
      {
        id: "bg-basemap_relief::Schummerung_Comb",
        type: "raster",
        source: "bg-basemap_relief::schummerung_comb",
      },
      { id: "roads", type: "line", source: "vector-source" },
    ];
    const paint = new Map([
      ["basemap:raster-opacity", 0.9],
      ["landcover:fill-opacity", 0.6],
      ["bg-basemap_relief::Schummerung_Col:raster-opacity", 0.8],
      ["bg-basemap_relief::Schummerung_Comb:raster-opacity", 0.5],
    ]);
    const layout = new Map([
      ["terrain-shading:visibility", "visible"],
      ["terrain-relief:visibility", "visible"],
      ["bg-basemap_relief::Schummerung_Col:visibility", "visible"],
      ["bg-basemap_relief::Schummerung_Comb:visibility", "visible"],
    ]);
    const map = {
      terrain: terrainRuntime,
      getTerrain: vi.fn(() => terrain),
      getSource: vi.fn((sourceId: string) =>
        sources.has(sourceId) ? { id: sourceId } : undefined
      ),
      setTerrain: vi.fn((nextTerrain: typeof terrain) => {
        terrain = nextTerrain;
        for (const handler of handlers.get("terrain") ?? []) handler();
      }),
      getStyle: vi.fn(() => ({ layers })),
      getLayer: vi.fn((layerId: string) =>
        layers.find(({ id }) => id === layerId)
      ),
      addLayer: vi.fn((layer: (typeof layers)[number], beforeId?: string) => {
        const index = beforeId
          ? layers.findIndex(({ id }) => id === beforeId)
          : layers.length;
        layers.splice(index < 0 ? layers.length : index, 0, layer);
      }),
      removeLayer: vi.fn((layerId: string) => {
        const index = layers.findIndex(({ id }) => id === layerId);
        if (index >= 0) layers.splice(index, 1);
      }),
      getPaintProperty: vi.fn((layerId: string, property: string) =>
        paint.get(`${layerId}:${property}`)
      ),
      setPaintProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          paint.set(`${layerId}:${property}`, value as number);
        }
      ),
      getLayoutProperty: vi.fn((layerId: string, property: string) =>
        layout.get(`${layerId}:${property}`)
      ),
      setLayoutProperty: vi.fn(
        (layerId: string, property: string, value: unknown) => {
          layout.set(`${layerId}:${property}`, value as string);
        }
      ),
      on: vi.fn((event: string, handler: Handler) => {
        const listeners = handlers.get(event) ?? new Set<Handler>();
        listeners.add(handler);
        handlers.set(event, listeners);
      }),
      off: vi.fn((event: string, handler: Handler) => {
        handlers.get(event)?.delete(handler);
      }),
    };

    let mapStyleContentVisible = true;
    const release = acquireShadowMapLibreTerrain(
      map as never,
      TEST_TERRAIN_SOURCE,
      () => mapStyleContentVisible
    );

    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    expect(terrainRuntime.getMeshFrameDelta(15)).toBe(0);
    expect(layers[0]).toMatchObject({
      id: "carma-shadow-map-style-base",
      type: "background",
    });
    expect(paint.get("basemap:raster-opacity")).toBe(1);
    expect(paint.get("landcover:fill-opacity")).toBe(1);
    expect(layout.get("terrain-shading:visibility")).toBe("none");
    expect(layout.get("terrain-relief:visibility")).toBe("none");
    expect(layout.get("bg-basemap_relief::Schummerung_Col:visibility")).toBe(
      "none"
    );
    expect(layout.get("bg-basemap_relief::Schummerung_Comb:visibility")).toBe(
      "none"
    );
    expect(paint.has("roads:line-opacity")).toBe(false);
    terrain = null;
    for (const handler of handlers.get("terrain") ?? []) handler();
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    mapStyleContentVisible = false;
    paint.set("basemap:raster-opacity", 0.75);
    const paintUpdateCount = map.setPaintProperty.mock.calls.length;
    for (const handler of handlers.get("styledata") ?? []) handler();
    expect(paint.get("basemap:raster-opacity")).toBe(0.75);
    expect(map.setPaintProperty).toHaveBeenCalledTimes(paintUpdateCount);
    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
    mapStyleContentVisible = true;
    for (const handler of handlers.get("styledata") ?? []) handler();
    expect(paint.get("basemap:raster-opacity")).toBe(1);

    release();

    expect(terrain).toEqual(previousTerrain);
    expect(terrainRuntime.getMeshFrameDelta(15)).toBe(42);
    expect(layers.some(({ id }) => id === "carma-shadow-map-style-base")).toBe(
      false
    );
    expect(paint.get("basemap:raster-opacity")).toBe(0.75);
    expect(paint.get("landcover:fill-opacity")).toBe(0.6);
    expect(layout.get("terrain-shading:visibility")).toBe("visible");
    expect(layout.get("terrain-relief:visibility")).toBe("visible");
    expect(layout.get("bg-basemap_relief::Schummerung_Col:visibility")).toBe(
      "visible"
    );
    expect(layout.get("bg-basemap_relief::Schummerung_Comb:visibility")).toBe(
      "visible"
    );
    expect(map.off).toHaveBeenCalledWith("styledata", expect.any(Function));
    expect(map.off).toHaveBeenCalledWith("terrain", expect.any(Function));
  });
});

describe("shadow scene lighting integration", () => {
  const releaseScene = vi.fn();
  const setLocationLabelColor = vi.fn();
  const setPointLabelOverlayVisible = vi.fn();
  const setMapStyleProjectionVisible = vi.fn();
  let scene: THREE.Scene;
  type SharedRuntimeFixture = {
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
  let sharedRuntimes: Map<string, SharedRuntimeFixture>;
  let accumulationController: Parameters<
    SharedThreeSceneLayer["setAccumulationController"]
  >[0];
  let sharedLayer: {
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
    sharedRuntimes = new Map();
    accumulationController = null;
    sharedLayer = {
      getScene: () => scene,
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
    vi.restoreAllMocks();
  });

  const updateShadows = (
    map: unknown,
    camera: THREE.PerspectiveCamera,
    lookTarget = new THREE.Vector3()
  ) => {
    const runtime = sharedRuntimes.get("shadow-simulation-controller");
    expect(runtime?.update).toBeTypeOf("function");
    runtime?.update?.({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget,
      viewport: new THREE.Vector2(800, 600),
    });
  };

  const createIdleTerrainHost = async (
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
    const map = {
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
      .mockImplementation(() => undefined);
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
        .mockImplementation(() => undefined);
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
      .mockImplementation(() => undefined);
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
    expect(accumulation.renderProgressive?.(camera, nativeFrame)).toBeNull();
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    updateShadows(map, camera);
    expect(accumulation.visualEpoch()).toBeGreaterThan(epoch);
    expect(accumulation.renderScene?.(camera, 7)).toBe(true);
    expect(renderTiled).toHaveBeenLastCalledWith(camera, 7, 512);
    const directPasses = renderTiled.mock.calls.length;
    expect(accumulation.renderProgressive?.(camera, nativeFrame)).toBe(
      progressiveResult
    );
    expect(renderProgressive).toHaveBeenLastCalledWith(camera, {
      ...nativeFrame,
      samples: 512,
      maxRenderTargetPixels: Infinity,
      options: { format: "rgba16f-32f", msaaSamples: 0 },
    });
    expect(renderTiled).toHaveBeenCalledTimes(directPasses);
    expect(sharedRuntimes.size).toBe(runtimeCount);
    expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(1);
    expect(accumulation.renderScene?.(camera, null)).toBe(true);
    expect(renderTiled).toHaveBeenLastCalledWith(camera, null, 512);
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

  it("adapts tiled depth demand during slow motion without resizing or replacing the native view", () => {
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
    let nowMs = 0;
    const performanceNow = vi
      .spyOn(performance, "now")
      .mockImplementation(() => nowMs);
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
      };
      const runtime = sharedRuntimes.get("shadow-simulation-controller")!;
      const accumulation = accumulationController!;
      const renderFrame = () => {
        const updateCount = updateTiled.mock.calls.length;
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
        expect(updateTiled).toHaveBeenCalledTimes(updateCount + 1);
        expect(renderTiled).toHaveBeenCalledTimes(renderCount + 1);
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
      const advanceMotion = (frames: number, frameMs: number) => {
        for (let index = 0; index < frames; index += 1) {
          nowMs += frameMs;
          move();
          renderFrame();
        }
      };
      const runtimeCount = sharedRuntimes.size;
      renderFrame();
      expect(updateTiled).toHaveBeenCalledOnce();
      expect(renderTiled).toHaveBeenCalledOnce();
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);

      moveStart();
      renderFrame();
      advanceMotion(10, 50);
      expect(updateTiled.mock.lastCall?.[3]).toBeCloseTo(0.5 / 0.75);
      // A useful trial improves throughput enough to permit a second step.
      advanceMotion(12, 45);
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5 / 0.5);

      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowAdaptiveQuality: false,
      });
      renderFrame();
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);
      advanceMotion(12, 50);
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);

      controller.updateRenderQuality({
        shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
        shadowAdaptiveQuality: true,
      });
      renderFrame();
      advanceMotion(10, 50);
      expect(updateTiled.mock.lastCall?.[3]).toBeCloseTo(0.5 / 0.75);
      moveEnd();
      renderFrame();
      expect(updateTiled.mock.lastCall?.[3]).toBe(0.5);

      for (const [, actualFrame] of updateTiled.mock.calls) {
        expect(actualFrame).toBe(frame);
        expect(actualFrame.viewport).toBe(viewport);
        expect(actualFrame.viewport.toArray()).toEqual([2560, 1440]);
      }
      expect(renderTiled).toHaveBeenCalledTimes(updateTiled.mock.calls.length);
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
      performanceNow.mockRestore();
      updateTiled.mockRestore();
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
      .mockImplementation(() => undefined);
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
    expect(accumulation.rounds).toBe(512);
    // Tiled ownership is native-pixel / opaque until per-sample receiver
    // coverage exists. The mono strategy retains its requested geometry MSAA.
    expect(initialOptions).toEqual({ format: "rgba16f-32f", msaaSamples: 0 });

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
    expect(accumulation.rounds).toBe(128);
    controller.dispose();
  });

  it("drives MapLibre and the Three.js sun from the same solar position", async () => {
    const performanceNow = vi.spyOn(performance, "now").mockReturnValue(100);
    const evaluateAtmosphere = vi.spyOn(
      AtmosphericSunlightEvaluator.prototype,
      "evaluate"
    );
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const setLight = vi.fn();
    let mapCenter = { lng: 7.15, lat: 51.256 };
    const map = {
      getCenter: vi.fn(() => mapCenter),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: 7.15 + (x / 800 - 0.5) * 0.02,
        lat: 51.256 + (0.5 - y / 600) * 0.02,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight,
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const controller = buildShadowSimulationScene(map as never);
    const solarPosition = {
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    };
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    controller.updateSolarPosition(solarPosition);
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 4_000, 51_256);
    camera.lookAt(7_150, 0, 51_256);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);

    expect(evaluateAtmosphere.mock.lastCall?.[1].altitudeMeters).toBe(100);
    expect(evaluateAtmosphere.mock.lastCall?.[3]?.observer).toEqual({
      longitude: 7.15,
      latitude: 51.256,
      altitudeMeters: 0,
    });
    expect(
      evaluateAtmosphere.mock.lastCall?.[3]?.scenePosition.toArray()
    ).toEqual([7_150, 100, 51_256]);
    const atmosphericSky = scene.getObjectByName(
      ATMOSPHERIC_SKY_NAME
    ) as THREE.Mesh<THREE.BufferGeometry, SkyMaterial>;
    atmosphericSky.material.copyCameraSettings(camera);
    expect(
      (
        atmosphericSky.material.uniforms.cameraPosition.value as THREE.Vector3
      ).toArray()
    ).toEqual([7_150, 4_100, 51_256]);

    camera.position.set(9_000, 4_500, 48_000);
    camera.lookAt(9_000, 500, 48_000);
    camera.updateMatrixWorld(true);
    updateShadows(map, camera, new THREE.Vector3(9_000, 500, 48_000));
    atmosphericSky.material.copyCameraSettings(camera);
    expect(
      (
        atmosphericSky.material.uniforms.cameraPosition.value as THREE.Vector3
      ).toArray()
    ).toEqual([7_150, 4_100, 51_256]);

    const atmosphere = evaluateAtmosphericSunlight(
      solarPosition.instant,
      { longitude: 7.15, latitude: 51.256, altitudeMeters: 100 },
      null
    );

    expect(acquireSharedThreeScene).toHaveBeenCalledWith(map);
    expect(setLight).toHaveBeenLastCalledWith(
      expect.objectContaining({
        anchor: "map",
        position: [
          1.5,
          atmosphere.azimuthDegrees,
          90 - atmosphere.elevationDegrees,
        ],
        color: `#${atmosphere.color.getHexString()}`,
      })
    );
    expect(setLocationLabelColor).toHaveBeenLastCalledWith(
      `#${atmosphere.color.getHexString()}`
    );
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
    const defaultSunIntensity = sun.intensity;
    const defaultMapIntensity = setLight.mock.lastCall?.[0].intensity as number;
    const mapLightUpdateCount = setLight.mock.calls.length;
    controller.updateShadowIntensity(1);
    expect(sun.intensity).toBe(defaultSunIntensity);
    expect(setLight).toHaveBeenCalledTimes(mapLightUpdateCount);
    expect(setLight.mock.lastCall?.[0].intensity).toBe(defaultMapIntensity);
    expect(sun.isDirectionalLight).toBe(true);
    expect(sun.shadow.camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(sun.shadow.camera.projectionMatrix.elements[11]).toBe(0);
    expect(sun.shadow.camera.projectionMatrix.elements[15]).toBe(1);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.autoUpdate).toBe(false);
    expect(sun.shadow.radius).toBe(0);
    const shadowLights = scene.children.filter(
      (object): object is THREE.DirectionalLight =>
        (object as THREE.DirectionalLight).isDirectionalLight &&
        object.name.startsWith("shadow-simulation-sun")
    );
    expect(shadowLights).toHaveLength(1);
    expect(shadowLights.every((light) => light.shadow.intensity === 1)).toBe(
      true
    );
    expect(
      sun.position
        .clone()
        .sub(sun.target.position)
        .normalize()
        .dot(atmosphere.directionToSun)
    ).toBeCloseTo(1, 10);
    const lightDirection = sun.position
      .clone()
      .sub(sun.target.position)
      .normalize();
    const translatedRay = sun.position
      .clone()
      .add(new THREE.Vector3(1_000, -300, 500))
      .sub(sun.target.position.clone().add(new THREE.Vector3(1_000, -300, 500)))
      .normalize();
    expect(translatedRay.dot(lightDirection)).toBeCloseTo(1);
    const shadowRayDirections = [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ].map(([x, y]) => {
      const near = new THREE.Vector3(x, y, -1).unproject(sun.shadow.camera);
      const far = new THREE.Vector3(x, y, 1).unproject(sun.shadow.camera);
      return far.sub(near).normalize();
    });
    for (const shadowRayDirection of shadowRayDirections.slice(1)) {
      expect(shadowRayDirection.dot(shadowRayDirections[0])).toBeCloseTo(1);
    }
    expect(map.on).toHaveBeenCalledWith(
      MAPLIBRE_EVENT.STYLE_LOAD,
      expect.any(Function)
    );
    controller.updateSunDebugVectorVisibility(true);
    controller.updateSunDebugVectorVisibility(false);
    await vi.dynamicImportSettled();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
    controller.updateSunDebugVectorVisibility(true);
    await vi.dynamicImportSettled();
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
    const vectorDirection = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(sunVector.quaternion)
      .normalize();
    expect(sunVector.visible).toBe(true);
    expect(sunVector.position).toEqual(sun.target.position);
    expect(vectorDirection.dot(lightDirection)).toBeCloseTo(1);
    expect(sunVector.cone.castShadow).toBe(false);
    expect(sunVector.cone.receiveShadow).toBe(false);
    expect((sunVector.cone.material as THREE.Material).depthTest).toBe(false);
    expect((sunVector.cone.material as THREE.Material).depthWrite).toBe(false);
    expect((sunVector.cone.material as THREE.Material).transparent).toBe(true);
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector-shaft")
    ).toBeDefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector-ground-ray")
    ).toBeDefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector-elevation-arc")
    ).toBeDefined();
    const centeredSunPosition = sun.position.clone();
    accumulationController?.prepareRound(1);
    expect(sun.position.equals(centeredSunPosition)).toBe(false);

    mapCenter = { lng: 7.2, lat: 51.3 };
    controller.updateSolarPosition({
      ...solarPosition,
      instant: new Date("2026-06-21T10:01:00Z"),
    });
    expect(
      evaluateAtmosphere.mock.lastCall?.[3]?.scenePosition.toArray()
    ).toEqual([7_150, 100, 51_256]);

    const moveStart = map.on.mock.calls.find(
      ([eventName]) => eventName === MAPLIBRE_EVENT.MOVE_START
    )?.[1] as () => void;
    const moveEnd = map.on.mock.calls.find(
      ([eventName]) => eventName === MAPLIBRE_EVENT.MOVE_END
    )?.[1] as () => void;
    const movingMapStyleUpdateCount = setLight.mock.calls.length;
    const movingLabelUpdateCount = setLocationLabelColor.mock.calls.length;
    moveStart();
    for (const [nowMs, altitude] of [
      [120, 4_600],
      [140, 4_700],
    ]) {
      performanceNow.mockReturnValue(nowMs);
      camera.position.y = altitude;
      camera.updateMatrixWorld(true);
      updateShadows(map, camera);
    }
    expect(setLight).toHaveBeenCalledTimes(movingMapStyleUpdateCount);
    expect(setLocationLabelColor).toHaveBeenCalledTimes(movingLabelUpdateCount);
    expect(evaluateAtmosphere.mock.lastCall?.[1].altitudeMeters).toBe(100);
    const movingSample = evaluateAtmosphere.mock.results.at(-1)?.value;
    expect(sun.color.equals(movingSample.radiance)).toBe(true);

    performanceNow.mockReturnValue(1_200);
    camera.position.y = 4_800;
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    expect(setLight).toHaveBeenCalledTimes(movingMapStyleUpdateCount);

    performanceNow.mockReturnValue(1_220);
    camera.position.y = 4_900;
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    expect(setLight).toHaveBeenCalledTimes(movingMapStyleUpdateCount);
    moveEnd();
    expect(setLight).toHaveBeenCalledTimes(movingMapStyleUpdateCount + 1);
    expect(setLocationLabelColor).toHaveBeenCalledTimes(
      movingLabelUpdateCount + 1
    );
    const finalMotionSample = evaluateAtmosphere.mock.results.at(-1)?.value;
    expect(setLight.mock.lastCall?.[0].color).toBe(
      `#${finalMotionSample.color.getHexString()}`
    );
    expect(setLocationLabelColor).toHaveBeenLastCalledWith(
      `#${finalMotionSample.color.getHexString()}`
    );

    const animatedMapStyleUpdateCount = setLight.mock.calls.length;
    controller.updateTimeAnimating(true);
    controller.updateSolarPosition({
      ...solarPosition,
      instant: new Date("2026-06-21T10:02:00Z"),
    });
    controller.updateSolarPosition({
      ...solarPosition,
      instant: new Date("2026-06-21T10:03:00Z"),
    });
    expect(setLight).toHaveBeenCalledTimes(animatedMapStyleUpdateCount);
    controller.updateTimeAnimating(false);
    expect(setLight).toHaveBeenCalledTimes(animatedMapStyleUpdateCount + 1);

    const restoreMapContent = vi.fn();
    vi.mocked(suppressMapLibreRegularStyleLayers).mockReturnValueOnce(
      restoreMapContent
    );
    controller.updateMapStyleContentVisibility(false);
    expect(suppressMapLibreRegularStyleLayers).toHaveBeenCalledWith(map);
    expect(setMapStyleProjectionVisible).toHaveBeenLastCalledWith(false);
    controller.updateMapStyleContentVisibility(true);
    expect(restoreMapContent).toHaveBeenCalledOnce();
    expect(setMapStyleProjectionVisible).toHaveBeenLastCalledWith(true);
    controller.updateMapStyleLabelOverlayVisibility(false);
    expect(setPointLabelOverlayVisible).toHaveBeenLastCalledWith(false);
    controller.updateMapStyleLabelOverlayVisibility(true);
    expect(setPointLabelOverlayVisible).toHaveBeenLastCalledWith(true);

    const disposeVector = vi.spyOn(sunVector, "dispose");
    controller.updateSunDebugVectorVisibility(false);
    expect(disposeVector).toHaveBeenCalledOnce();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
    // An import completing after scene disposal must not recreate diagnostics.
    controller.updateSunDebugVectorVisibility(true);
    controller.dispose();
    await vi.dynamicImportSettled();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
    expect(releaseScene).toHaveBeenCalledOnce();
    evaluateAtmosphere.mockRestore();
    performanceNow.mockRestore();
  });

  it("keeps corridor refinement independent of terrain loading while mono waits for coverage", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const setShadowView = vi.fn();
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "buildings",
        originLngLat: [7.15, 51.256],
        root: new THREE.Group(),
        update: vi.fn(),
        setShadowView,
        getRequestDemand: () => 1,
        getActiveTileVolumes: () => [
          {
            id: "mesh-2024/root/tile-1",
            kind: "tiles3d" as const,
            minimum: [6_650, 0, 50_756] as const,
            maximum: [7_650, 200, 51_756] as const,
          },
        ],
        dispose: vi.fn(),
      },
    ]);
    const mapHandlers = new Map<string, () => void>();
    let mapCenter = { lng: 7.15, lat: 51.256 };
    const map = {
      getCenter: vi.fn(() => mapCenter),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: mapCenter.lng + (x / 800 - 0.5) * 0.02,
        lat: mapCenter.lat + (0.5 - y / 600) * 0.02,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn((event: string, handler: () => void) => {
        mapHandlers.set(event, handler);
      }),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const controller = buildShadowSimulationScene(map as never);
    controller.updateAtmosphericLutUsage({
      useTransmittanceLut: false,
      useIrradianceLut: false,
    });
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 4_000, 51_256);
    camera.lookAt(7_150, 0, 51_256);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);

    expect(
      sharedRuntimes.get("shadow-simulation-controller")?.updatePriority
    ).toBe(200);
    const accumulation = accumulationController!;
    expect(accumulation.active()).toBe(true);
    expect(accumulation.retainSettledFrame()).toBe(true);
    const contentRuntimes = getSharedThreeSceneRuntimes(map as never);
    const isMainViewReady = vi.fn(() => false);
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      ...contentRuntimes,
      { providesTerrain: true, isMainViewReady } as never,
    ]);
    // Tiled integration gates each native corridor against its caster cut;
    // another unfinished main-view region must not stall all committed pages.
    expect(accumulation.active()).toBe(true);
    expect(accumulation.pending?.()).toBe(false);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    expect(accumulation.active()).toBe(false);
    expect(accumulation.pending?.()).toBe(true);
    expect(accumulation.retainSettledFrame()).toBe(true);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    isMainViewReady.mockReturnValue(true);
    expect(accumulation.active()).toBe(true);
    expect(accumulation.pending?.()).toBe(false);
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue(contentRuntimes);
    vi.mocked(isSharedThreeTerrainLoading).mockReturnValue(true);
    expect(accumulation.active()).toBe(true);
    expect(accumulation.pending?.()).toBe(false);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    expect(accumulation.active()).toBe(false);
    expect(accumulation.pending?.()).toBe(true);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    expect(accumulation.active()).toBe(true);
    // Keep any already shaded frame eligible while new receivers load.
    expect(accumulation.retainSettledFrame()).toBe(true);
    vi.mocked(isSharedThreeTerrainLoading).mockReturnValue(false);
    const repaintCount = map.triggerRepaint.mock.calls.length;
    vi.mocked(subscribeSharedThreeTerrainLoading).mock.lastCall?.[1]();
    expect(map.triggerRepaint).toHaveBeenCalledTimes(repaintCount + 1);
    expect(accumulation.active()).toBe(true);

    const settledShadowViewCallCount = setShadowView.mock.calls.length;
    mapHandlers.get("movestart")?.();
    mapCenter = { lng: 7.16, lat: 51.256 };
    camera.position.x += 100;
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    expect(setShadowView).toHaveBeenCalledTimes(settledShadowViewCallCount);
    mapHandlers.get("moveend")?.();
    updateShadows(map, camera);
    expect(setShadowView.mock.calls.length).toBeGreaterThan(
      settledShadowViewCallCount
    );

    const shadowViewBeforeAnimation = setShadowView.mock.lastCall?.[0];
    const shadowViewCallCount = setShadowView.mock.calls.length;
    controller.updateTimeAnimating(true);
    expect(accumulation.active()).toBe(false);
    expect(shadowViewBeforeAnimation).not.toBeNull();
    expect(setShadowView).toHaveBeenCalledTimes(shadowViewCallCount);
    controller.dispose();
  });

  it("moves ALKIS buildings into the shared terrain shadow scene", () => {
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshLambertMaterial()
    );
    terrain.name = "terrain";
    terrain.userData.isShadowTerrainSurface = true;
    scene.add(terrain);
    const openSurfaceMaterial = new THREE.MeshLambertMaterial();
    openSurfaceMaterial.shadowSide = THREE.FrontSide;
    const openSurface = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      openSurfaceMaterial
    );
    scene.add(openSurface);
    const alkisScene = new THREE.Scene();
    const sourceBuildingMaterial = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      opacity: 0.45,
      transparent: true,
      vertexColors: true,
    });
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10, 20, 10),
      sourceBuildingMaterial
    );
    building.name = "alkis-building";
    building.userData.isBuilding = true;
    alkisScene.add(building);
    vi.mocked(getGenericThreeLayers).mockReturnValue([
      {
        id: "3d-extrusion-alkis",
        scene: alkisScene,
        _originMerc: { toLngLat: () => ({ lng: 7.15, lat: 51.256 }) },
      } as never,
    ]);
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    controller.updateSunDebugVectorVisibility(true);

    const buildingCopy = scene.getObjectByName(
      "alkis-building-shadow-simulation-copy"
    ) as THREE.Mesh;
    expect(building.visible).toBe(false);
    expect(buildingCopy.castShadow).toBe(true);
    expect(buildingCopy.receiveShadow).toBe(true);
    expect(buildingCopy.material).not.toBe(sourceBuildingMaterial);
    expect((buildingCopy.material as THREE.Material).opacity).toBe(1);
    expect((buildingCopy.material as THREE.Material).transparent).toBe(false);
    expect((buildingCopy.material as THREE.Material).shadowSide).toBe(
      THREE.DoubleSide
    );
    expect(terrain.castShadow).toBe(true);
    expect(terrain.receiveShadow).toBe(true);
    expect((terrain.material as THREE.Material).shadowSide).toBeNull();
    expect(openSurfaceMaterial.shadowSide).toBe(THREE.FrontSide);
    expect(terrain.customDepthMaterial).toBeUndefined();
    expect(buildingCopy.parent?.parent).toBe(scene);
    expect(terrain.parent).toBe(scene);

    controller.updateBuildingAppearance({
      fullOpacity: true,
      uniformColor: "#8c7a66",
    });
    const uniformCopy = scene.getObjectByName(
      "alkis-building-shadow-simulation-copy"
    ) as THREE.Mesh;
    const uniformMaterial = uniformCopy.material as THREE.MeshLambertMaterial;
    expect(uniformMaterial.color.getHexString()).toBe("8c7a66");
    expect(uniformMaterial.vertexColors).toBe(false);

    controller.updateBuildingAppearance({
      fullOpacity: false,
      uniformColor: null,
    });
    const styledCopy = scene.getObjectByName(
      "alkis-building-shadow-simulation-copy"
    ) as THREE.Mesh;
    const styledMaterial = styledCopy.material as THREE.MeshLambertMaterial;
    expect(styledMaterial.opacity).toBe(0.45);
    expect(styledMaterial.transparent).toBe(true);
    expect(styledMaterial.vertexColors).toBe(true);

    controller.dispose();
    expect(building.visible).toBe(true);
    expect(
      scene.getObjectByName("alkis-building-shadow-simulation-copy")
    ).toBeUndefined();
  });

  it("restyles registered building tiles only while shadow mode is active", () => {
    const setShadowSimulationStyle = vi.fn();
    const setErrorTarget = vi.fn();
    const setCacheBudget = vi.fn();
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        providesTerrain: true,
        setErrorTarget,
        setCacheBudget,
        setShadowSimulationStyle,
      } as never,
    ]);
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    expect(setShadowSimulationStyle).toHaveBeenLastCalledWith({
      fullOpacity: true,
      uniformColor: null,
      uniformColorMix: 0,
      textureSaturation: 1,
      textureColorCorrection: true,
    });
    expect(setErrorTarget).toHaveBeenLastCalledWith(
      DEFAULT_MESH_ERROR_TARGET_PIXELS
    );

    controller.updateMeshErrorTarget(0.25);
    expect(setErrorTarget).toHaveBeenLastCalledWith(0.25);
    controller.updateMeshCacheBudget(24 * 1024 ** 3);
    expect(setCacheBudget).toHaveBeenLastCalledWith(24 * 1024 ** 3);
    const calls = setCacheBudget.mock.calls.length;
    controller.updateMeshCacheBudget(24 * 1024 ** 3);
    expect(setCacheBudget).toHaveBeenCalledTimes(calls);

    controller.updateBuildingAppearance({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
    });
    expect(setShadowSimulationStyle).toHaveBeenLastCalledWith({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
    });

    controller.dispose();
    expect(setShadowSimulationStyle).toHaveBeenLastCalledWith(null);
  });

  it("keeps the full map viewport inside the shadow camera", async () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    let mapCenter = { lng: 0, lat: 0 };
    let viewportHalfWidth = 1;
    let viewportHalfHeight = 2;
    const viewportWidth = 800;
    const viewportHeight = 600;
    const getBounds = vi.fn(() => ({
      getWest: () => mapCenter.lng - viewportHalfWidth * 4,
      getSouth: () => mapCenter.lat - viewportHalfHeight * 4,
      getEast: () => mapCenter.lng + viewportHalfWidth * 4,
      getNorth: () => mapCenter.lat + viewportHalfHeight * 4,
    }));
    const map = {
      getCenter: vi.fn(() => mapCenter),
      getBounds,
      getCanvas: vi.fn(() => ({
        clientWidth: viewportWidth,
        clientHeight: viewportHeight,
      })),
      unproject: vi.fn(() => {
        throw new Error("Terrain picking must not run while fitting shadows");
      }),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    subscribeShadowProjectionDebugSnapshot(map as never, () => undefined);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    expect(readShadowProjectionDebugSnapshot(map as never)?.shadow).toBeFalsy();
    controller.updateSunDebugVectorVisibility(true);
    await vi.dynamicImportSettled();
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
    const updateAndExpectViewportInsideBuffer = () => {
      const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
      const cameraRange =
        Math.max(viewportHalfWidth, viewportHalfHeight) * 2_000;
      camera.position.set(
        mapCenter.lng * 1_000,
        cameraRange,
        mapCenter.lat * 1_000 + cameraRange
      );
      camera.lookAt(mapCenter.lng * 1_000, 0, mapCenter.lat * 1_000);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      controller.refreshProjectionDebug();
      updateShadows(map, camera);
      const lights = scene.children.filter(
        (object): object is THREE.DirectionalLight =>
          (object as THREE.DirectionalLight).isDirectionalLight &&
          object.name.startsWith("shadow-simulation-sun")
      );
      for (const [lng, lat] of [
        [mapCenter.lng - viewportHalfWidth, mapCenter.lat - viewportHalfHeight],
        [mapCenter.lng - viewportHalfWidth, mapCenter.lat + viewportHalfHeight],
        [mapCenter.lng + viewportHalfWidth, mapCenter.lat - viewportHalfHeight],
        [mapCenter.lng + viewportHalfWidth, mapCenter.lat + viewportHalfHeight],
      ]) {
        const worldPoint = new THREE.Vector3(lng * 1_000, 0, lat * 1_000);
        const contained = lights.some((light) => {
          const shadowCamera = light.shadow.camera;
          const cameraPoint = worldPoint
            .clone()
            .applyMatrix4(shadowCamera.matrixWorldInverse);
          return (
            cameraPoint.x >= shadowCamera.left - 1e-6 &&
            cameraPoint.x <= shadowCamera.right + 1e-6 &&
            cameraPoint.y >= shadowCamera.bottom - 1e-6 &&
            cameraPoint.y <= shadowCamera.top + 1e-6
          );
        });
        expect(contained).toBe(true);
      }
      const snapshot = readShadowProjectionDebugSnapshot(map as never);
      expect(snapshot?.shadow?.sampleCount).toBe(1);
      return snapshot?.shadow?.camera;
    };

    const wideViewportBuffer = updateAndExpectViewportInsideBuffer();
    expect(getBounds).not.toHaveBeenCalled();
    expect(map.unproject).not.toHaveBeenCalled();
    expect(sunVector.position.toArray()).toEqual([0, 0, 0]);
    const wideSunVectorLength = sunVector.cone.position.y;
    expect(wideSunVectorLength).toBeGreaterThan(0);
    expect(Number.isFinite(wideSunVectorLength)).toBe(true);
    expect(map.on).toHaveBeenCalledWith("move", expect.any(Function));

    mapCenter = { lng: 0.5, lat: 1 };
    const moveHandler = map.on.mock.calls.find(
      ([eventName]) => eventName === "move"
    )?.[1] as () => void;
    moveHandler();
    updateAndExpectViewportInsideBuffer();

    expect(sunVector.position.toArray()).toEqual([500, 0, 1_000]);
    expect(
      (
        scene.getObjectByName("shadow-simulation-sun") as THREE.DirectionalLight
      ).target.position.toArray()
    ).toEqual([500, 0, 1_000]);

    viewportHalfWidth = 0.05;
    viewportHalfHeight = 0.1;
    moveHandler();

    const zoomedViewportBuffer = updateAndExpectViewportInsideBuffer();
    expect(sunVector.cone.position.y).toBeLessThan(wideSunVectorLength);
    expect(
      (zoomedViewportBuffer?.rightMeters ?? 0) -
        (zoomedViewportBuffer?.leftMeters ?? 0)
    ).toBeLessThan(
      (wideViewportBuffer?.rightMeters ?? 0) -
        (wideViewportBuffer?.leftMeters ?? 0)
    );

    const resizeHandler = map.on.mock.calls.find(
      ([eventName]) => eventName === MAPLIBRE_EVENT.RESIZE
    )?.[1] as () => void;
    const moveEndHandler = map.on.mock.calls.find(
      ([eventName]) => eventName === MAPLIBRE_EVENT.MOVE_END
    )?.[1] as () => void;
    resizeHandler();
    updateAndExpectViewportInsideBuffer();
    moveEndHandler();
    controller.updateShadowQuality(SHADOW_QUALITY.FPS_60);
    updateAndExpectViewportInsideBuffer();
    expect(map.unproject).not.toHaveBeenCalled();

    controller.dispose();
  });

  it("fits loaded tile volumes instead of distant fallback ground points", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "mesh",
        root: new THREE.Group(),
        getActiveTileVolumes: () => [
          {
            id: "visible",
            kind: "tiles3d",
            minimum: [-100, 0, -100],
            maximum: [100, 200, 100],
          },
        ],
        dispose: vi.fn(),
      },
    ] as never);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: (x / 800 - 0.5) * 20,
        lat: (0.5 - y / 600) * 20,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    subscribeShadowProjectionDebugSnapshot(map as never, () => undefined);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(0, 500, 500);
    camera.lookAt(0, 100, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    updateShadows(map, camera);

    const shadowCamera = readShadowProjectionDebugSnapshot(map as never)?.shadow
      ?.camera;
    expect(
      (shadowCamera?.rightMeters ?? 0) - (shadowCamera?.leftMeters ?? 0)
    ).toBeLessThan(1_000);
    expect(
      (shadowCamera?.topMeters ?? 0) - (shadowCamera?.bottomMeters ?? 0)
    ).toBeLessThan(1_000);

    // Dragging must keep the real receiver volumes, not switch back to the
    // estimated ground envelope. The tiled colour pass clips to this coverage.
    const moveStart = map.on.mock.calls.find(
      ([event]) => event === MAPLIBRE_EVENT.MOVE_START
    )?.[1] as () => void;
    const clock = vi
      .spyOn(performance, "now")
      .mockReturnValue(performance.now() + 1_000);
    try {
      moveStart();
      updateShadows(map, camera);
      const movingCamera = readShadowProjectionDebugSnapshot(map as never)
        ?.shadow?.camera;
      expect(movingCamera?.leftMeters).toBeCloseTo(shadowCamera!.leftMeters, 5);
      expect(movingCamera?.rightMeters).toBeCloseTo(
        shadowCamera!.rightMeters,
        5
      );
      expect(movingCamera?.topMeters).toBeCloseTo(shadowCamera!.topMeters, 5);
      expect(movingCamera?.bottomMeters).toBeCloseTo(
        shadowCamera!.bottomMeters,
        5
      );
    } finally {
      clock.mockRestore();
    }

    controller.dispose();
  });

  it("fits the render-camera rays at both terrain elevation limits", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(() => ({ lng: 0, lat: 0 })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const terrain = new THREE.Mesh(
      new THREE.BoxGeometry(1_000, 200, 1_000),
      new THREE.MeshLambertMaterial()
    );
    terrain.position.y = 100;
    scene.add(terrain);

    const controller = buildShadowSimulationScene(map as never);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(55, 4 / 3, 1, 20_000);
    // This test covers the mono viewport envelope; tiled mode fits complete
    // committed source boxes rather than intersections of synthetic ground rays.
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    camera.position.set(0, 500, 500);
    camera.lookAt(0, 100, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    updateShadows(map, camera);

    const shadowCamera = (
      scene.getObjectByName("shadow-simulation-sun") as THREE.DirectionalLight
    ).shadow.camera;
    for (const [x, y] of [
      [-1, -1],
      [-1, 1],
      [1, -1],
      [1, 1],
    ] as const) {
      const nearPoint = new THREE.Vector3(x, y, -1).unproject(camera);
      const rayDirection = new THREE.Vector3(x, y, 1)
        .unproject(camera)
        .sub(nearPoint);
      for (const elevation of [0, 200]) {
        const receiver = nearPoint
          .clone()
          .addScaledVector(
            rayDirection,
            (elevation - nearPoint.y) / rayDirection.y
          );
        const clip = receiver
          .applyMatrix4(shadowCamera.matrixWorldInverse)
          .applyMatrix4(shadowCamera.projectionMatrix);
        expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
      }
    }

    controller.dispose();
    terrain.geometry.dispose();
    (terrain.material as THREE.Material).dispose();
  });

  it("keeps valid lower viewport rays when upper rays point above the terrain", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(() => ({ lng: 0, lat: 0 })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const terrain = new THREE.Mesh(
      new THREE.BoxGeometry(5_000, 200, 5_000),
      new THREE.MeshLambertMaterial()
    );
    terrain.position.y = 100;
    scene.add(terrain);

    const controller = buildShadowSimulationScene(map as never);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(0, 500, 500);
    camera.lookAt(0, 400, 0);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);

    updateShadows(map, camera);

    const shadowCamera = (
      scene.getObjectByName("shadow-simulation-sun") as THREE.DirectionalLight
    ).shadow.camera;
    for (const x of [-1, 1]) {
      const nearPoint = new THREE.Vector3(x, -1, -1).unproject(camera);
      const rayDirection = new THREE.Vector3(x, -1, 1)
        .unproject(camera)
        .sub(nearPoint);
      for (const elevation of [0, 200]) {
        const receiver = nearPoint
          .clone()
          .addScaledVector(
            rayDirection,
            (elevation - nearPoint.y) / rayDirection.y
          );
        const clip = receiver
          .applyMatrix4(shadowCamera.matrixWorldInverse)
          .applyMatrix4(shadowCamera.projectionMatrix);
        expect(Math.abs(clip.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.y)).toBeLessThanOrEqual(1);
        expect(Math.abs(clip.z)).toBeLessThanOrEqual(1);
      }
    }

    controller.dispose();
    terrain.geometry.dispose();
    (terrain.material as THREE.Material).dispose();
  });

  it("refits the direct shadow pass immediately when streamed content changes", () => {
    vi.stubGlobal("window", {
      clearTimeout,
      setTimeout,
    });
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    let contentChanged = () => undefined;
    vi.mocked(subscribeSharedThreeSceneContent).mockImplementation(
      (_map, listener) => {
        contentChanged = listener;
        return vi.fn();
      }
    );
    const setTerrainShadowView = vi.fn();
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        id: "terrain-provider",
        originLngLat: [0, 0],
        root: new THREE.Group(),
        providesTerrain: true,
        update: vi.fn(),
        setShadowView: setTerrainShadowView,
        dispose: vi.fn(),
      },
    ]);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: (x / 800 - 0.5) * 0.1,
        lat: (0.5 - y / 600) * 0.1,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };
    const controller = buildShadowSimulationScene(map as never);
    subscribeShadowProjectionDebugSnapshot(map as never, () => undefined);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(0, 1_000, 1_000);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    const initialTerrainShadowViewCalls =
      setTerrainShadowView.mock.calls.length;
    expect(
      readShadowProjectionDebugSnapshot(map as never)?.maximumElevationMeters
    ).toBeCloseTo(0);

    const buildingVolume = new THREE.Mesh(
      new THREE.BoxGeometry(100, 300, 100),
      new THREE.MeshLambertMaterial()
    );
    buildingVolume.position.y = 150;
    scene.add(buildingVolume);
    contentChanged();
    // The first draw must not wait for the 120 ms coverage debounce.
    expect(configureReceiverPlaneShadow(buildingVolume.material).value).toBe(
      true
    );
    controller.refreshProjectionDebug();
    updateShadows(map, camera);

    expect(map.unproject).not.toHaveBeenCalled();
    expect(
      readShadowProjectionDebugSnapshot(map as never)?.maximumElevationMeters
    ).toBeGreaterThanOrEqual(300);
    expect(setTerrainShadowView).toHaveBeenCalledTimes(
      initialTerrainShadowViewCalls
    );

    controller.dispose();
    buildingVolume.geometry.dispose();
    (buildingVolume.material as THREE.Material).dispose();
    vi.unstubAllGlobals();
  });

  it("includes visible elevation relief when fitting the viewport", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const elevatedReceiver = new THREE.Mesh(
      new THREE.BoxGeometry(1, 300, 1),
      new THREE.MeshLambertMaterial()
    );
    elevatedReceiver.position.y = 150;
    scene.add(elevatedReceiver);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: (x / 800 - 0.5) * 0.1,
        lat: (0.5 - y / 600) * 0.2,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    subscribeShadowProjectionDebugSnapshot(map as never, () => undefined);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(0, 4_000, 4_000);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
    const snapshot = readShadowProjectionDebugSnapshot(map as never);

    expect(snapshot?.maximumElevationMeters).toBeGreaterThanOrEqual(300);
    expect(snapshot?.minimumElevationMeters).toBeLessThanOrEqual(0);
    expect(snapshot?.shadow?.casterReachMeters).toBeGreaterThan(300);

    controller.dispose();
    elevatedReceiver.geometry.dispose();
    (elevatedReceiver.material as THREE.Material).dispose();
  });

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

    expect(sharedRuntimes.has(initialTerrain.id)).toBe(false);
    expect(initialTerrain.dispose).toHaveBeenCalledOnce();

    expect(sharedLayer.setAccumulationController).toHaveBeenCalledWith(null);
    const resetCalls = vi.mocked(sharedLayer.setAccumulationController).mock
      .calls.length;

    meshRenderable = true;
    contentChanged();
    expect(sharedLayer.setAccumulationController).toHaveBeenCalledTimes(
      resetCalls
    );

    expect(sharedRuntimes.has(initialTerrain.id)).toBe(false);
    expect(initialTerrain.dispose).toHaveBeenCalledOnce();

    controller.updateTerrainColor("#8c7a66");

    activeContentRuntimes.length = 0;
    contentChanged();
    await restoredTerrain.ready;

    expect(buildRasterDemTerrainRuntime).toHaveBeenCalledTimes(2);
    expect(sharedRuntimes.get(restoredTerrain.id)).toBe(restoredTerrain);
    expect(restoredTerrain.setMaterialColor).toHaveBeenCalled();

    controller.dispose();
    vi.unstubAllGlobals();
  });
});

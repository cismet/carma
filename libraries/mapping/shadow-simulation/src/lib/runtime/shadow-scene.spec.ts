// @vitest-environment node

import * as THREE from "three";
import { SkyMaterial } from "@takram/three-atmosphere";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  WUPPERTAL_TERRAIN_SOURCE_ID: "terrain-source",
  acquireSharedThreeScene: vi.fn(),
  buildCesiumTerrainRuntime: vi.fn(),
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
  isMapStyleContourLineLayer: (layer: {
    type?: string;
    id?: string;
    "source-layer"?: string;
  }) =>
    layer.type === "line" &&
    /hoehenlinie/i.test(`${layer.id}:${layer["source-layer"]}`),
  suppressMapLibreRegularStyleLayers: vi.fn(() => vi.fn()),
}));

import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  suppressMapLibreRegularStyleLayers,
} from "@carma-mapping/engines/maplibre";

import {
  acquireShadowMapLibreTerrain,
  buildShadowSimulationScene,
  solarPositionToSceneDirection,
} from "./shadow-scene";
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
import { DEFAULT_MESH_ERROR_TARGET_PIXELS } from "../core/shadow-types";

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
      timeZone: "Europe/Berlin",
    };
    const daylight = getDaylightWindow(2026, 172, location);
    const solarPosition = getSolarPosition(
      {
        year: 2026,
        dayOfYear: 172,
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
        sourceId === "terrain-source" ? { id: sourceId } : undefined
      ),
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
      "terrain-source",
      () => true,
      () => drapeMode
    );

    expect(terrain).toEqual({ source: "terrain-source", exaggeration: 1 });
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
      "terrain-source",
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
  let accumulationController: {
    active: () => boolean;
    retainSettledFrame: () => boolean;
    prepareRound: (round: number) => void;
    finishRound?: () => void;
    rounds: number;
  } | null;
  let sharedLayer: {
    getScene: () => THREE.Scene;
    addRuntime: (runtime: SharedRuntimeFixture) => void;
    hasRuntime: (runtimeId: string) => boolean;
    removeRuntime: (runtimeId: string) => void;
    getRenderer: () => THREE.WebGLRenderer | null;
    setAccumulationController: (
      controller: {
        active: () => boolean;
        retainSettledFrame: () => boolean;
        prepareRound: (round: number) => void;
        finishRound?: () => void;
        rounds: number;
      } | null
    ) => void;
    setMapStyleProjectionVisible: (visible: boolean) => void;
    projectLngLatToScene?: (
      lngLat: [number, number],
      altitude?: number
    ) => THREE.Vector3;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scene = new THREE.Scene();
    sharedRuntimes = new Map();
    accumulationController = null;
    sharedLayer = {
      getScene: () => scene,
      getRenderer: () => null,
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
    vi.mocked(acquireSharedThreeScene).mockReturnValue({
      layer: sharedLayer as never,
      setLocationLabelColor,
      setPointLabelOverlayVisible,
      setMeshLabelStyle: vi.fn(),
      release: releaseScene,
    });
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

  it("drives MapLibre and the Three.js sun from the same solar position", () => {
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

    controller.updateSolarPosition(solarPosition);
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 4_000, 51_256);
    camera.lookAt(7_150, 0, 51_256);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);

    expect(evaluateAtmosphere.mock.lastCall?.[1].altitudeMeters).toBe(4_100);
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
      { longitude: 7.15, latitude: 51.256, altitudeMeters: 4_100 },
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
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
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
    const vectorDirection = new THREE.Vector3(0, 1, 0)
      .applyQuaternion(sunVector.quaternion)
      .normalize();
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
    expect(sunVector.visible).toBe(false);
    expect(map.on).toHaveBeenCalledWith("style.load", expect.any(Function));
    controller.updateSunDebugVectorVisibility(true);
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

    controller.dispose();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
    expect(releaseScene).toHaveBeenCalledOnce();
    evaluateAtmosphere.mockRestore();
    performanceNow.mockRestore();
  });

  it("keeps sun-disc accumulation active while tiles are streaming", () => {
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
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        providesTerrain: true,
        setErrorTarget,
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
    });
    expect(setErrorTarget).toHaveBeenLastCalledWith(
      DEFAULT_MESH_ERROR_TARGET_PIXELS
    );

    controller.updateMeshErrorTarget(0.25);
    expect(setErrorTarget).toHaveBeenLastCalledWith(0.25);

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

  it("keeps the full map viewport inside the shadow camera", () => {
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
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: mapCenter.lng + (x / viewportWidth - 0.5) * viewportHalfWidth * 2,
        lat:
          mapCenter.lat + (0.5 - y / viewportHeight) * viewportHalfHeight * 2,
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
    expect(sunVector.position.toArray()).toEqual([0, 0, 0]);
    expect(sunVector.cone.position.y).toBeCloseTo(1_000);
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
    expect(
      (zoomedViewportBuffer?.rightMeters ?? 0) -
        (zoomedViewportBuffer?.leftMeters ?? 0)
    ).toBeLessThan(
      (wideViewportBuffer?.rightMeters ?? 0) -
        (wideViewportBuffer?.leftMeters ?? 0)
    );

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
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    updateShadows(map, camera);
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
    updateShadows(map, camera);

    expect(
      readShadowProjectionDebugSnapshot(map as never)?.maximumElevationMeters
    ).toBeGreaterThanOrEqual(300);

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

  it("adds configured Cesium terrain to the shared scene", async () => {
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
      dispose: vi.fn(),
    };
    vi.mocked(buildCesiumTerrainRuntime).mockReturnValue(terrainRuntime);
    const addRuntime = vi.fn();
    const removeRuntime = vi.fn();
    vi.mocked(acquireSharedThreeScene).mockReturnValue({
      layer: {
        getScene: () => scene,
        getRenderer: () =>
          ({
            capabilities: { maxTextureSize: 16_384 },
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
        url: "https://example.test/terrain",
        minimumLevel: 10,
        maximumLevel: 16,
      },
    });
    expect(buildCesiumTerrainRuntime).toHaveBeenCalledWith(
      "shadow-simulation-cesium-terrain",
      "https://example.test/terrain",
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
    expect(shadowView.shadowMapSize.width).toBe(4_096);
    expect(shadowView.shadowMapSize.width).not.toBe(800);
    expect(evaluateAtmosphere.mock.lastCall?.[1].altitudeMeters).toBe(425);

    controller.dispose();
    expect(removeRuntime).toHaveBeenCalledWith("terrain");
  });

  it("replaces shadow terrain while a Mesh tiles runtime provides terrain", async () => {
    vi.stubGlobal("window", { clearTimeout, setTimeout });
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const makeTerrainRuntime = () => ({
      id: "shadow-simulation-cesium-terrain",
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
    vi.mocked(buildCesiumTerrainRuntime)
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
      terrain: { url: "https://example.test/terrain" },
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

    meshRenderable = true;
    contentChanged();

    expect(sharedRuntimes.has(initialTerrain.id)).toBe(false);
    expect(initialTerrain.dispose).toHaveBeenCalledOnce();

    controller.updateTerrainColor("#8c7a66");

    activeContentRuntimes.length = 0;
    contentChanged();
    await restoredTerrain.ready;

    expect(buildCesiumTerrainRuntime).toHaveBeenCalledTimes(2);
    expect(sharedRuntimes.get(restoredTerrain.id)).toBe(restoredTerrain);
    expect(restoredTerrain.setMaterialColor).toHaveBeenCalled();

    controller.dispose();
    vi.unstubAllGlobals();
  });
});

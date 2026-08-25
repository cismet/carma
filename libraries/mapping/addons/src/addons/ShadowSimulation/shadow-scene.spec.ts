// @vitest-environment node

import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: vi.fn(),
  buildCesiumTerrainRuntime: vi.fn(),
  getGenericThreeLayers: vi.fn(() => []),
  subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
  suppressMapLibreTerrainRendering: vi.fn(() => vi.fn()),
}));

import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
  suppressMapLibreTerrainRendering,
} from "@carma-mapping/engines/maplibre";

import {
  buildShadowSimulationScene,
  solarPositionToSceneDirection,
} from "./shadow-scene";
import { getDaylightWindow, getSolarPosition } from "./solar-position";

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

describe("shadow scene lighting integration", () => {
  const releaseScene = vi.fn();
  let scene: THREE.Scene;
  let sharedRuntimes: Map<
    string,
    { root: THREE.Object3D; dispose: () => void }
  >;
  let sharedLayer: {
    getScene: () => THREE.Scene;
    addRuntime: ReturnType<typeof vi.fn>;
    hasRuntime: ReturnType<typeof vi.fn>;
    removeRuntime: ReturnType<typeof vi.fn>;
    projectLngLatToScene?: (
      lngLat: [number, number],
      altitude?: number
    ) => THREE.Vector3;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    scene = new THREE.Scene();
    sharedRuntimes = new Map();
    sharedLayer = {
      getScene: () => scene,
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
    };
    vi.mocked(getGenericThreeLayers).mockReturnValue([]);
    vi.mocked(subscribeGenericThreeLayers).mockReturnValue(vi.fn());
    vi.mocked(acquireSharedThreeScene).mockReturnValue({
      layer: sharedLayer as never,
      release: releaseScene,
    });
  });

  it("drives MapLibre and the Three.js sun from the same solar position", () => {
    const setLight = vi.fn();
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
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

    expect(acquireSharedThreeScene).toHaveBeenCalledWith(map);
    expect(setLight).toHaveBeenLastCalledWith(
      expect.objectContaining({
        anchor: "map",
        position: [1.5, 135, 45],
      })
    );
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    expect(sun.castShadow).toBe(true);
    expect(sun.position.clone().normalize().x).toBeCloseTo(0.5);
    expect(sun.position.clone().normalize().y).toBeCloseTo(Math.SQRT1_2);
    expect(sun.position.clone().normalize().z).toBeCloseTo(0.5);

    controller.dispose();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(releaseScene).toHaveBeenCalledOnce();
  });

  it("moves ALKIS buildings into the shared terrain shadow scene", () => {
    const terrain = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshLambertMaterial()
    );
    terrain.name = "terrain";
    scene.add(terrain);
    const alkisScene = new THREE.Scene();
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10, 20, 10),
      new THREE.MeshLambertMaterial()
    );
    building.name = "alkis-building";
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

    const buildingCopy = scene.getObjectByName(
      "alkis-building-shadow-simulation-copy"
    ) as THREE.Mesh;
    expect(building.visible).toBe(false);
    expect(buildingCopy.castShadow).toBe(true);
    expect(buildingCopy.receiveShadow).toBe(true);
    expect(terrain.castShadow).toBe(true);
    expect(terrain.receiveShadow).toBe(true);
    expect(buildingCopy.parent?.parent).toBe(scene);
    expect(terrain.parent).toBe(scene);

    controller.dispose();
    expect(building.visible).toBe(true);
    expect(scene.getObjectByName(buildingCopy.name)).toBeUndefined();
  });

  it("keeps the full map viewport inside the shadow camera", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const map = {
      getCenter: vi.fn(() => ({ lng: 0, lat: 0 })),
      getBounds: vi.fn(() => ({
        getWest: () => -1,
        getSouth: () => -2,
        getEast: () => 1,
        getNorth: () => 2,
      })),
      getLight: vi.fn(() => ({ anchor: "viewport" })),
      isStyleLoaded: vi.fn(() => true),
      setLight: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
      triggerRepaint: vi.fn(),
    };

    const controller = buildShadowSimulationScene(map as never);
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    const cornerRadius = Math.hypot(1_000, 2_000);

    expect(sun.shadow.camera.right).toBeGreaterThan(cornerRadius);
    expect(sun.shadow.camera.top).toBeGreaterThan(cornerRadius);
    expect(map.on).toHaveBeenCalledWith("move", expect.any(Function));

    controller.dispose();
  });

  it("adds configured Cesium terrain to the shared scene", async () => {
    const restoreTerrain = vi.fn();
    vi.mocked(suppressMapLibreTerrainRendering).mockReturnValue(restoreTerrain);
    const terrainRoot = new THREE.Group();
    const terrainRuntime = {
      id: "terrain",
      originLngLat: [7.15, 51.256] as [number, number],
      root: terrainRoot,
      supportsShadows: true,
      ready: Promise.resolve(true),
      update: vi.fn(),
      setVisible: vi.fn(),
      setShadowCamera: vi.fn(),
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
        addRuntime,
        hasRuntime: vi.fn(() => true),
        removeRuntime,
      } as never,
      release: releaseScene,
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
      shadowAreaMeters: 600,
      terrain: {
        url: "https://example.test/terrain",
        minimumLevel: 10,
        maximumLevel: 16,
      },
    });
    await terrainRuntime.ready;

    expect(buildCesiumTerrainRuntime).toHaveBeenCalledWith(
      "shadow-simulation-cesium-terrain",
      "https://example.test/terrain",
      [7.15, 51.256],
      expect.objectContaining({ minimumLevel: 10, maximumLevel: 16 })
    );
    expect(addRuntime).toHaveBeenCalledWith(terrainRuntime);
    expect(suppressMapLibreTerrainRendering).toHaveBeenCalledWith(map);

    controller.updateTerrainColor("#8c7a66");
    expect(terrainRuntime.setMaterialColor).toHaveBeenCalledWith("#8c7a66");

    controller.dispose();
    expect(restoreTerrain).toHaveBeenCalledOnce();
    expect(removeRuntime).toHaveBeenCalledWith("terrain");
  });
});

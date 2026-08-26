// @vitest-environment node

import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@carma-mapping/engines/maplibre", () => ({
  acquireSharedThreeScene: vi.fn(),
  buildCesiumTerrainRuntime: vi.fn(),
  getGenericThreeLayers: vi.fn(() => []),
  getSharedThreeSceneRuntimes: vi.fn(() => []),
  subscribeGenericThreeLayers: vi.fn(() => vi.fn()),
  subscribeSharedThreeSceneContent: vi.fn(() => vi.fn()),
  suppressMapLibreRegularStyleLayers: vi.fn(() => vi.fn()),
  suppressMapLibreTerrainRendering: vi.fn(() => vi.fn()),
}));

import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  subscribeGenericThreeLayers,
  subscribeSharedThreeSceneContent,
  suppressMapLibreRegularStyleLayers,
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
  type SharedRuntimeFixture = {
    id: string;
    root: THREE.Object3D;
    dispose: () => void;
  };
  let sharedRuntimes: Map<string, SharedRuntimeFixture>;
  let sharedLayer: {
    getScene: () => THREE.Scene;
    addRuntime: (runtime: SharedRuntimeFixture) => void;
    hasRuntime: (runtimeId: string) => boolean;
    removeRuntime: (runtimeId: string) => void;
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
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([]);
    vi.mocked(subscribeGenericThreeLayers).mockReturnValue(vi.fn());
    vi.mocked(subscribeSharedThreeSceneContent).mockReturnValue(vi.fn());
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
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
    expect(sun.isDirectionalLight).toBe(true);
    expect(sun.shadow.camera).toBeInstanceOf(THREE.OrthographicCamera);
    expect(sun.shadow.camera.projectionMatrix.elements[11]).toBe(0);
    expect(sun.shadow.camera.projectionMatrix.elements[15]).toBe(1);
    expect(sun.shadow.camera.near).toBe(1);
    expect(sun.shadow.camera.far).toBe(3_950);
    expect(sun.castShadow).toBe(true);
    expect(sun.shadow.autoUpdate).toBe(false);
    expect(sun.shadow.mapSize.toArray()).toEqual([4_096, 4_096]);
    expect(sun.shadow.radius).toBe(0);
    const shadowTexelMeters = 900 / 4_096;
    expect(sun.shadow.bias).toBeCloseTo(
      -(shadowTexelMeters * 0.5) /
        (sun.shadow.camera.far - sun.shadow.camera.near),
      10
    );
    expect(sun.shadow.normalBias).toBeCloseTo(0.10986, 5);
    expect(sun.position.clone().normalize().x).toBeCloseTo(0.5);
    expect(sun.position.clone().normalize().y).toBeCloseTo(Math.SQRT1_2);
    expect(sun.position.clone().normalize().z).toBeCloseTo(0.5);
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

    controller.updateShadowQuality(1);
    expect(sun.shadow.mapSize.toArray()).toEqual([2_048, 2_048]);
    expect(sun.shadow.normalBias).toBeCloseTo(0.21973, 5);
    controller.updateShadowQuality(16);
    expect(sun.shadow.mapSize.toArray()).toEqual([8_192, 8_192]);
    expect(sun.shadow.normalBias).toBeCloseTo(0.1, 5);

    controller.dispose();
    expect(suppressMapLibreRegularStyleLayers).toHaveBeenCalledWith(map);
    expect(
      vi.mocked(suppressMapLibreRegularStyleLayers).mock.results[0]?.value
    ).toHaveBeenCalledOnce();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-vector")
    ).toBeUndefined();
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
    expect((buildingCopy.material as THREE.Material).shadowSide).toBeNull();
    expect(terrain.castShadow).toBe(true);
    expect(terrain.receiveShadow).toBe(true);
    expect((terrain.material as THREE.Material).shadowSide).toBeNull();
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
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      { setShadowSimulationStyle } as never,
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
    });

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
    const map = {
      getCenter: vi.fn(() => mapCenter),
      getBounds: vi.fn(() => ({
        getWest: () => mapCenter.lng - viewportHalfWidth,
        getSouth: () => mapCenter.lat - viewportHalfHeight,
        getEast: () => mapCenter.lng + viewportHalfWidth,
        getNorth: () => mapCenter.lat + viewportHalfHeight,
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
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
    const expectCurrentViewportInsideShadowCamera = () => {
      sun.shadow.updateMatrices(sun);
      for (const [lng, lat] of [
        [mapCenter.lng - viewportHalfWidth, mapCenter.lat - viewportHalfHeight],
        [mapCenter.lng - viewportHalfWidth, mapCenter.lat + viewportHalfHeight],
        [mapCenter.lng + viewportHalfWidth, mapCenter.lat - viewportHalfHeight],
        [mapCenter.lng + viewportHalfWidth, mapCenter.lat + viewportHalfHeight],
      ]) {
        const cameraPoint = new THREE.Vector3(
          lng * 1_000,
          0,
          lat * 1_000
        ).applyMatrix4(sun.shadow.camera.matrixWorldInverse);
        expect(cameraPoint.x).toBeGreaterThanOrEqual(sun.shadow.camera.left);
        expect(cameraPoint.x).toBeLessThanOrEqual(sun.shadow.camera.right);
        expect(cameraPoint.y).toBeGreaterThanOrEqual(sun.shadow.camera.bottom);
        expect(cameraPoint.y).toBeLessThanOrEqual(sun.shadow.camera.top);
      }
    };
    const wideViewportCameraWidth =
      sun.shadow.camera.right - sun.shadow.camera.left;

    expectCurrentViewportInsideShadowCamera();
    expect(sunVector.position.toArray()).toEqual([0, 0, 0]);
    expect(sunVector.cone.position.y).toBeCloseTo(1_000);
    expect(map.on).toHaveBeenCalledWith("move", expect.any(Function));

    mapCenter = { lng: 0.5, lat: 1 };
    const moveHandler = map.on.mock.calls.find(
      ([eventName]) => eventName === "move"
    )?.[1] as () => void;
    moveHandler();

    expect(sunVector.position.toArray()).toEqual([500, 0, 1_000]);
    expect(sun.target.position.toArray()).toEqual([500, 0, 1_000]);
    expectCurrentViewportInsideShadowCamera();

    viewportHalfWidth = 0.05;
    viewportHalfHeight = 0.1;
    moveHandler();

    const zoomedViewportCameraWidth =
      sun.shadow.camera.right - sun.shadow.camera.left;
    expectCurrentViewportInsideShadowCamera();
    expect(zoomedViewportCameraWidth).toBeLessThan(wideViewportCameraWidth);

    controller.dispose();
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
      getBounds: vi.fn(() => ({
        getWest: () => -0.05,
        getSouth: () => -0.1,
        getEast: () => 0.05,
        getNorth: () => 0.1,
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

    expect(sun.shadow.camera.right).toBeGreaterThan(300);

    controller.dispose();
    elevatedReceiver.geometry.dispose();
    (elevatedReceiver.material as THREE.Material).dispose();
  });

  it("adds configured Cesium terrain to the shared scene", async () => {
    const restoreTerrain = vi.fn();
    vi.mocked(suppressMapLibreTerrainRendering).mockReturnValue(restoreTerrain);
    const terrainRoot = new THREE.Group();
    const terrainRuntime = {
      id: "terrain",
      originLngLat: [7.15, 51.256] as [number, number],
      root: terrainRoot,
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
    let backgroundLayerPresent = false;
    const backgroundPaint = new Map<string, unknown>();
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getLayer: vi.fn(() =>
        backgroundLayerPresent
          ? { id: "__shadow-simulation-background", type: "background" }
          : undefined
      ),
      getStyle: vi.fn(() => ({ layers: [{ id: "amtlich" }] })),
      addLayer: vi.fn((layer: { paint?: Record<string, unknown> }) => {
        backgroundLayerPresent = true;
        for (const [property, value] of Object.entries(layer.paint ?? {})) {
          backgroundPaint.set(property, value);
        }
      }),
      removeLayer: vi.fn(() => {
        backgroundLayerPresent = false;
      }),
      getPaintProperty: vi.fn((_layerId: string, property: string) =>
        backgroundPaint.get(property)
      ),
      setPaintProperty: vi.fn(
        (_layerId: string, property: string, value: unknown) => {
          backgroundPaint.set(property, value);
        }
      ),
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
    expect(map.addLayer).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "__shadow-simulation-background",
        type: "background",
        paint: expect.objectContaining({
          "background-color": "#d8d1c4",
          "background-opacity": 1,
        }),
      }),
      "amtlich"
    );

    controller.updateTerrainColor("#8c7a66");
    expect(terrainRuntime.setMaterialColor).toHaveBeenCalledWith("#8c7a66");
    expect(map.setPaintProperty).toHaveBeenCalledWith(
      "__shadow-simulation-background",
      "background-color",
      "#8c7a66"
    );

    controller.dispose();
    expect(restoreTerrain).toHaveBeenCalledOnce();
    expect(removeRuntime).toHaveBeenCalledWith("terrain");
    expect(map.removeLayer).toHaveBeenCalledWith(
      "__shadow-simulation-background"
    );
  });
});

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
import { evaluateAtmosphericSunlight } from "./atmospheric-sunlight";
import {
  readShadowProjectionDebugSnapshot,
  subscribeShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";
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
    update?: (frame: unknown) => void;
    dispose: () => void;
  };
  let sharedRuntimes: Map<string, SharedRuntimeFixture>;
  let sharedLayer: {
    getScene: () => THREE.Scene;
    addRuntime: (runtime: SharedRuntimeFixture) => void;
    hasRuntime: (runtimeId: string) => boolean;
    removeRuntime: (runtimeId: string) => void;
    getRenderer: () => THREE.WebGLRenderer | null;
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

  const updateTiledShadows = (
    map: unknown,
    camera: THREE.PerspectiveCamera
  ) => {
    const runtime = sharedRuntimes.get("shadow-simulation-tiled-controller");
    expect(runtime?.update).toBeTypeOf("function");
    runtime?.update?.({
      map,
      renderCamera: camera,
      lodCamera: camera,
      lookTarget: new THREE.Vector3(),
      viewport: new THREE.Vector2(800, 600),
    });
  };

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

    const atmosphere = evaluateAtmosphericSunlight(
      solarPosition.instant,
      { longitude: 7.15, latitude: 51.256, altitudeMeters: 0 },
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
    expect(sun.shadow.radius).toBe(1);
    const tileLights = scene.children.filter(
      (object): object is THREE.DirectionalLight =>
        (object as THREE.DirectionalLight).isDirectionalLight &&
        object.name.startsWith("shadow-simulation-sun")
    );
    expect(tileLights).toHaveLength(4);
    expect(tileLights.every((light) => light.shadow.intensity === 1)).toBe(
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

    controller.dispose();
    expect(suppressMapLibreRegularStyleLayers).toHaveBeenCalledWith(map);
    expect(
      vi.mocked(suppressMapLibreRegularStyleLayers).mock.results[0]?.value
    ).toHaveBeenCalledOnce();
    expect(scene.getObjectByName("shadow-simulation-sun")).toBeUndefined();
    expect(
      scene.getObjectByName("shadow-simulation-sun-tile-3")
    ).toBeUndefined();
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
    // What the cesium terrain runtime stamps on every surface it builds.
    terrain.userData.isShadowTerrainSurface = true;
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
    // Closed buildings write their far walls into the depth map, which is
    // what keeps their bases free of leak lines and their walls of acne.
    expect((buildingCopy.material as THREE.Material).shadowSide).toBe(
      THREE.BackSide
    );
    expect((buildingCopy.material as THREE.Material).defines).toMatchObject({
      USE_CSM: 1,
      CSM_CASCADES: 4,
    });
    const firstCopiedMaterial = buildingCopy.material as THREE.Material;
    expect(terrain.castShadow).toBe(true);
    expect(terrain.receiveShadow).toBe(true);
    expect((terrain.material as THREE.Material).shadowSide).toBeNull();
    // The open heightfield keeps the standard depth pass; acne is absorbed by
    // the texel-scaled receiver normal bias, not a custom depth material.
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
    expect(uniformMaterial.defines).toMatchObject({ USE_CSM: 1 });
    expect(firstCopiedMaterial.defines).toBeUndefined();

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
    expect(styledMaterial.defines).toMatchObject({ USE_CSM: 1 });
    expect(uniformMaterial.defines).toBeUndefined();

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

  it("re-hooks CSM after a shared runtime replaces its materials", () => {
    const building = new THREE.Mesh(
      new THREE.BoxGeometry(10, 20, 10),
      new THREE.MeshLambertMaterial()
    );
    building.userData.isBuilding = true;
    scene.add(building);
    const runtimeMaterials: Array<{
      material: THREE.MeshLambertMaterial;
      hook: ReturnType<typeof vi.fn>;
    }> = [];
    const setShadowSimulationStyle = vi.fn(() => {
      const material = new THREE.MeshLambertMaterial();
      const hook = vi.fn();
      material.onBeforeCompile = hook;
      runtimeMaterials.push({ material, hook });
      building.material = material;
    });
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
    const initialRuntimeMaterial =
      runtimeMaterials[runtimeMaterials.length - 1];
    expect(initialRuntimeMaterial?.material.defines).toMatchObject({
      USE_CSM: 1,
    });

    controller.updateBuildingAppearance({
      fullOpacity: true,
      uniformColor: "#d8d1c4",
    });

    const replacement = runtimeMaterials[runtimeMaterials.length - 1];
    expect(replacement?.material).not.toBe(initialRuntimeMaterial?.material);
    expect(replacement?.material.defines).toMatchObject({ USE_CSM: 1 });
    expect(initialRuntimeMaterial?.material.defines).toBeUndefined();
    expect(initialRuntimeMaterial?.material.onBeforeCompile).toBe(
      initialRuntimeMaterial?.hook
    );

    controller.dispose();
    building.geometry.dispose();
    for (const { material } of runtimeMaterials) material.dispose();
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
    // Snapshots publish only while something listens, as the debug panel does.
    subscribeShadowProjectionDebugSnapshot(map as never, () => undefined);
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const sunVector = scene.getObjectByName(
      "shadow-simulation-sun-vector"
    ) as THREE.ArrowHelper;
    const updateAndExpectViewportInsideTileUnion = () => {
      const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
      camera.position.set(
        mapCenter.lng * 1_000,
        4_000,
        mapCenter.lat * 1_000 + 4_000
      );
      camera.lookAt(mapCenter.lng * 1_000, 0, mapCenter.lat * 1_000);
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld(true);
      updateTiledShadows(map, camera);
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
      expect(snapshot?.tiledShadow?.tiles).toHaveLength(4);
      return snapshot?.tiledShadow?.tiles
        .slice()
        .sort(
          (left, right) => right.receiverPointCount - left.receiverPointCount
        )[0];
    };

    const wideViewportTile = updateAndExpectViewportInsideTileUnion();
    const shadowBufferBoxes = scene.children.filter(
      (object): object is THREE.LineSegments =>
        object instanceof THREE.LineSegments &&
        object.name.startsWith("shadow-simulation-shadow-buffer-")
    );
    expect(shadowBufferBoxes).toHaveLength(4);
    expect(shadowBufferBoxes.every(({ visible }) => !visible)).toBe(true);
    controller.updateShadowBufferDebugVisibility(true);
    expect(shadowBufferBoxes.every(({ visible }) => visible)).toBe(true);
    const shadowLights = scene.children.filter(
      (object): object is THREE.DirectionalLight =>
        (object as THREE.DirectionalLight).isDirectionalLight &&
        object.name.startsWith("shadow-simulation-sun")
    );
    shadowBufferBoxes.forEach((box, index) => {
      const shadowCamera = shadowLights[index]!.shadow.camera;
      const position = box.geometry.getAttribute("position");
      expect(position.count).toBe(48);
      for (
        let cornerIndex = 0;
        cornerIndex < position.count;
        cornerIndex += 1
      ) {
        const projected = new THREE.Vector3()
          .fromBufferAttribute(position, cornerIndex)
          .project(shadowCamera);
        expect(Math.abs(projected.x)).toBeCloseTo(1, 5);
        expect(Math.abs(projected.y)).toBeCloseTo(1, 5);
        expect(Math.abs(projected.z)).toBeCloseTo(1, 5);
      }
      expect((box.material as THREE.Material).depthTest).toBe(false);
    });
    controller.updateShadowBufferDebugVisibility(false);
    expect(shadowBufferBoxes.every(({ visible }) => !visible)).toBe(true);
    expect(getBounds).not.toHaveBeenCalled();
    expect(sunVector.position.toArray()).toEqual([0, 0, 0]);
    expect(sunVector.cone.position.y).toBeCloseTo(1_000);
    expect(map.on).toHaveBeenCalledWith("move", expect.any(Function));

    mapCenter = { lng: 0.5, lat: 1 };
    const moveHandler = map.on.mock.calls.find(
      ([eventName]) => eventName === "move"
    )?.[1] as () => void;
    moveHandler();

    expect(sunVector.position.toArray()).toEqual([500, 0, 1_000]);
    expect(
      (
        scene.getObjectByName("shadow-simulation-sun") as THREE.DirectionalLight
      ).target.position.toArray()
    ).toEqual([500, 0, 1_000]);
    updateAndExpectViewportInsideTileUnion();

    viewportHalfWidth = 0.05;
    viewportHalfHeight = 0.1;
    moveHandler();

    const zoomedViewportTile = updateAndExpectViewportInsideTileUnion();
    expect(
      (zoomedViewportTile?.rightMeters ?? 0) -
        (zoomedViewportTile?.leftMeters ?? 0)
    ).toBeLessThan(
      (wideViewportTile?.rightMeters ?? 0) - (wideViewportTile?.leftMeters ?? 0)
    );

    controller.updateShadowMode("single");
    const singleCamera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    singleCamera.position.set(500, 4_000, 5_000);
    singleCamera.lookAt(500, 0, 1_000);
    singleCamera.updateProjectionMatrix();
    singleCamera.updateMatrixWorld(true);
    updateTiledShadows(map, singleCamera);
    expect(
      readShadowProjectionDebugSnapshot(map as never)?.tiledShadow
    ).toMatchObject({
      strategy: "single-viewport",
      tileCount: 1,
    });
    controller.updateShadowBufferDebugVisibility(true);
    expect(shadowBufferBoxes.filter(({ visible }) => visible)).toHaveLength(1);

    controller.dispose();
    expect(
      scene.getObjectByName("shadow-simulation-shadow-buffer-0")
    ).toBeUndefined();
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
    // Snapshots publish only while something listens, as the debug panel does.
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
    updateTiledShadows(map, camera);
    const snapshot = readShadowProjectionDebugSnapshot(map as never);

    expect(snapshot?.maximumElevationMeters).toBeGreaterThanOrEqual(300);
    expect(snapshot?.minimumElevationMeters).toBeLessThanOrEqual(0);
    expect(snapshot?.tiledShadow?.casterReachMeters).toBeGreaterThan(300);

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
      setShadowCameras: vi.fn(),
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
        getRenderer: () => null,
        addRuntime,
        hasRuntime: vi.fn(() => true),
        removeRuntime,
        projectLngLatToScene: (
          [longitude, latitude]: [number, number],
          altitude = 0
        ) => new THREE.Vector3(longitude * 1_000, altitude, latitude * 1_000),
      } as never,
      release: releaseScene,
    });
    let backgroundLayerPresent = false;
    const backgroundPaint = new Map<string, unknown>();
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getCanvas: vi.fn(() => ({ clientWidth: 800, clientHeight: 600 })),
      unproject: vi.fn(([x, y]: [number, number]) => ({
        lng: 7.15 + (x / 800 - 0.5) * 0.02,
        lat: 51.256 + (0.5 - y / 600) * 0.02,
      })),
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
          "background-color": "#d3d3d3",
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

    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const shadowRuntime = addRuntime.mock.calls.find(
      ([runtime]) => runtime.id === "shadow-simulation-tiled-controller"
    )?.[0] as SharedRuntimeFixture;
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 4_000, 55_256);
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
    // Terrain coverage no longer follows the fitted render cameras: it is
    // one analytic volume swept from the visible extent toward the sun, so
    // the selection never loses sun-side tiles to a resting or failed fit.
    const shadowViews = terrainRuntime.setShadowCameras.mock.lastCall?.[0];
    expect(shadowViews).toHaveLength(1);
    expect(shadowViews[0].camera.name).toBe(
      "shadow-simulation-terrain-coverage"
    );
    expect(
      (shadowViews[0].camera as THREE.OrthographicCamera).isOrthographicCamera
    ).toBe(true);
    expect(shadowViews[0].shadowMapSize.width).toBeGreaterThan(0);
    expect(shadowViews[0].shadowMapSize.width).not.toBe(800);

    controller.dispose();
    expect(restoreTerrain).toHaveBeenCalledOnce();
    expect(removeRuntime).toHaveBeenCalledWith("terrain");
    expect(map.removeLayer).toHaveBeenCalledWith(
      "__shadow-simulation-background"
    );
  });
});

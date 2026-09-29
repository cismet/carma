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

describe("shadow scene viewport and content coverage", () => {
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
      const lights = findShadowLights();
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

  it("prepares materials immediately but batches only published geometry changes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      clearTimeout,
      setTimeout,
    });
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    let contentChanged: (
      change?: Readonly<{
        roots?: readonly THREE.Object3D[];
        bounds?: readonly THREE.Box3[];
      }>
    ) => void = () => undefined;
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
    // Preparing a payload is not publication: it must configure the arriving
    // material and request paint, but schedule no global geometry refresh.
    const scheduled = vi.spyOn(window, "setTimeout");
    scheduled.mockClear();
    contentChanged({ bounds: [], roots: [buildingVolume] });
    expect(configureReceiverPlaneShadow(buildingVolume.material).value).toBe(
      true
    );
    expect(scheduled).not.toHaveBeenCalled();
    expect(setTerrainShadowView).toHaveBeenCalledTimes(
      initialTerrainShadowViewCalls
    );
    scheduled.mockRestore();
    contentChanged({ roots: [buildingVolume] });
    // Material setup is immediate; geometric coverage is refreshed on the
    // one-second publication cadence, never per decoded model.
    expect(configureReceiverPlaneShadow(buildingVolume.material).value).toBe(
      true
    );
    await vi.advanceTimersByTimeAsync(1000);
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
});

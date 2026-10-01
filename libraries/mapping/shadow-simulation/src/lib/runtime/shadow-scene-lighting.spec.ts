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

describe("shadow scene lighting and local frame", () => {
  it("carries the sun with the local-frame group on a refit and re-evaluates nothing", () => {
    sharedLayer.projectLngLatToScene = ([lng, lat], altitude = 0) =>
      new THREE.Vector3(lng * 1_000, altitude, lat * 1_000);
    const map = {
      getCenter: vi.fn(() => ({ lng: 7.15, lat: 51.256 })),
      getZoom: vi.fn(() => 16),
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
    const controller = buildShadowSimulationScene(map as never);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T10:00:00Z"),
      azimuthDegrees: 135,
      elevationDegrees: 45,
    });
    const evaluate = vi.spyOn(
      AtmosphericSunlightEvaluator.prototype,
      "evaluate"
    );
    const camera = new THREE.PerspectiveCamera(60, 4 / 3, 1, 20_000);
    camera.position.set(7_150, 4_000, 51_256);
    camera.lookAt(7_150, 0, 51_256);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    expect(sun.parent).toBe(frameGroup);
    const localDirection = () =>
      sun.position.clone().sub(sun.target.position).normalize();
    const worldDirection = () => {
      sun.updateMatrixWorld(true);
      sun.target.updateMatrixWorld(true);
      return new THREE.Vector3()
        .setFromMatrixPosition(sun.matrixWorld)
        .sub(new THREE.Vector3().setFromMatrixPosition(sun.target.matrixWorld))
        .normalize();
    };
    const tilt = (degrees: number) =>
      new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(degrees));
    updateShadows(map, camera, undefined, localFrameAt(1));
    const aimed = localDirection();
    const evaluations = evaluate.mock.calls.length;
    sun.shadow.needsUpdate = false;

    // The layer moves the group; the light inside keeps its fit, the world
    // sees it turned with the tiles, and nothing is evaluated or invalidated.
    for (const [revision, degrees] of [
      [2, 0.01],
      [3, 0.5],
    ] as const) {
      frameGroup.matrix.copy(tilt(degrees));
      frameGroup.updateMatrixWorld(true);
      updateShadows(
        map,
        camera,
        undefined,
        localFrameAt(revision, tilt(degrees))
      );
      expect(localDirection().angleTo(aimed)).toBe(0);
      expect(
        worldDirection().angleTo(aimed.clone().applyMatrix4(tilt(degrees)))
      ).toBeCloseTo(0, 6);
      expect(evaluate).toHaveBeenCalledTimes(evaluations);
      expect(sun.shadow.needsUpdate).toBe(false);
    }
    const fittedPosition = sun.position.clone();
    const fittedTarget = sun.target.position.clone();
    const fittedCamera = sun.shadow.camera.matrixWorld.clone();
    controller.updateSolarPosition({
      instant: new Date("2026-06-21T11:00:00Z"),
      azimuthDegrees: 150,
      elevationDegrees: 50,
    });
    expect(sun.position.equals(fittedPosition)).toBe(true);
    expect(sun.target.position.equals(fittedTarget)).toBe(true);
    expect(sun.shadow.camera.matrixWorld.equals(fittedCamera)).toBe(true);
    expect(sun.shadow.needsUpdate).toBe(true);
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
      getZoom: vi.fn(() => 16),
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

    expect(acquireSharedThreeScene).toHaveBeenCalledWith(map, {
      mapStylePresentation: true,
    });
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
    const shadowLights: THREE.DirectionalLight[] = [];
    scene.traverse((object) => {
      if (
        (object as THREE.DirectionalLight).isDirectionalLight &&
        object.name.startsWith("shadow-simulation-sun")
      )
        shadowLights.push(object as THREE.DirectionalLight);
    });
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
    expect(sunVector.position).toEqual(
      sharedLayer.projectLngLatToScene([mapCenter.lng, mapCenter.lat], 0)
    );
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
    const animatedLabelUpdateCount = setLocationLabelColor.mock.calls.length;
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
    // The label colour would re-run the overlay maintenance over every symbol
    // layer; it stays frozen while animating and follows the final sample.
    expect(setLocationLabelColor).toHaveBeenCalledTimes(
      animatedLabelUpdateCount
    );
    controller.updateTimeAnimating(false);
    expect(setLight).toHaveBeenCalledTimes(animatedMapStyleUpdateCount + 1);
    expect(setLocationLabelColor).toHaveBeenCalledTimes(
      animatedLabelUpdateCount + 1
    );
    expect(setLocationLabelColor).toHaveBeenLastCalledWith(
      setLight.mock.lastCall?.[0].color
    );

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
});

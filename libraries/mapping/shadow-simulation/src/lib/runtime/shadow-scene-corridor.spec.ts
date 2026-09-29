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

describe("shadow scene corridor and building bridge", () => {
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
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    const contentRuntimes = getSharedThreeSceneRuntimes(map as never);
    const isMainViewReady = vi.fn(() => false);
    const hasRenderableContent = vi.fn(() => false);
    const loadingMesh = {
      providesTerrain: true,
      isMainViewReady,
      hasRenderableContent,
    };
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      ...contentRuntimes,
      loadingMesh as never,
    ]);
    expect(accumulation.active()).toBe(false);
    expect(accumulation.pending?.()).toBe(true);
    expect(accumulation.renderScene?.(camera, null)).toBe(false);
    hasRenderableContent.mockReturnValue(true);
    expect(accumulation.active()).toBe(true);
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.MONO,
    });
    // Published coarse coverage is sufficient; final mesh SSE must not hold
    // finite-sun refinement behind unrelated outstanding mesh requests.
    expect(isMainViewReady()).toBe(false);
    expect(accumulation.active()).toBe(true);
    expect(accumulation.pending?.()).toBe(false);
    hasRenderableContent.mockReturnValue(false);
    expect(accumulation.active()).toBe(false);
    expect(accumulation.pending?.()).toBe(true);
    const sun = scene.getObjectByName(
      "shadow-simulation-sun"
    ) as THREE.DirectionalLight;
    for (const hour of [12, 16]) {
      const previousEpoch = accumulation.visualEpoch();
      const previousDirection = sun.shadow.camera.getWorldDirection(
        new THREE.Vector3()
      );
      map.triggerRepaint.mockClear();
      controller.updateSolarPosition({
        instant: new Date(`2026-06-21T${hour}:00:00Z`),
        azimuthDegrees: hour * 15,
        elevationDegrees: 45,
      });
      expect(accumulation.visualEpoch()).toBeGreaterThan(previousEpoch);
      expect(map.triggerRepaint).toHaveBeenCalled();
      updateShadows(map, camera);
      expect(sun.shadow.needsUpdate).toBe(true);
      expect(
        sun.shadow.camera
          .getWorldDirection(new THREE.Vector3())
          .equals(previousDirection)
      ).toBe(false);
      expect(setShadowView).toHaveBeenLastCalledWith(
        expect.objectContaining({ camera: sun.shadow.camera })
      );
      expect(accumulation.pending?.()).toBe(true);
      expect(accumulation.renderScene?.(camera, null)).toBe(false);
    }
    controller.updateRenderQuality({
      shadowBufferLayout: SHADOW_BUFFER_LAYOUT.TILED,
    });
    // Later loading/refinement retains the tiled renderer, never preview.
    hasRenderableContent.mockReturnValue(false);
    isMainViewReady.mockReturnValue(false);
    expect(accumulation.active()).toBe(true);
    expect(accumulation.pending?.()).toBe(false);
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
    const casterOnly = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
    );
    scene.add(casterOnly);
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
    expect(casterOnly.castShadow).toBe(true);
    expect(casterOnly.receiveShadow).toBe(false);
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

  it("updates mesh drape immediately when a provider is added or removed", () => {
    vi.stubGlobal("window", { setTimeout, clearTimeout });
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
    const lease = vi.mocked(acquireSharedThreeScene).mock.results[0].value;
    const changed = vi
      .mocked(subscribeSharedThreeSceneContent)
      .mock.calls.at(-1)![1];
    expect(lease.setMeshLabelStyle).toHaveBeenLastCalledWith(false);
    const mesh = {
      id: "late-mesh",
      providesTerrain: true,
      mapStyleProjectionBlend: "overlay",
    };
    try {
      // Do not advance timers or emit style/idle events: registration owns the
      // policy transition, even while streamed geometry is still pending.
      vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([mesh as never]);
      changed();
      expect(lease.setMeshLabelStyle).toHaveBeenLastCalledWith(true);
      const calls = lease.setMeshLabelStyle.mock.calls.length;
      changed({ bounds: [] });
      changed();
      expect(lease.setMeshLabelStyle).toHaveBeenCalledTimes(calls);
      vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([]);
      changed();
      expect(lease.setMeshLabelStyle).toHaveBeenLastCalledWith(false);
    } finally {
      controller.dispose();
      vi.unstubAllGlobals();
    }
  });

  it("restyles registered building tiles only while shadow mode is active", () => {
    const setShadowSimulationStyle = vi.fn();
    const setErrorTarget = vi.fn();
    const setErrorTargetOverride = vi.fn();
    const setCacheBudget = vi.fn();
    vi.mocked(getSharedThreeSceneRuntimes).mockReturnValue([
      {
        providesTerrain: true,
        setErrorTarget,
        setErrorTargetOverride,
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
    // Auto leaves the tileset on its own target: no override at build time.
    expect(setErrorTarget).not.toHaveBeenCalled();
    expect(setErrorTargetOverride).toHaveBeenLastCalledWith(null);
    expect(setCacheBudget).toHaveBeenLastCalledWith(undefined);

    controller.updateMeshErrorTarget(0.25);
    expect(setErrorTargetOverride).toHaveBeenLastCalledWith(0.25);
    controller.updateMeshCacheBudget(24 * 1024 ** 3);
    expect(setCacheBudget).toHaveBeenLastCalledWith(24 * 1024 ** 3);
    const calls = setCacheBudget.mock.calls.length;
    controller.updateMeshCacheBudget(24 * 1024 ** 3);
    expect(setCacheBudget).toHaveBeenCalledTimes(calls);
    controller.updateMeshCacheBudget(undefined);
    expect(setCacheBudget).toHaveBeenLastCalledWith(undefined);

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
});

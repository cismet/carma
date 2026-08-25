import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
  suppressMapLibreTerrainRendering,
} from "@carma-mapping/engines/maplibre";
import type {
  CesiumTerrainRuntimeOptions,
  SharedThreeSceneLayer,
  SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import type { SolarPosition } from "./solar-position";

const DEFAULT_SHADOW_AREA_METERS = 900;
const DEFAULT_LIGHT_DISTANCE_METERS = 2_500;
const SHADOW_SIMULATION_SUN_NAME = "shadow-simulation-sun";
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-cesium-terrain";

type GenericThreeLayer = ReturnType<typeof getGenericThreeLayers>[number];

type ShadowLightBinding = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  lightTarget: THREE.Object3D;
  center: THREE.Vector3;
  lightDistanceMeters: number;
};

type GenericThreeShadowBridge = {
  runtime: SharedThreeSceneRuntime;
  sync: () => void;
};

export type ShadowSceneOptions = {
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
};

export type ShadowTerrainOptions = Readonly<{ url: string }> &
  Omit<CesiumTerrainRuntimeOptions, "onError">;

export type ShadowSimulationScene = {
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  dispose: () => void;
};

export const solarPositionToSceneDirection = ({
  azimuthDegrees,
  elevationDegrees,
}: SolarPosition): THREE.Vector3 => {
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const horizontal = Math.cos(elevation);
  // Shared scene axes: +X east, +Y up, -Z north.
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    -Math.cos(azimuth) * horizontal
  ).normalize();
};

const configureShadowCamera = (
  light: THREE.DirectionalLight,
  shadowAreaMeters: number
) => {
  light.castShadow = true;
  light.shadow.mapSize.set(2_048, 2_048);
  light.shadow.bias = -0.00008;
  light.shadow.normalBias = 0.45;
  light.shadow.radius = 2;
  const halfShadowArea = shadowAreaMeters / 2;
  const shadowCamera = light.shadow.camera;
  shadowCamera.left = -halfShadowArea;
  shadowCamera.right = halfShadowArea;
  shadowCamera.top = halfShadowArea;
  shadowCamera.bottom = -halfShadowArea;
  const lightDistanceMeters = Math.max(
    DEFAULT_LIGHT_DISTANCE_METERS,
    shadowAreaMeters * 1.5
  );
  shadowCamera.near = 1;
  shadowCamera.far = lightDistanceMeters * 2 + shadowAreaMeters;
  shadowCamera.updateProjectionMatrix();
  return lightDistanceMeters;
};

const makeSceneMeshesShadeable = (scene: THREE.Scene) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
};

const materialIsVisible = (material: THREE.Material): boolean =>
  material.visible && material.opacity > 0;

const meshIsVisible = (mesh: THREE.Mesh, scene: THREE.Scene): boolean => {
  let current: THREE.Object3D | null = mesh;
  while (current && current !== scene) {
    if (!current.visible) return false;
    current = current.parent;
  }
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  return materials.some(materialIsVisible);
};

const buildGenericThreeShadowBridge = (
  sharedLayer: SharedThreeSceneLayer,
  layer: GenericThreeLayer
): GenericThreeShadowBridge | null => {
  const origin = layer._originMerc?.toLngLat();
  if (!origin) return null;

  const root = new THREE.Group();
  root.name = `shadow-simulation-copy-${layer.id}`;
  const originalVisibility = new Map<THREE.Object3D, boolean>();
  let disposed = false;

  const restoreOriginals = () => {
    for (const [object, visible] of originalVisibility) {
      object.visible = visible;
    }
    originalVisibility.clear();
  };

  const sync = () => {
    if (disposed) return;
    restoreOriginals();
    root.clear();
    layer.scene.updateMatrixWorld(true);
    const sourceMeshes: THREE.Mesh[] = [];
    layer.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) {
        return;
      }
      if (!mesh.geometry?.getAttribute("position")?.count) return;
      if (!meshIsVisible(mesh, layer.scene)) return;
      sourceMeshes.push(mesh);
    });
    for (const source of sourceMeshes) {
      const copy = source.clone(false) as THREE.Mesh;
      copy.name = `${source.name || "mesh"}-shadow-simulation-copy`;
      copy.castShadow = true;
      copy.receiveShadow = true;
      copy.visible = true;
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(source.matrixWorld);
      originalVisibility.set(source, source.visible);
      source.visible = false;
      root.add(copy);
    }
    root.visible = root.children.length > 0;
  };

  const runtime: SharedThreeSceneRuntime = {
    id: `shadow-simulation-generic-${layer.id}`,
    originLngLat: [origin.lng, origin.lat],
    root,
    supportsShadows: true,
    update: () => undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      restoreOriginals();
      root.clear();
    },
  };
  sync();
  if (!root.visible) {
    runtime.dispose();
    return null;
  }
  sharedLayer.addRuntime(runtime);
  return { runtime, sync };
};

const updateBindingCenter = (binding: ShadowLightBinding) => {
  const bounds = new THREE.Box3().setFromObject(binding.scene);
  if (bounds.isEmpty()) binding.center.set(0, 0, 0);
  else bounds.getCenter(binding.center);
};

const buildShadowLightBinding = (
  scene: THREE.Scene,
  shadowAreaMeters: number
): ShadowLightBinding => {
  const lightTarget = new THREE.Object3D();
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.5);
  sunLight.name = SHADOW_SIMULATION_SUN_NAME;
  sunLight.target = lightTarget;
  const binding: ShadowLightBinding = {
    scene,
    sunLight,
    lightTarget,
    center: new THREE.Vector3(),
    lightDistanceMeters: configureShadowCamera(sunLight, shadowAreaMeters),
  };
  scene.add(lightTarget, sunLight);
  makeSceneMeshesShadeable(scene);
  updateBindingCenter(binding);
  return binding;
};

const applySolarPositionToBinding = (
  binding: ShadowLightBinding,
  direction: THREE.Vector3
) => {
  binding.lightTarget.position.copy(binding.center);
  binding.sunLight.position
    .copy(direction)
    .multiplyScalar(binding.lightDistanceMeters)
    .add(binding.center);
  const daylightStrength = THREE.MathUtils.clamp(direction.y, 0, 1);
  binding.sunLight.intensity = 1.2 + Math.sqrt(daylightStrength) * 2.2;
  binding.lightTarget.updateMatrixWorld(true);
  binding.sunLight.updateMatrixWorld(true);
  binding.sunLight.shadow.updateMatrices(binding.sunLight);
  binding.sunLight.shadow.needsUpdate = true;
};

const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  binding.scene.remove(binding.sunLight, binding.lightTarget);
};

export const buildShadowSimulationScene = (
  map: MaplibreMap,
  options: ShadowSceneOptions = {}
): ShadowSimulationScene => {
  const { shadowAreaMeters = DEFAULT_SHADOW_AREA_METERS, terrain } = options;
  const previousLight = map.getLight();
  let latestSolarPosition: SolarPosition | null = null;
  let disposed = false;
  let restoreMapLibreTerrain: (() => void) | null = null;
  const sceneLease = acquireSharedThreeScene(map);
  const terrainRuntime = terrain
    ? (() => {
        const mapCenter = map.getCenter();
        const { url, ...runtimeOptions } = terrain;
        return buildCesiumTerrainRuntime(
          SHADOW_SIMULATION_TERRAIN_RUNTIME_ID,
          url,
          [mapCenter.lng, mapCenter.lat],
          runtimeOptions
        );
      })()
    : null;
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    shadowAreaMeters
  );
  const genericBridges = new Map<GenericThreeLayer, GenericThreeShadowBridge>();

  const updateSharedShadowCoverage = () => {
    const mapCenter = map.getCenter();
    const center = sceneLease.layer.projectLngLatToScene?.(
      [mapCenter.lng, mapCenter.lat],
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ?? 0
    );
    if (!center) {
      terrainRuntime?.setShadowCamera(sharedBinding.sunLight.shadow.camera);
      return;
    }
    sharedBinding.center.copy(center);
    const bounds = map.getBounds();
    let radiusMeters = 0;
    for (const lngLat of [
      [bounds.getWest(), bounds.getSouth()],
      [bounds.getWest(), bounds.getNorth()],
      [bounds.getEast(), bounds.getSouth()],
      [bounds.getEast(), bounds.getNorth()],
    ] as [number, number][]) {
      const corner = sceneLease.layer.projectLngLatToScene?.(lngLat);
      if (corner)
        radiusMeters = Math.max(radiusMeters, corner.distanceTo(center));
    }
    sharedBinding.lightDistanceMeters = configureShadowCamera(
      sharedBinding.sunLight,
      Math.max(shadowAreaMeters, radiusMeters * 2.4)
    );
    if (latestSolarPosition) {
      applySolarPositionToBinding(
        sharedBinding,
        solarPositionToSceneDirection(latestSolarPosition)
      );
    }
    terrainRuntime?.setShadowCamera(sharedBinding.sunLight.shadow.camera);
    map.triggerRepaint();
  };

  map.on("move", updateSharedShadowCoverage);
  map.on("resize", updateSharedShadowCoverage);
  updateSharedShadowCoverage();

  if (terrainRuntime) {
    void terrainRuntime.ready.then((loaded) => {
      if (!loaded || disposed) return;
      restoreMapLibreTerrain = suppressMapLibreTerrainRendering(map);
      updateSharedShadowCoverage();
    });
  }

  const syncGenericBridges = () => {
    if (disposed) return;
    const currentLayers = new Set(getGenericThreeLayers(map));
    for (const [layer, bridge] of genericBridges) {
      if (currentLayers.has(layer)) continue;
      sceneLease.layer.removeRuntime(bridge.runtime.id);
      genericBridges.delete(layer);
    }
    for (const layer of currentLayers) {
      const bridge = genericBridges.get(layer);
      if (bridge) {
        bridge.sync();
        continue;
      }
      if (!layer.scene) continue;
      const nextBridge = buildGenericThreeShadowBridge(sceneLease.layer, layer);
      if (nextBridge) genericBridges.set(layer, nextBridge);
    }
    makeSceneMeshesShadeable(sceneLease.layer.getScene());
    updateSharedShadowCoverage();
    map.triggerRepaint();
  };

  const unsubscribeGenericLayers = subscribeGenericThreeLayers(
    map,
    syncGenericBridges
  );
  syncGenericBridges();

  const applyMapLibreLight = (position: SolarPosition) => {
    if (!map.isStyleLoaded()) return;
    const daylightStrength = THREE.MathUtils.clamp(
      Math.sin(THREE.MathUtils.degToRad(position.elevationDegrees)),
      0,
      1
    );
    map.setLight({
      anchor: "map",
      position: [1.5, position.azimuthDegrees, 90 - position.elevationDegrees],
      color: "#fff3df",
      intensity: 0.35 + daylightStrength * 0.55,
    });
  };

  const updateSolarPosition = (position: SolarPosition) => {
    latestSolarPosition = position;
    const direction = solarPositionToSceneDirection(position);
    applySolarPositionToBinding(sharedBinding, direction);
    terrainRuntime?.setShadowCamera(sharedBinding.sunLight.shadow.camera);
    applyMapLibreLight(position);
    map.triggerRepaint();
  };

  const restoreLighting = () => {
    if (disposed) return;
    if (latestSolarPosition) applyMapLibreLight(latestSolarPosition);
  };

  map.on("styledata", restoreLighting);

  return {
    updateSolarPosition,
    updateTerrainColor(color) {
      terrainRuntime?.setMaterialColor(color);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      map.off("styledata", restoreLighting);
      map.off("move", updateSharedShadowCoverage);
      map.off("resize", updateSharedShadowCoverage);
      unsubscribeGenericLayers();
      for (const bridge of genericBridges.values()) {
        if (sceneLease.layer.hasRuntime(bridge.runtime.id)) {
          sceneLease.layer.removeRuntime(bridge.runtime.id);
        }
      }
      genericBridges.clear();
      try {
        restoreMapLibreTerrain?.();
      } catch {
        // The style or terrain source may already be gone during map teardown.
      }
      restoreMapLibreTerrain = null;
      if (terrainRuntime && sceneLease.layer.hasRuntime(terrainRuntime.id)) {
        sceneLease.layer.removeRuntime(terrainRuntime.id);
      }
      disposeShadowLightBinding(sharedBinding);
      sceneLease.release();
      try {
        if (map.isStyleLoaded()) map.setLight(previousLight);
      } catch {
        // Nothing remains to restore after map teardown.
      }
    },
  };
};

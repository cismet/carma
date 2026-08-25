import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  acquireSharedThreeScene,
  getGenericThreeLayers,
  subscribeGenericThreeLayers,
} from "@carma-mapping/engines/maplibre";

import type { SolarPosition } from "./solar-position";

const DEFAULT_SHADOW_AREA_METERS = 900;
const DEFAULT_LIGHT_DISTANCE_METERS = 2_500;
const SHADOW_SIMULATION_SUN_NAME = "shadow-simulation-sun";

type GenericThreeLayer = ReturnType<typeof getGenericThreeLayers>[number];

type ShadowLightBinding = {
  scene: THREE.Scene;
  sunLight: THREE.DirectionalLight;
  lightTarget: THREE.Object3D;
  center: THREE.Vector3;
  renderer?: THREE.WebGLRenderer;
  previousShadowMapEnabled?: boolean;
  previousShadowMapType?: THREE.ShadowMapType;
};

export type ShadowSceneOptions = {
  shadowAreaMeters?: number;
};

export type ShadowSimulationScene = {
  updateSolarPosition: (position: SolarPosition) => void;
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
  shadowCamera.near = 10;
  shadowCamera.far = DEFAULT_LIGHT_DISTANCE_METERS * 2;
  shadowCamera.updateProjectionMatrix();
};

const makeSceneMeshesShadeable = (scene: THREE.Scene) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
};

const updateBindingCenter = (binding: ShadowLightBinding) => {
  const bounds = new THREE.Box3().setFromObject(binding.scene);
  if (bounds.isEmpty()) binding.center.set(0, 0, 0);
  else bounds.getCenter(binding.center);
};

const buildShadowLightBinding = (
  scene: THREE.Scene,
  shadowAreaMeters: number,
  renderer?: THREE.WebGLRenderer
): ShadowLightBinding => {
  const lightTarget = new THREE.Object3D();
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.5);
  sunLight.name = SHADOW_SIMULATION_SUN_NAME;
  sunLight.target = lightTarget;
  configureShadowCamera(sunLight, shadowAreaMeters);
  const binding: ShadowLightBinding = {
    scene,
    sunLight,
    lightTarget,
    center: new THREE.Vector3(),
    renderer,
    previousShadowMapEnabled: renderer?.shadowMap.enabled,
    previousShadowMapType: renderer?.shadowMap.type,
  };
  if (renderer) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  scene.add(lightTarget, sunLight);
  makeSceneMeshesShadeable(scene);
  updateBindingCenter(binding);
  return binding;
};

const refreshShadowLightBinding = (binding: ShadowLightBinding) => {
  makeSceneMeshesShadeable(binding.scene);
  updateBindingCenter(binding);
};

const applySolarPositionToBinding = (
  binding: ShadowLightBinding,
  direction: THREE.Vector3
) => {
  binding.lightTarget.position.copy(binding.center);
  binding.sunLight.position
    .copy(direction)
    .multiplyScalar(DEFAULT_LIGHT_DISTANCE_METERS)
    .add(binding.center);
  const daylightStrength = THREE.MathUtils.clamp(direction.y, 0, 1);
  binding.sunLight.intensity = 1.2 + Math.sqrt(daylightStrength) * 2.2;
  binding.sunLight.shadow.needsUpdate = true;
};

const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  binding.scene.remove(binding.sunLight, binding.lightTarget);
  if (binding.renderer) {
    binding.renderer.shadowMap.enabled =
      binding.previousShadowMapEnabled ?? false;
    if (binding.previousShadowMapType != null) {
      binding.renderer.shadowMap.type = binding.previousShadowMapType;
    }
  }
};

export const buildShadowSimulationScene = (
  map: MaplibreMap,
  options: ShadowSceneOptions = {}
): ShadowSimulationScene => {
  const { shadowAreaMeters = DEFAULT_SHADOW_AREA_METERS } = options;
  const previousLight = map.getLight();
  const sceneLease = acquireSharedThreeScene(map);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    shadowAreaMeters
  );
  const genericBindings = new Map<GenericThreeLayer, ShadowLightBinding>();

  let latestSolarPosition: SolarPosition | null = null;
  let disposed = false;

  const syncGenericBindings = () => {
    if (disposed) return;
    const currentLayers = new Set(getGenericThreeLayers(map));
    for (const [layer, binding] of genericBindings) {
      if (currentLayers.has(layer)) continue;
      disposeShadowLightBinding(binding);
      genericBindings.delete(layer);
    }
    for (const layer of currentLayers) {
      let binding = genericBindings.get(layer);
      if (!binding) {
        if (!layer.scene || !layer.renderer) continue;
        binding = buildShadowLightBinding(
          layer.scene,
          shadowAreaMeters,
          layer.renderer
        );
        genericBindings.set(layer, binding);
      } else {
        refreshShadowLightBinding(binding);
      }
      if (latestSolarPosition) {
        applySolarPositionToBinding(
          binding,
          solarPositionToSceneDirection(latestSolarPosition)
        );
      }
    }
    map.triggerRepaint();
  };

  const unsubscribeGenericLayers = subscribeGenericThreeLayers(
    map,
    syncGenericBindings
  );
  syncGenericBindings();

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
    for (const binding of genericBindings.values()) {
      applySolarPositionToBinding(binding, direction);
    }
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
    dispose() {
      if (disposed) return;
      disposed = true;
      map.off("styledata", restoreLighting);
      unsubscribeGenericLayers();
      for (const binding of genericBindings.values()) {
        disposeShadowLightBinding(binding);
      }
      genericBindings.clear();
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

import * as THREE from "three";

import {
  DEFAULT_SHADOW_QUALITY,
  SHADOW_SCENE_USER_DATA,
  type ShadowQualityMultiplier,
} from "../core/shadow-types";
import {
  ATMOSPHERIC_DISPLAY_EXPOSURE,
  buildAtmosphericSky,
} from "./atmospheric-sky";
import type { AtmosphericSunlightSample } from "./atmospheric-sunlight";
import { ShadowController } from "./shadow-controller";
import { makeSceneMeshesShadeable } from "./shadow-scene-mesh";
import type { SunVectorGizmo } from "./shadow-sun-vector";

export const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
export const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SHADOW_SIMULATION_SKY_LIGHT_NAME = "shadow-simulation-sky-light";

export type ShadowLightBinding = {
  scene: THREE.Scene;
  /** Host of light, sun vector and shadow pages: the scene's local-frame group. */
  frame: THREE.Object3D;
  controller: ShadowController;
  skyLight: THREE.LightProbe;
  atmosphericSky: ReturnType<typeof buildAtmosphericSky>;
  ambientLightIntensities: Map<THREE.AmbientLight, number>;
  lightTarget: THREE.Object3D;
  sunVector: SunVectorGizmo | null;
  sunVectorRoot: THREE.Group;
  center: THREE.Vector3;
  shadowCameraOffsetMeters: number;
  shadowAreaMeters: number;
  sunVectorLengthMeters: number;
  sunVectorVisible: boolean;
  shadowQuality: ShadowQualityMultiplier;
  shadowIntensity: number;
  directionToSun: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  receiverWorldPoints: THREE.Vector3[];
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  dirty: boolean;
};

export const updateBindingCenter = (binding: ShadowLightBinding) => {
  const bounds = new THREE.Box3().setFromObject(binding.scene);
  if (bounds.isEmpty()) binding.center.set(0, 0, 0);
  else bounds.getCenter(binding.center);
};

export const buildShadowLightBinding = (
  scene: THREE.Scene,
  frame: THREE.Object3D,
  shadowAreaMeters: number,
  groundAlbedo: THREE.Color
): ShadowLightBinding => {
  const controller = new ShadowController(frame);
  const sunLight = controller.lights[0];
  const lightTarget = sunLight.target;
  // Stable, empty host for the tiled renderer; debug geometry is demand-loaded.
  const sunVectorRoot = new THREE.Group();
  sunVectorRoot.visible = false;
  sunVectorRoot.userData[SHADOW_SCENE_USER_DATA.OVERLAY] = true;
  const skyLight = new THREE.LightProbe(undefined, 0);
  skyLight.name = SHADOW_SIMULATION_SKY_LIGHT_NAME;
  const atmosphericSky = buildAtmosphericSky(groundAlbedo);
  atmosphericSky.mesh.userData[SHADOW_SCENE_USER_DATA.OVERLAY] = true;
  const ambientLightIntensities = new Map<THREE.AmbientLight, number>();
  scene.traverse((object) => {
    const light = object as THREE.AmbientLight;
    if (light.isAmbientLight) {
      ambientLightIntensities.set(light, light.intensity);
    }
  });
  const binding: ShadowLightBinding = {
    scene,
    frame,
    controller,
    skyLight,
    atmosphericSky,
    ambientLightIntensities,
    lightTarget,
    sunVector: null,
    sunVectorRoot,
    center: new THREE.Vector3(),
    shadowCameraOffsetMeters: Math.max(
      DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
      shadowAreaMeters * 1.5
    ),
    shadowAreaMeters,
    sunVectorLengthMeters: shadowAreaMeters * SUN_VECTOR_VIEWPORT_LENGTH_FACTOR,
    sunVectorVisible: false,
    shadowQuality: DEFAULT_SHADOW_QUALITY,
    shadowIntensity: 1,
    directionToSun: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(0xfff2d8),
    sunIntensity: ATMOSPHERIC_DISPLAY_EXPOSURE,
    receiverWorldPoints: [],
    minimumElevationMeters: 0,
    maximumElevationMeters: 0,
    dirty: true,
  };
  makeSceneMeshesShadeable(scene);
  updateBindingCenter(binding);
  scene.add(skyLight);
  scene.add(atmosphericSky.mesh);
  return binding;
};

export const applyAtmosphericSkyLightToBinding = (
  binding: ShadowLightBinding,
  sample: AtmosphericSunlightSample
) => {
  binding.scene.traverse((object) => {
    const light = object as THREE.AmbientLight;
    if (light.isAmbientLight && !binding.ambientLightIntensities.has(light)) {
      binding.ambientLightIntensities.set(light, light.intensity);
    }
  });
  const coefficients = sample.skyIrradianceCoefficients;
  if (coefficients?.length === binding.skyLight.sh.coefficients.length) {
    coefficients.forEach((coefficient, index) => {
      binding.skyLight.sh.coefficients[index].copy(coefficient);
    });
    binding.skyLight.intensity = ATMOSPHERIC_DISPLAY_EXPOSURE;
    for (const ambientLight of binding.ambientLightIntensities.keys()) {
      ambientLight.intensity = 0;
    }
    return;
  }
  binding.skyLight.sh.zero();
  binding.skyLight.intensity = 0;
  for (const [ambientLight, intensity] of binding.ambientLightIntensities) {
    ambientLight.intensity = intensity;
  }
};

export const applySolarPositionToBinding = (
  binding: ShadowLightBinding,
  direction: THREE.Vector3,
  color: THREE.ColorRepresentation = 0xfff2d8,
  intensity?: number,
  invalidate = true
) => {
  const normalizedDirection = direction.clone().normalize();
  binding.directionToSun.copy(normalizedDirection);
  binding.sunColor.set(color);
  binding.lightTarget.position.copy(binding.center);
  for (const sunLight of binding.controller.lights) {
    sunLight.target.position.copy(binding.center);
    sunLight.position
      .copy(normalizedDirection)
      .multiplyScalar(binding.shadowCameraOffsetMeters)
      .add(binding.center);
    sunLight.color.copy(binding.sunColor);
  }
  binding.sunVector?.update(
    binding.center,
    normalizedDirection,
    binding.sunVectorLengthMeters
  );
  binding.sunVectorRoot.visible =
    binding.sunVectorVisible && !!binding.sunVector;
  binding.sunIntensity = intensity ?? ATMOSPHERIC_DISPLAY_EXPOSURE;
  for (const sunLight of binding.controller.lights) {
    sunLight.intensity = binding.sunIntensity;
  }
  binding.lightTarget.updateMatrixWorld(true);
  for (const sunLight of binding.controller.lights) {
    sunLight.updateMatrixWorld(true);
  }
  if (!invalidate) return;
  binding.controller.invalidate();
  binding.dirty = true;
};

export const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  for (const [ambientLight, intensity] of binding.ambientLightIntensities) {
    ambientLight.intensity = intensity;
  }
  binding.scene.remove(binding.skyLight);
  binding.scene.remove(binding.atmosphericSky.mesh);
  binding.sunVectorRoot.removeFromParent();
  binding.sunVector?.dispose();
  binding.atmosphericSky.dispose();
  binding.controller.dispose();
};

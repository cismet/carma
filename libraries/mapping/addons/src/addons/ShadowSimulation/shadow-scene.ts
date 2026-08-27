import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  subscribeGenericThreeLayers,
  suppressMapLibreRegularStyleLayers,
  suppressMapLibreTerrainRendering,
} from "@carma-mapping/engines/maplibre";
import type {
  CesiumTerrainRuntimeOptions,
  SharedThreeSceneLayer,
  SharedThreeSceneRuntime,
} from "@carma-mapping/engines/maplibre";

import type { SolarPosition } from "./solar-position";
import {
  AtmosphericSunlightEvaluator,
  type AtmosphericSunlightSample,
  type AtmosphericSunlightOptions,
} from "./atmospheric-sunlight";
import {
  CASTER_RELIEF_MARGIN_METERS,
  restingShadowMapSize,
  TiledShadowController,
} from "./tiled-shadow-controller";
import {
  clearShadowProjectionDebugSnapshot,
  hasShadowProjectionDebugListeners,
  publishShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

const FALLBACK_SHADOW_AREA_METERS = 900;
/**
 * How far from the view anchor the single shadow buffer still resolves
 * shadows. Screen corners near the horizon unproject kilometres away; letting
 * them stretch the fit spreads the buffer's texels over the whole valley and
 * every shadow turns to mush. Beyond this radius the ground keeps its sun
 * term but receives no mapped shadow.
 */
const MAX_RECEIVER_DISTANCE_METERS = 4_000;
/**
 * The absolute elevation band the terrain shadow coverage sweeps, metres
 * above sea level. A regional constant on purpose, see
 * updateTerrainShadowCoverage: Wuppertal's ground lies between roughly 100
 * and 350 m, with headroom on both sides.
 */
const COVERAGE_ELEVATION_BAND_METERS: readonly [number, number] = [0, 500];
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
const SHADOW_SIMULATION_SUN_VECTOR_NAME = "shadow-simulation-sun-vector";
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-cesium-terrain";
const SUN_VECTOR_COLOR = 0xf59e0b;
const SUN_VECTOR_HEAD_LENGTH_FACTOR = 0.18;
const SUN_VECTOR_HEAD_WIDTH_FACTOR = 0.07;
const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SUN_VECTOR_ANGLE_RADIUS_FACTOR = 0.22;
const SUN_VECTOR_ANGLE_SEGMENTS = 24;
const SHADOW_OVERLAY_MARKER = "isShadowSimulationOverlay";
// Takram returns relative photometric direct radiance and sky irradiance. Keep
// their physical ratio intact by applying one scene exposure to both, entirely
// independent of the UI's shadow-opacity control.
const ATMOSPHERIC_LIGHT_EXPOSURE = 2;
const SHADOW_SIMULATION_SKY_LIGHT_NAME = "shadow-simulation-sky-light";
const SHADOW_BUFFER_BORDER_COLORS = [
  0xf59e0b, 0xea580c, 0xdc2626, 0x9333ea,
] as const;
const SHADOW_BUFFER_BOX_SEGMENTS = [
  // near/far rectangles
  0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4,
  // connecting edges
  0, 4, 1, 5, 2, 6, 3, 7,
  // X diagonals on all six faces
  0, 2, 1, 3, 4, 6, 5, 7, 0, 7, 3, 4, 1, 6, 2, 5, 0, 5, 1, 4, 3, 6, 2, 7,
] as const;

type GenericThreeLayer = ReturnType<typeof getGenericThreeLayers>[number];

type SunVectorGizmo = {
  root: THREE.ArrowHelper;
  shaft: THREE.Mesh;
  origin: THREE.Mesh;
  groundRay: THREE.Line;
  elevationArc: THREE.Line;
  dispose: () => void;
};

type ShadowLightBinding = {
  scene: THREE.Scene;
  controller: TiledShadowController;
  skyLight: THREE.LightProbe;
  ambientLightIntensities: Map<THREE.AmbientLight, number>;
  lightTarget: THREE.Object3D;
  sunVector: SunVectorGizmo;
  shadowBufferBoxes: THREE.LineSegments[];
  center: THREE.Vector3;
  shadowCameraOffsetMeters: number;
  shadowAreaMeters: number;
  sunVectorLengthMeters: number;
  sunVectorVisible: boolean;
  projectionDebugVisible: boolean;
  activeShadowTileCount: number;
  shadowQuality: ShadowQualityMultiplier;
  shadowMode: ShadowMode;
  shadowIntensity: number;
  directionToSun: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  receiverWorldPoints: THREE.Vector3[];
  minimumElevationMeters: number;
  maximumElevationMeters: number;
  dirty: boolean;
};

type GenericThreeShadowBridge = {
  runtime: SharedThreeSceneRuntime;
  sync: () => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
};

export type ShadowSceneOptions = {
  shadowAreaMeters?: number;
  terrain?: ShadowTerrainOptions;
};

export type ShadowTerrainOptions = Readonly<{ url: string }> &
  Omit<CesiumTerrainRuntimeOptions, "onError" | "onContentChanged">;

export type ShadowBuildingAppearance = Readonly<{
  fullOpacity: boolean;
  uniformColor: string | null;
}>;

/**
 * Texel-budget multiplier behind the quality levels: buffer edges scale with
 * its square root. In single mode 4 - 4096, 16 - 8192, 64 - 16384, every
 * size clamped to what the device's textures actually allow, so the top
 * level settles on the hardware maximum. Advanced-mode tiles run at half the
 * edge; soft disc samples use the full edge up to their memory ceiling.
 */
export type ShadowQualityMultiplier = 4 | 16 | 64;
export type ShadowMode = "single" | "advanced";

export const DEFAULT_SHADOW_QUALITY: ShadowQualityMultiplier = 64;
export const DEFAULT_SHADOW_MODE: ShadowMode = "single";
export const DEFAULT_SHADOW_SURFACE_COLOR = "#d3d3d3";

const SHADOW_SIMULATION_BACKGROUND_LAYER_ID = "__shadow-simulation-background";

export type ShadowSimulationScene = {
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateShadowMode: (mode: ShadowMode) => void;
  /** Sample the sun as a disc for distance-widening penumbras (single mode). */
  updateSoftSunShadows: (enabled: boolean) => void;
  /** While the time animation runs, static accumulation stays off. */
  updateTimeAnimating: (animating: boolean) => void;
  /** Ask for a fresh projection-debug snapshot, e.g. when the panel opens. */
  refreshProjectionDebug: () => void;
  updateShadowIntensity: (intensity: number) => void;
  updateSunDebugVectorVisibility: (visible: boolean) => void;
  updateShadowBufferDebugVisibility: (visible: boolean) => void;
  updateAtmosphericLutUsage: (options: AtmosphericSunlightOptions) => void;
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

const makeMeshShadeable = (
  mesh: THREE.Mesh,
  shadowController?: TiledShadowController
) => {
  if (mesh.userData[SHADOW_OVERLAY_MARKER]) return;
  mesh.castShadow = mesh.userData.disableShadowCasting !== true;
  mesh.receiveShadow = true;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  // Closed solids write their far walls into the depth map. The stored depth
  // then sits behind the lit wall, which removes both self-shadow acne and
  // the bright leak line along the building's base in one go. The terrain is
  // an open heightfield and keeps its front faces; the texel-scaled normal
  // bias absorbs its acne.
  if (!mesh.userData.isShadowTerrainSurface) {
    for (const material of materials) {
      material.shadowSide = THREE.BackSide;
    }
  }
  if (shadowController) {
    for (const material of materials) {
      shadowController.setupMaterial(material);
    }
  }
};

const buildSunVector = () => {
  const helper = new THREE.ArrowHelper(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(),
    1,
    SUN_VECTOR_COLOR
  );
  helper.name = SHADOW_SIMULATION_SUN_VECTOR_NAME;
  helper.visible = false;
  helper.frustumCulled = false;
  helper.line.visible = false;
  const overlayMaterial = new THREE.MeshBasicMaterial({
    color: SUN_VECTOR_COLOR,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  });
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 1, 12),
    overlayMaterial
  );
  shaft.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-shaft`;
  shaft.matrixAutoUpdate = false;
  const origin = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 8),
    overlayMaterial
  );
  origin.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-origin`;
  origin.matrixAutoUpdate = false;
  const lineMaterial = new THREE.LineBasicMaterial({
    color: SUN_VECTOR_COLOR,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    transparent: true,
  });
  const groundRay = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
  groundRay.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-ground-ray`;
  const elevationArc = new THREE.Line(new THREE.BufferGeometry(), lineMaterial);
  elevationArc.name = `${SHADOW_SIMULATION_SUN_VECTOR_NAME}-elevation-arc`;
  helper.add(shaft, origin, groundRay, elevationArc);
  for (const part of [
    helper.line,
    helper.cone,
    shaft,
    origin,
    groundRay,
    elevationArc,
  ]) {
    part.userData[SHADOW_OVERLAY_MARKER] = true;
    part.castShadow = false;
    part.receiveShadow = false;
    part.frustumCulled = false;
    part.renderOrder = 10_000;
    const material = part.material as THREE.Material;
    material.depthTest = false;
    material.depthWrite = false;
    material.toneMapped = false;
    material.transparent = true;
  }
  return {
    root: helper,
    shaft,
    origin,
    groundRay,
    elevationArc,
    dispose: () => {
      helper.dispose();
      shaft.geometry.dispose();
      origin.geometry.dispose();
      overlayMaterial.dispose();
      groundRay.geometry.dispose();
      elevationArc.geometry.dispose();
      lineMaterial.dispose();
    },
  };
};

const makeSceneMeshesShadeable = (
  scene: THREE.Scene,
  shadowController?: TiledShadowController
) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    makeMeshShadeable(mesh);
  });
  shadowController?.syncSceneMaterials(scene);
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

const disposeCopiedMaterials = (
  root: THREE.Object3D,
  shadowController?: TiledShadowController
) => {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      shadowController?.releaseMaterial(material);
      material.dispose();
    }
  });
};

const getVisibleSceneElevationRange = (
  scene: THREE.Scene,
  fallbackElevation: number
): readonly [number, number] => {
  scene.updateMatrixWorld(true);
  let minimum = fallbackElevation;
  let maximum = fallbackElevation;
  const worldBounds = new THREE.Box3();
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (
      mesh.userData[SHADOW_OVERLAY_MARKER] ||
      (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) ||
      !mesh.geometry?.getAttribute("position")?.count
    ) {
      return;
    }
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (!mesh.geometry.boundingBox) return;
    worldBounds.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
    minimum = Math.min(minimum, worldBounds.min.y);
    maximum = Math.max(maximum, worldBounds.max.y);
  });
  return [minimum, maximum];
};

const applyBuildingAppearance = (
  root: THREE.Object3D,
  appearance: ShadowBuildingAppearance
) => {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.userData.isBuilding) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (appearance.fullOpacity) {
        material.opacity = 1;
        material.transparent = false;
        material.depthWrite = true;
      }
      const colorMaterial = material as THREE.Material & {
        color?: THREE.Color;
        vertexColors?: boolean;
      };
      if (appearance.uniformColor && colorMaterial.color) {
        colorMaterial.color.set(appearance.uniformColor);
        colorMaterial.vertexColors = false;
      }
      material.needsUpdate = true;
    }
  });
};

const buildGenericThreeShadowBridge = (
  sharedLayer: SharedThreeSceneLayer,
  layer: GenericThreeLayer,
  initialBuildingAppearance: ShadowBuildingAppearance,
  shadowController?: TiledShadowController
): GenericThreeShadowBridge | null => {
  const origin = layer._originMerc?.toLngLat();
  if (!origin) return null;

  const root = new THREE.Group();
  root.name = `shadow-simulation-copy-${layer.id}`;
  const originalVisibility = new Map<THREE.Object3D, boolean>();
  let buildingAppearance = initialBuildingAppearance;
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
    disposeCopiedMaterials(root, shadowController);
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
      copy.visible = true;
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(source.matrixWorld);
      copy.material = Array.isArray(source.material)
        ? source.material.map((material) => material.clone())
        : source.material.clone();
      makeMeshShadeable(copy, shadowController);
      originalVisibility.set(source, source.visible);
      source.visible = false;
      root.add(copy);
    }
    root.visible = root.children.length > 0;
    applyBuildingAppearance(root, buildingAppearance);
  };

  const runtime: SharedThreeSceneRuntime = {
    id: `shadow-simulation-generic-${layer.id}`,
    originLngLat: [origin.lng, origin.lat],
    root,
    update: () => undefined,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      restoreOriginals();
      disposeCopiedMaterials(root, shadowController);
      root.clear();
    },
  };
  sync();
  if (!root.visible) {
    runtime.dispose();
    return null;
  }
  sharedLayer.addRuntime(runtime);
  return {
    runtime,
    sync,
    updateBuildingAppearance(appearance) {
      buildingAppearance = appearance;
      sync();
    },
  };
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
  const controller = new TiledShadowController(scene);
  const sunLight = controller.lights[0];
  const lightTarget = sunLight.target;
  const sunVector = buildSunVector();
  const shadowBufferBoxes = controller.lights.map((_light, index) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(
        new Float32Array(SHADOW_BUFFER_BOX_SEGMENTS.length * 3),
        3
      )
    );
    const material = new THREE.LineBasicMaterial({
      color:
        SHADOW_BUFFER_BORDER_COLORS[index % SHADOW_BUFFER_BORDER_COLORS.length],
      depthTest: false,
      depthWrite: false,
      transparent: true,
      opacity: 0.9,
      toneMapped: false,
    });
    const box = new THREE.LineSegments(geometry, material);
    box.name = `shadow-simulation-shadow-buffer-${index}`;
    box.userData[SHADOW_OVERLAY_MARKER] = true;
    box.visible = false;
    box.frustumCulled = false;
    box.renderOrder = 10_000;
    return box;
  });
  const skyLight = new THREE.LightProbe(undefined, 0);
  skyLight.name = SHADOW_SIMULATION_SKY_LIGHT_NAME;
  const ambientLightIntensities = new Map<THREE.AmbientLight, number>();
  scene.traverse((object) => {
    const light = object as THREE.AmbientLight;
    if (light.isAmbientLight) {
      ambientLightIntensities.set(light, light.intensity);
    }
  });
  const binding: ShadowLightBinding = {
    scene,
    controller,
    skyLight,
    ambientLightIntensities,
    lightTarget,
    sunVector,
    shadowBufferBoxes,
    center: new THREE.Vector3(),
    shadowCameraOffsetMeters: Math.max(
      DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
      shadowAreaMeters * 1.5
    ),
    shadowAreaMeters,
    sunVectorLengthMeters: shadowAreaMeters * SUN_VECTOR_VIEWPORT_LENGTH_FACTOR,
    sunVectorVisible: false,
    projectionDebugVisible: false,
    activeShadowTileCount: 0,
    shadowQuality: DEFAULT_SHADOW_QUALITY,
    shadowMode: DEFAULT_SHADOW_MODE,
    shadowIntensity: 1,
    directionToSun: new THREE.Vector3(0, 1, 0),
    sunColor: new THREE.Color(0xfff2d8),
    sunIntensity: ATMOSPHERIC_LIGHT_EXPOSURE,
    receiverWorldPoints: [],
    minimumElevationMeters: 0,
    maximumElevationMeters: 0,
    dirty: true,
  };
  makeSceneMeshesShadeable(scene, controller);
  updateBindingCenter(binding);
  scene.add(skyLight);
  scene.add(sunVector.root);
  scene.add(...shadowBufferBoxes);
  return binding;
};

const updateShadowBufferBorders = (
  binding: ShadowLightBinding,
  activeTileCount = binding.activeShadowTileCount
) => {
  binding.activeShadowTileCount = activeTileCount;
  binding.shadowBufferBoxes.forEach((box, index) => {
    box.visible = binding.projectionDebugVisible && index < activeTileCount;
    if (!box.visible) return;

    const light = binding.controller.lights[index];
    const shadowCamera = light?.shadow.camera;
    if (!light || !shadowCamera) {
      box.visible = false;
      return;
    }
    light.target.updateMatrixWorld(true);
    shadowCamera.updateMatrixWorld(true);
    const corners = [
      [-1, -1, -1],
      [1, -1, -1],
      [1, 1, -1],
      [-1, 1, -1],
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z).unproject(shadowCamera));
    const position = box.geometry.getAttribute(
      "position"
    ) as THREE.BufferAttribute;
    SHADOW_BUFFER_BOX_SEGMENTS.forEach((cornerIndex, vertexIndex) => {
      const point = corners[cornerIndex]!;
      position.setXYZ(vertexIndex, point.x, point.y, point.z);
    });
    position.needsUpdate = true;
    box.geometry.computeBoundingSphere();
  });
};

const applyAtmosphericSkyLightToBinding = (
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
    binding.skyLight.intensity = ATMOSPHERIC_LIGHT_EXPOSURE;
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

const applySolarPositionToBinding = (
  binding: ShadowLightBinding,
  direction: THREE.Vector3,
  color: THREE.ColorRepresentation = 0xfff2d8,
  intensity?: number
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
  const vectorLength = binding.sunVectorLengthMeters;
  const headLength = vectorLength * SUN_VECTOR_HEAD_LENGTH_FACTOR;
  const shaftLength = vectorLength - headLength;
  binding.sunVector.root.position.copy(binding.center);
  binding.sunVector.root.setDirection(normalizedDirection);
  binding.sunVector.root.setLength(
    vectorLength,
    headLength,
    vectorLength * SUN_VECTOR_HEAD_WIDTH_FACTOR
  );
  binding.sunVector.shaft.position.set(0, shaftLength / 2, 0);
  binding.sunVector.shaft.scale.set(
    vectorLength * 0.006,
    shaftLength,
    vectorLength * 0.006
  );
  binding.sunVector.shaft.updateMatrix();
  binding.sunVector.origin.scale.setScalar(vectorLength * 0.012);
  binding.sunVector.origin.updateMatrix();
  const horizontalDirection = new THREE.Vector3(
    normalizedDirection.x,
    0,
    normalizedDirection.z
  );
  if (horizontalDirection.lengthSq() < Number.EPSILON) {
    horizontalDirection.set(0, 0, -1);
  } else {
    horizontalDirection.normalize();
  }
  const angleRadius = vectorLength * SUN_VECTOR_ANGLE_RADIUS_FACTOR;
  const inverseArrowRotation = binding.sunVector.root.quaternion
    .clone()
    .invert();
  binding.sunVector.groundRay.geometry.setFromPoints([
    new THREE.Vector3(),
    horizontalDirection
      .clone()
      .multiplyScalar(angleRadius)
      .applyQuaternion(inverseArrowRotation),
  ]);
  const elevationRadians = Math.asin(
    THREE.MathUtils.clamp(normalizedDirection.y, -1, 1)
  );
  binding.sunVector.elevationArc.geometry.setFromPoints(
    Array.from({ length: SUN_VECTOR_ANGLE_SEGMENTS + 1 }, (_, index) => {
      const angle = (elevationRadians * index) / SUN_VECTOR_ANGLE_SEGMENTS;
      return horizontalDirection
        .clone()
        .multiplyScalar(Math.cos(angle) * angleRadius)
        .add(new THREE.Vector3(0, Math.sin(angle) * angleRadius, 0))
        .applyQuaternion(inverseArrowRotation);
    })
  );
  binding.sunVector.root.visible = binding.sunVectorVisible;
  binding.sunVector.root.updateMatrixWorld(true);
  binding.sunIntensity = intensity ?? ATMOSPHERIC_LIGHT_EXPOSURE;
  for (const sunLight of binding.controller.lights) {
    sunLight.intensity = binding.sunIntensity;
  }
  binding.lightTarget.updateMatrixWorld(true);
  for (const sunLight of binding.controller.lights) {
    sunLight.updateMatrixWorld(true);
  }
  binding.controller.invalidate();
  binding.dirty = true;
};

const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  for (const [ambientLight, intensity] of binding.ambientLightIntensities) {
    ambientLight.intensity = intensity;
  }
  binding.scene.remove(binding.skyLight);
  binding.scene.remove(binding.sunVector.root);
  for (const box of binding.shadowBufferBoxes) {
    binding.scene.remove(box);
    box.geometry.dispose();
    const materials = Array.isArray(box.material)
      ? box.material
      : [box.material];
    materials.forEach((material) => material.dispose());
  }
  binding.sunVector.dispose();
  binding.controller.dispose();
};

export const buildShadowSimulationScene = (
  map: MaplibreMap,
  options: ShadowSceneOptions = {}
): ShadowSimulationScene => {
  const { shadowAreaMeters: configuredShadowAreaMeters, terrain } = options;
  const initialShadowAreaMeters =
    configuredShadowAreaMeters ?? FALLBACK_SHADOW_AREA_METERS;
  const previousLight = map.getLight();
  let latestSolarPosition: SolarPosition | null = null;
  let latestBuildingAppearance: ShadowBuildingAppearance = {
    fullOpacity: true,
    uniformColor: null,
  };
  let latestShadowIntensity = 1;
  let latestAtmosphericSunlight: AtmosphericSunlightSample | null = null;
  let atmosphericSunlightOptions: AtmosphericSunlightOptions = {
    useTransmittanceLut: true,
    useIrradianceLut: true,
  };
  let disposed = false;
  const restoreMapLibreStyleLayers = suppressMapLibreRegularStyleLayers(map);
  let terrainColor = new THREE.Color(
    terrain?.material?.color ?? DEFAULT_SHADOW_SURFACE_COLOR
  );
  const ensureShadowBackground = () => {
    if (disposed || !map.isStyleLoaded()) return;
    const color = `#${terrainColor.getHexString()}`;
    try {
      if (!map.getLayer(SHADOW_SIMULATION_BACKGROUND_LAYER_ID)) {
        const firstLayerId = map.getStyle().layers?.[0]?.id;
        map.addLayer(
          {
            id: SHADOW_SIMULATION_BACKGROUND_LAYER_ID,
            type: "background",
            paint: {
              "background-color": color,
              "background-opacity": 1,
            },
          },
          firstLayerId
        );
        return;
      }
      if (
        map.getPaintProperty(
          SHADOW_SIMULATION_BACKGROUND_LAYER_ID,
          "background-color"
        ) !== color
      ) {
        map.setPaintProperty(
          SHADOW_SIMULATION_BACKGROUND_LAYER_ID,
          "background-color",
          color
        );
      }
      if (
        map.getPaintProperty(
          SHADOW_SIMULATION_BACKGROUND_LAYER_ID,
          "background-opacity"
        ) !== 1
      ) {
        map.setPaintProperty(
          SHADOW_SIMULATION_BACKGROUND_LAYER_ID,
          "background-opacity",
          1
        );
      }
    } catch {
      // A style replacement or map teardown can race this callback.
    }
  };
  map.on("styledata", ensureShadowBackground);
  ensureShadowBackground();
  let restoreMapLibreTerrain: (() => void) | null = null;
  const sceneLease = acquireSharedThreeScene(map);
  const atmosphericSunlight = new AtmosphericSunlightEvaluator();
  let invalidateShadowMap = () => undefined;
  let refreshTerrainShadowState = () => invalidateShadowMap();
  const terrainRuntime = terrain
    ? (() => {
        const mapCenter = map.getCenter();
        const { url, ...runtimeOptions } = terrain;
        return buildCesiumTerrainRuntime(
          SHADOW_SIMULATION_TERRAIN_RUNTIME_ID,
          url,
          [mapCenter.lng, mapCenter.lat],
          {
            ...runtimeOptions,
            onContentChanged: () => refreshTerrainShadowState(),
          }
        );
      })()
    : null;
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    initialShadowAreaMeters
  );
  const applyMapLibreLightSample = (sample: AtmosphericSunlightSample) => {
    if (!map.isStyleLoaded()) return;
    const nextPosition: [number, number, number] = [
      1.5,
      sample.azimuthDegrees,
      90 - sample.elevationDegrees,
    ];
    const nextColor = `#${sample.color.getHexString()}`;
    const nextIntensity = THREE.MathUtils.clamp(sample.relativeIntensity, 0, 1);
    const currentLight = map.getLight();
    const currentPosition = currentLight.position;
    if (
      currentLight.anchor === "map" &&
      Array.isArray(currentPosition) &&
      currentPosition.length === nextPosition.length &&
      currentPosition.every((value, index) => value === nextPosition[index]) &&
      currentLight.color === nextColor &&
      currentLight.intensity === nextIntensity
    ) {
      return;
    }
    map.setLight({
      anchor: "map",
      position: nextPosition,
      color: nextColor,
      intensity: nextIntensity,
    });
  };
  const evaluateAtmosphericSunlightForMap = (position: SolarPosition) => {
    const mapCenter = map.getCenter();
    const altitudeMeters =
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ?? 0;
    atmosphericSunlight.ensure(() => {
      if (disposed || !latestSolarPosition) return;
      const sample = evaluateAtmosphericSunlightForMap(latestSolarPosition);
      applyMapLibreLightSample(sample);
      map.triggerRepaint();
    }, atmosphericSunlightOptions);
    const sample = atmosphericSunlight.evaluate(
      position.instant,
      {
        longitude: mapCenter.lng,
        latitude: mapCenter.lat,
        altitudeMeters,
      },
      atmosphericSunlightOptions
    );
    latestAtmosphericSunlight = sample;
    applyAtmosphericSkyLightToBinding(sharedBinding, sample);
    applySolarPositionToBinding(
      sharedBinding,
      sample.directionToSun,
      sample.radiance,
      ATMOSPHERIC_LIGHT_EXPOSURE
    );
    return sample;
  };
  invalidateShadowMap = () => {
    if (disposed) return;
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
  };
  const genericBridges = new Map<GenericThreeLayer, GenericThreeShadowBridge>();
  let cachedElevationRange: readonly [number, number] | null = null;

  // ── Terrain shadow coverage ────────────────────────────────────────────
  //
  // Which ground has to be loaded for shadows is a question about the view
  // and the sun, nothing else: sweep the visible extent toward the sun and
  // everything inside that volume can cast into it. Deriving the coverage
  // from the *fitted* render camera instead — as this used to work — couples
  // the tile selection to a camera that follows every fit, vanishes on failed
  // fits and rests during gestures, which is what unloaded sun-side tiles
  // mid-view. This camera is analytic, always defined, and only ever moves
  // when the view or the sun does.
  const terrainCoverageCamera = new THREE.OrthographicCamera();
  terrainCoverageCamera.name = "shadow-simulation-terrain-coverage";
  const coverageBasisX = new THREE.Vector3();
  const coverageBasisY = new THREE.Vector3();
  const coverageBasisZ = new THREE.Vector3();
  const coverageRotation = new THREE.Matrix4();
  const coverageProbe = new THREE.Vector3();
  const updateTerrainShadowCoverage = () => {
    if (!terrainRuntime) return;
    const points = sharedBinding.receiverWorldPoints;
    const toSun = sharedBinding.directionToSun;
    if (points.length === 0 || toSun.lengthSq() < 1e-6) return;

    coverageBasisZ.copy(toSun).normalize();
    if (Math.abs(coverageBasisZ.y) > 0.99) {
      coverageBasisX.set(1, 0, 0);
    } else {
      coverageBasisX.crossVectors(new THREE.Vector3(0, 1, 0), coverageBasisZ);
      coverageBasisX.normalize();
    }
    coverageBasisY.crossVectors(coverageBasisZ, coverageBasisX);

    // The sweep deliberately spans a fixed regional elevation band instead of
    // the elevation range of the currently visible tiles. The visible range
    // depends on which tiles are loaded, and a sweep built from it would
    // reshape with every arriving batch, superseding the selection that
    // requested them - the tile set never settles. A static band keeps the
    // sweep a pure function of view and sun.
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (const point of points) {
      for (const elevation of COVERAGE_ELEVATION_BAND_METERS) {
        coverageProbe.set(point.x, elevation, point.z);
        const x = coverageProbe.dot(coverageBasisX);
        const y = coverageProbe.dot(coverageBasisY);
        const z = coverageProbe.dot(coverageBasisZ);
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
    }
    const elevationSine = Math.max(0.04, coverageBasisZ.y);
    const casterReachMeters = THREE.MathUtils.clamp(
      (COVERAGE_ELEVATION_BAND_METERS[1] -
        COVERAGE_ELEVATION_BAND_METERS[0] +
        CASTER_RELIEF_MARGIN_METERS) /
        elevationSine +
        50,
      50,
      10_000
    );
    maxZ += casterReachMeters;

    // Coarsely quantized on purpose. Streaming tiles widen the visible
    // elevation range, the range feeds this box, and an unquantized box would
    // supersede the terrain's in-flight tile batch on every arrival - a
    // livelock in which no batch ever finishes. On a 50 m grid the box only
    // moves for changes that matter at coverage scale.
    const gridStep = 50;
    const snapDown = (value: number) => Math.floor(value / gridStep) * gridStep;
    const snapUp = (value: number) => Math.ceil(value / gridStep) * gridStep;
    minX = snapDown(minX);
    maxX = snapUp(maxX);
    minY = snapDown(minY);
    maxY = snapUp(maxY);
    minZ = snapDown(minZ);
    maxZ = snapUp(maxZ);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    terrainCoverageCamera.position
      .set(0, 0, 0)
      .addScaledVector(coverageBasisX, centerX)
      .addScaledVector(coverageBasisY, centerY)
      .addScaledVector(coverageBasisZ, maxZ);
    coverageRotation.makeBasis(coverageBasisX, coverageBasisY, coverageBasisZ);
    terrainCoverageCamera.quaternion.setFromRotationMatrix(coverageRotation);
    terrainCoverageCamera.left = -(maxX - minX) / 2;
    terrainCoverageCamera.right = (maxX - minX) / 2;
    terrainCoverageCamera.bottom = -(maxY - minY) / 2;
    terrainCoverageCamera.top = (maxY - minY) / 2;
    terrainCoverageCamera.near = 0;
    terrainCoverageCamera.far = Math.max(1, maxZ - minZ);
    terrainCoverageCamera.updateProjectionMatrix();
    terrainCoverageCamera.updateMatrixWorld(true);

    const mapSize = restingShadowMapSize(
      sharedBinding.shadowMode,
      sharedBinding.shadowQuality,
      sceneLease.layer.getRenderer?.()?.capabilities?.maxTextureSize
    );
    if (import.meta.env?.DEV && typeof window !== "undefined") {
      // Console handle for checking what the sweep actually covers.
      (window as unknown as Record<string, unknown>).__carmaShadowCoverage = {
        camera: terrainCoverageCamera,
        casterReachMeters,
        mapSize,
      };
    }
    terrainRuntime.setShadowCameras([
      {
        camera: terrainCoverageCamera,
        shadowMapSize: { width: mapSize, height: mapSize },
      },
    ]);
  };
  // Whether a camera gesture is in flight. While it is, the shadow buffer is
  // rendered at half resolution so the pan stays fluid; moveend restores it.
  let mapInMotion = false;
  // Set when meshes or materials may have appeared or vanished; the material
  // sync walks the whole scene, which is not per-frame work.
  let sceneMaterialsDirty = true;
  let lastDebugPublishMs = 0;
  let softSunShadowsEnabled = true;
  let timeAnimating = false;
  // Bumped whenever the controller consumed a dirty update: the lighting
  // state the accumulation rounds sample from has changed.
  let shadowStateEpoch = 0;

  const updateSharedShadowCoverage = (reevaluateSun = true) => {
    const mapCenter = map.getCenter();
    const centerElevation =
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ?? 0;
    const center = sceneLease.layer.projectLngLatToScene?.(
      [mapCenter.lng, mapCenter.lat],
      centerElevation
    );
    if (!center) {
      if (latestSolarPosition) {
        evaluateAtmosphericSunlightForMap(latestSolarPosition);
      }
      map.triggerRepaint();
      return;
    }
    sharedBinding.center.copy(center);
    const canvas = map.getCanvas();
    const viewportWidth = canvas.clientWidth || canvas.width;
    const viewportHeight = canvas.clientHeight || canvas.height;
    let radiusMeters = 0;
    const projectedCorners: THREE.Vector3[] = [];
    // Map#getBounds is the geographic AABB around the rotated and pitched
    // viewport. Its unused corners can waste most shadow texels. Unproject the
    // actual four screen corners instead and fit those in light space.
    const viewportLngLats = [
      [0, viewportHeight],
      [0, 0],
      [viewportWidth, viewportHeight],
      [viewportWidth, 0],
    ].map((point) => {
      const lngLat = map.unproject(point as [number, number]);
      return [lngLat.lng, lngLat.lat] as [number, number];
    });
    // A screen corner near the horizon unprojects kilometres out. Pulling it
    // back onto the receiver radius keeps the shadow buffer's texels where
    // the viewer actually looks.
    const clampToReceiverRadius = (point: THREE.Vector3) => {
      const offset = point.clone().sub(center);
      const horizontal = Math.hypot(offset.x, offset.z);
      if (horizontal <= MAX_RECEIVER_DISTANCE_METERS) return point;
      const scale = MAX_RECEIVER_DISTANCE_METERS / horizontal;
      offset.x *= scale;
      offset.z *= scale;
      return offset.add(center);
    };
    for (const lngLat of viewportLngLats) {
      const corner = sceneLease.layer.projectLngLatToScene?.(
        lngLat,
        terrainRuntime?.getElevation(lngLat[0], lngLat[1]) ?? centerElevation
      );
      if (corner) {
        const clamped = clampToReceiverRadius(corner);
        projectedCorners.push(clamped);
        radiusMeters = Math.max(radiusMeters, clamped.distanceTo(center));
      }
    }
    if (projectedCorners.length === 4) {
      const [southWest, northWest, southEast, northEast] = projectedCorners;
      const viewportWidthMeters =
        (southWest.distanceTo(southEast) + northWest.distanceTo(northEast)) / 2;
      const viewportHeightMeters =
        (southWest.distanceTo(northWest) + southEast.distanceTo(northEast)) / 2;
      sharedBinding.sunVectorLengthMeters =
        Math.min(viewportWidthMeters, viewportHeightMeters) *
        SUN_VECTOR_VIEWPORT_LENGTH_FACTOR;
    }
    // Fit the shadow map to the current viewport on every map movement. The
    // fallback size is only needed before projection is available; retaining
    // it as a minimum would waste most shadow texels after zooming in.
    let minimumElevation = center.y;
    let maximumElevation = center.y;
    if (projectedCorners.length > 0) {
      cachedElevationRange ??= getVisibleSceneElevationRange(
        sharedBinding.scene,
        center.y
      );
      [minimumElevation, maximumElevation] = cachedElevationRange;
      const elevationRadiusMeters = Math.max(
        Math.abs(minimumElevation - center.y),
        Math.abs(maximumElevation - center.y)
      );
      // A sphere around the viewport footprint remains inside the shadow
      // camera for every sun direction. Include the visible scene's vertical
      // span so low-angle light cannot move elevated terrain beyond the flat
      // corner fit.
      const viewportRadiusMeters = Math.hypot(
        radiusMeters,
        elevationRadiusMeters
      );
      sharedBinding.shadowAreaMeters = Math.max(
        configuredShadowAreaMeters ?? 0,
        MIN_VIEWPORT_SHADOW_AREA_METERS,
        viewportRadiusMeters * 2
      );
    }
    sharedBinding.shadowCameraOffsetMeters = Math.max(
      DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
      sharedBinding.shadowAreaMeters * 1.5
    );
    const coveragePoints = viewportLngLats.flatMap((lngLat) =>
      [minimumElevation, maximumElevation].flatMap((elevation) => {
        const point = sceneLease.layer.projectLngLatToScene?.(
          lngLat,
          elevation
        );
        return point ? [clampToReceiverRadius(point)] : [];
      })
    );
    sharedBinding.receiverWorldPoints = coveragePoints;
    sharedBinding.minimumElevationMeters = minimumElevation;
    sharedBinding.maximumElevationMeters = maximumElevation;
    sharedBinding.dirty = true;
    updateTerrainShadowCoverage();
    // Re-sampling the atmosphere and rebuilding the sun gizmo is only due
    // when the sun itself may have changed: a new time, or a viewport that
    // came to rest somewhere else. A frame-by-frame pan reuses the sample and
    // only carries the anchor along, which is a handful of vector copies.
    if (latestSolarPosition && (reevaluateSun || !latestAtmosphericSunlight)) {
      evaluateAtmosphericSunlightForMap(latestSolarPosition);
    } else {
      sharedBinding.lightTarget.position.copy(sharedBinding.center);
      for (const sunLight of sharedBinding.controller.lights) {
        sunLight.target.position.copy(sharedBinding.center);
        sunLight.target.updateMatrixWorld(true);
      }
      sharedBinding.sunVector.root.position.copy(sharedBinding.center);
      sharedBinding.sunVector.root.updateMatrixWorld(true);
    }
    map.triggerRepaint();
  };

  const shadowControllerRuntime: SharedThreeSceneRuntime = {
    id: "shadow-simulation-tiled-controller",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root: new THREE.Group(),
    update(frame) {
      if (!sharedBinding.dirty) return;
      shadowStateEpoch += 1;
      if (
        sharedBinding.receiverWorldPoints.length === 0 ||
        !latestSolarPosition
      ) {
        clearShadowProjectionDebugSnapshot(map);
        updateShadowBufferBorders(sharedBinding, 0);
        return;
      }
      if (sceneMaterialsDirty) {
        sceneMaterialsDirty = false;
        sharedBinding.controller.syncSceneMaterials(sharedBinding.scene);
      }
      const rendererCaps = sceneLease.layer.getRenderer?.()?.capabilities;
      if (rendererCaps?.maxTextureSize) {
        sharedBinding.controller.setMaxShadowMapSize(
          rendererCaps.maxTextureSize
        );
      }
      const snapshot = sharedBinding.controller.update({
        camera: frame.lodCamera,
        receiverWorldPoints: sharedBinding.receiverWorldPoints,
        minimumElevationMeters: sharedBinding.minimumElevationMeters,
        maximumElevationMeters: sharedBinding.maximumElevationMeters,
        directionToSun: sharedBinding.directionToSun,
        color: sharedBinding.sunColor,
        intensity: sharedBinding.sunIntensity,
        shadowIntensity: sharedBinding.shadowIntensity,
        quality: sharedBinding.shadowQuality,
        interactive: mapInMotion,
      });
      sharedBinding.dirty = false;
      if (!snapshot) {
        clearShadowProjectionDebugSnapshot(map);
        updateShadowBufferBorders(sharedBinding, 0);
        return;
      }
      updateShadowBufferBorders(sharedBinding, snapshot.tileCount);
      const primary = snapshot?.tiles[0];
      const primaryCamera = sharedBinding.controller.lights[0].shadow.camera;
      // Publishing re-renders the debug panel's React tree; while nothing
      // subscribes the snapshot has no reader and building it is pure
      // overhead, and during a gesture 10 Hz is plenty for numbers meant for
      // a human.
      const nowMs = performance.now();
      const publishDue = !mapInMotion || nowMs - lastDebugPublishMs >= 100;
      const publishWanted =
        sharedBinding.projectionDebugVisible ||
        hasShadowProjectionDebugListeners(map);
      if (primary && publishWanted && publishDue) {
        lastDebugPublishMs = nowMs;
        publishShadowProjectionDebugSnapshot(map, {
          cameraRangeMeters: primaryCamera.position.distanceTo(
            sharedBinding.controller.lights[0].target.position
          ),
          leftMeters: primary.leftMeters,
          rightMeters: primary.rightMeters,
          bottomMeters: primary.bottomMeters,
          topMeters: primary.topMeters,
          nearMeters: primary.nearMeters,
          farMeters: primary.farMeters,
          projectionMatrixElements: primary.projectionMatrixElements,
          shadowMapWidth: primary.shadowMapWidth,
          shadowMapHeight: primary.shadowMapHeight,
          minimumElevationMeters: sharedBinding.minimumElevationMeters,
          maximumElevationMeters: sharedBinding.maximumElevationMeters,
          sceneAnchorPositionElements: sharedBinding.center.toArray(),
          tiledShadow: snapshot,
          atmosphericSunlight: latestAtmosphericSunlight
            ? {
                azimuthDegrees: latestAtmosphericSunlight.azimuthDegrees,
                elevationDegrees: latestAtmosphericSunlight.elevationDegrees,
                relativeIntensity: latestAtmosphericSunlight.relativeIntensity,
                color: `#${latestAtmosphericSunlight.color.getHexString()}`,
                transmittanceReady:
                  latestAtmosphericSunlight.atmosphericTransmittanceReady,
                irradianceReady:
                  latestAtmosphericSunlight.atmosphericIrradianceReady,
              }
            : null,
        });
      }
    },
    dispose: () => undefined,
  };
  sceneLease.layer.addRuntime(shadowControllerRuntime);

  // Progressive refinement at rest: four accumulation rounds of eight disc
  // samples each average 32 distinct sun directions - and the per-round
  // sub-pixel jitter supersamples the whole image on top. Only while the
  // camera and the shadow state hold still; any change restarts the average.
  const accumulationController = {
    // The top quality level cannot buy larger sample buffers (memory), so it
    // buys time: eight rounds average 64 sun directions instead of 32.
    get rounds() {
      return sharedBinding.shadowQuality === 64 ? 8 : 4;
    },
    epoch: () => shadowStateEpoch,
    active: () =>
      softSunShadowsEnabled &&
      sharedBinding.shadowMode === "single" &&
      !mapInMotion &&
      !timeAnimating &&
      !sharedBinding.dirty &&
      latestSolarPosition !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    prepareRound: (round: number) => {
      sharedBinding.controller.applyDiscRotation(round);
    },
  };
  sceneLease.layer.setAccumulationController?.(accumulationController);
  if (import.meta.env?.DEV && typeof window !== "undefined") {
    // Console handle for checking whether static accumulation may run.
    (window as unknown as Record<string, unknown>).__carmaShadowAccumulation =
      accumulationController;
  }

  const refreshSharedShadowCoverage = () => {
    cachedElevationRange = null;
    updateSharedShadowCoverage();
  };
  refreshTerrainShadowState = () => {
    invalidateShadowMap();
    refreshSharedShadowCoverage();
  };

  const handleMoveStart = () => {
    mapInMotion = true;
    terrainRuntime?.setInteractive(true);
    // The next dirty update runs with interactive=true and folds the disc
    // samples back into one light for the duration of the gesture.
    sharedBinding.dirty = true;
  };
  const handleMove = () => updateSharedShadowCoverage(false);
  const handleMoveEnd = () => {
    mapInMotion = false;
    terrainRuntime?.setInteractive(false);
    refreshSharedShadowCoverage();
  };
  map.on("movestart", handleMoveStart);
  map.on("move", handleMove);
  map.on("moveend", handleMoveEnd);
  map.on("resize", handleMove);
  updateSharedShadowCoverage();

  if (terrainRuntime) {
    void terrainRuntime.ready.then((loaded) => {
      if (!loaded || disposed) return;
      restoreMapLibreTerrain = suppressMapLibreTerrainRendering(map);
      refreshSharedShadowCoverage();
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
      const nextBridge = buildGenericThreeShadowBridge(
        sceneLease.layer,
        layer,
        latestBuildingAppearance,
        sharedBinding.controller
      );
      if (nextBridge) genericBridges.set(layer, nextBridge);
    }
    makeSceneMeshesShadeable(
      sceneLease.layer.getScene(),
      sharedBinding.controller
    );
    refreshSharedShadowCoverage();
    map.triggerRepaint();
  };

  const unsubscribeGenericLayers = subscribeGenericThreeLayers(
    map,
    syncGenericBridges
  );
  syncGenericBridges();

  const handleSharedSceneContentChanged = () => {
    if (disposed) return;
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
    }
    makeSceneMeshesShadeable(
      sceneLease.layer.getScene(),
      sharedBinding.controller
    );
    sceneMaterialsDirty = true;
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
    refreshSharedShadowCoverage();
  };
  // Tiles stream in one model at a time and every arrival announces itself.
  // The handler walks the whole scene and refits the shadow coverage, so it
  // runs once per lull rather than once per tile.
  let contentChangeTimer = 0;
  const scheduleSharedSceneContentChanged = () => {
    if (disposed) return;
    if (contentChangeTimer) window.clearTimeout(contentChangeTimer);
    contentChangeTimer = window.setTimeout(() => {
      contentChangeTimer = 0;
      handleSharedSceneContentChanged();
    }, 120);
  };
  const unsubscribeSharedSceneContent = subscribeSharedThreeSceneContent(
    map,
    scheduleSharedSceneContentChanged
  );
  handleSharedSceneContentChanged();

  const applyMapLibreLight = (position: SolarPosition) => {
    const sample =
      latestAtmosphericSunlight ?? evaluateAtmosphericSunlightForMap(position);
    applyMapLibreLightSample(sample);
  };

  const updateSolarPosition = (position: SolarPosition) => {
    latestSolarPosition = position;
    updateSharedShadowCoverage();
    applyMapLibreLight(position);
  };

  const restoreLighting = () => {
    if (disposed) return;
    if (latestSolarPosition) applyMapLibreLight(latestSolarPosition);
  };

  // `setLight` itself emits styledata. Listening there feeds every UI change
  // back into another style mutation. Only a completed style replacement can
  // have discarded the configured light.
  map.on("style.load", restoreLighting);

  return {
    updateSolarPosition,
    updateTerrainColor(color) {
      terrainRuntime?.setMaterialColor(color);
      terrainColor = new THREE.Color(color);
      ensureShadowBackground();
    },
    updateBuildingAppearance(appearance) {
      latestBuildingAppearance = appearance;
      for (const bridge of genericBridges.values()) {
        bridge.updateBuildingAppearance(appearance);
      }
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(appearance);
      }
      makeSceneMeshesShadeable(
        sceneLease.layer.getScene(),
        sharedBinding.controller
      );
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateShadowQuality(quality) {
      sharedBinding.shadowQuality = quality;
      sharedBinding.dirty = true;
      updateSharedShadowCoverage();
      sharedBinding.controller.invalidate();
    },
    updateShadowMode(mode) {
      sharedBinding.shadowMode = mode;
      sharedBinding.controller.setMode(mode);
      sharedBinding.dirty = true;
      updateSharedShadowCoverage();
      sharedBinding.controller.invalidate();
    },
    updateSoftSunShadows(enabled) {
      softSunShadowsEnabled = enabled;
      sharedBinding.controller.setSoftSun(enabled);
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateTimeAnimating(animating) {
      timeAnimating = animating;
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    refreshProjectionDebug() {
      lastDebugPublishMs = 0;
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateShadowIntensity(intensity) {
      latestShadowIntensity = THREE.MathUtils.clamp(intensity, 0, 1);
      sharedBinding.shadowIntensity = latestShadowIntensity;
      for (const light of sharedBinding.controller.lights) {
        light.shadow.intensity = latestShadowIntensity;
      }
      map.triggerRepaint();
    },
    updateSunDebugVectorVisibility(visible) {
      sharedBinding.sunVectorVisible = visible;
      sharedBinding.sunVector.root.visible = visible && !!latestSolarPosition;
      map.triggerRepaint();
    },
    updateShadowBufferDebugVisibility(visible) {
      sharedBinding.projectionDebugVisible = visible;
      if (visible) sharedBinding.dirty = true;
      updateShadowBufferBorders(sharedBinding);
      map.triggerRepaint();
    },
    updateAtmosphericLutUsage(options) {
      atmosphericSunlightOptions = options;
      latestAtmosphericSunlight = null;
      if (latestSolarPosition) {
        evaluateAtmosphericSunlightForMap(latestSolarPosition);
        invalidateShadowMap();
      }
      map.triggerRepaint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (contentChangeTimer) window.clearTimeout(contentChangeTimer);
      clearShadowProjectionDebugSnapshot(map);
      map.off("style.load", restoreLighting);
      map.off("styledata", ensureShadowBackground);
      map.off("movestart", handleMoveStart);
      map.off("move", handleMove);
      map.off("moveend", handleMoveEnd);
      map.off("resize", handleMove);
      unsubscribeGenericLayers();
      unsubscribeSharedSceneContent();
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(null);
      }
      for (const bridge of genericBridges.values()) {
        if (sceneLease.layer.hasRuntime(bridge.runtime.id)) {
          sceneLease.layer.removeRuntime(bridge.runtime.id);
        }
      }
      genericBridges.clear();
      try {
        if (map.getLayer(SHADOW_SIMULATION_BACKGROUND_LAYER_ID)) {
          map.removeLayer(SHADOW_SIMULATION_BACKGROUND_LAYER_ID);
        }
      } catch {
        // The style may already be gone during map teardown.
      }
      try {
        restoreMapLibreStyleLayers();
      } catch {
        // The style may already be gone during map teardown.
      }
      try {
        restoreMapLibreTerrain?.();
      } catch {
        // The style or terrain source may already be gone during map teardown.
      }
      restoreMapLibreTerrain = null;
      if (sceneLease.layer.hasRuntime(shadowControllerRuntime.id)) {
        sceneLease.layer.removeRuntime(shadowControllerRuntime.id);
      }
      if (terrainRuntime && sceneLease.layer.hasRuntime(terrainRuntime.id)) {
        sceneLease.layer.removeRuntime(terrainRuntime.id);
      }
      atmosphericSunlight.dispose();
      disposeShadowLightBinding(sharedBinding);
      sceneLease.layer.setAccumulationController?.(null);
      sceneLease.release();
      try {
        if (map.isStyleLoaded()) map.setLight(previousLight);
      } catch {
        // Nothing remains to restore after map teardown.
      }
    },
  };
};

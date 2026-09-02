import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import {
  acquireSharedThreeScene,
  buildCesiumTerrainRuntime,
  getGenericThreeLayers,
  getSharedThreeShadowViewSignature,
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
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
} from "@carma-mapping/engines/maplibre";
import { degToRadNumeric } from "@carma-units";

import type { SolarPosition } from "../core/solar-position";
import { getFrustumBoxIntersectionPoints } from "../core/frustum-box-intersection";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
  type MeshErrorTargetPixels,
  type ShadowQualityMultiplier,
} from "../core/shadow-types";
import {
  AtmosphericSunlightEvaluator,
  evaluateAtmosphericSkyFrame,
  getAtmosphericInputValidationError,
  getAtmosphericSkyFrameValidationError,
  getAtmosphericSunlightSampleValidationError,
  type AtmosphericSunlightSample,
  type AtmosphericSunlightOptions,
  type AtmosphericSkyReference,
} from "./atmospheric-sunlight";
import {
  ATMOSPHERIC_DISPLAY_EXPOSURE,
  buildAtmosphericSky,
} from "./atmospheric-sky";
import { ShadowController } from "./shadow-controller";
import { resolveShadowResourceLimits } from "./shadow-resource-limits";
import {
  clearShadowProjectionDebugSnapshot,
  hasShadowProjectionDebugListeners,
  publishShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";

const FALLBACK_SHADOW_AREA_METERS = 900;
/** Maximum radius represented by the fitted shadow buffer. */
const MAX_RECEIVER_DISTANCE_METERS = 4_000;
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
const SHADOW_SIMULATION_SUN_VECTOR_NAME = "shadow-simulation-sun-vector";
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-cesium-terrain";
const SHADOW_CONTROLLER_UPDATE_PRIORITY = 200;
const SUN_VECTOR_COLOR = 0xf59e0b;
const SUN_VECTOR_HEAD_LENGTH_FACTOR = 0.18;
const SUN_VECTOR_HEAD_WIDTH_FACTOR = 0.07;
const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SUN_VECTOR_ANGLE_RADIUS_FACTOR = 0.22;
const SUN_VECTOR_ANGLE_SEGMENTS = 24;
const SHADOW_OVERLAY_MARKER = "isShadowSimulationOverlay";
const SUN_DISC_ACCUMULATION_ROUNDS = 32;
const MAX_SUN_DISC_ACCUMULATION_ROUNDS = 64;
const SHADOW_SIMULATION_SKY_LIGHT_NAME = "shadow-simulation-sky-light";

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
  controller: ShadowController;
  skyLight: THREE.LightProbe;
  atmosphericSky: ReturnType<typeof buildAtmosphericSky>;
  ambientLightIntensities: Map<THREE.AmbientLight, number>;
  lightTarget: THREE.Object3D;
  sunVector: SunVectorGizmo;
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
  uniformColorMix?: number;
  textureSaturation?: number;
}>;

const SHADOW_SIMULATION_BACKGROUND_LAYER_ID = "__shadow-simulation-background";

export type ShadowSimulationScene = {
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateMeshErrorTarget: (errorTarget: MeshErrorTargetPixels) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateSoftSunShadows: (enabled: boolean) => void;
  updateTimeAnimating: (animating: boolean) => void;
  refreshProjectionDebug: () => void;
  updateShadowIntensity: (intensity: number) => void;
  updateSunDebugVectorVisibility: (visible: boolean) => void;
  updateAtmosphericLutUsage: (options: AtmosphericSunlightOptions) => void;
  dispose: () => void;
};

export const solarPositionToSceneDirection = ({
  azimuthDegrees,
  elevationDegrees,
}: SolarPosition): THREE.Vector3 => {
  const azimuth = degToRadNumeric(azimuthDegrees);
  const elevation = degToRadNumeric(elevationDegrees);
  const horizontal = Math.cos(elevation);
  // Shared scene axes: +X east, +Y up, -Z north.
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    -Math.cos(azimuth) * horizontal
  ).normalize();
};

const makeMeshShadeable = (mesh: THREE.Mesh) => {
  if (mesh.userData[SHADOW_OVERLAY_MARKER]) return;
  mesh.castShadow = mesh.userData.disableShadowCasting !== true;
  mesh.receiveShadow = true;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  // Closed solids default to back-face casting. Tile runtimes can provide a
  // topology-derived side before they join the shared scene; keep that ground
  // truth instead of replacing it here.
  if (!mesh.userData.isShadowTerrainSurface) {
    for (const material of materials) {
      material.shadowSide ??= THREE.BackSide;
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

const makeSceneMeshesShadeable = (scene: THREE.Scene) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    makeMeshShadeable(mesh);
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

const disposeCopiedMaterials = (root: THREE.Object3D) => {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      material.dispose();
    }
  });
};

const getVisibleSceneElevationRange = (
  scene: THREE.Scene,
  fallbackElevation: number,
  viewCamera?: THREE.Camera
): readonly [number, number] => {
  scene.updateMatrixWorld(true);
  viewCamera?.updateMatrixWorld(true);
  const viewFrustum = viewCamera
    ? new THREE.Frustum().setFromProjectionMatrix(
        new THREE.Matrix4().multiplyMatrices(
          viewCamera.projectionMatrix,
          viewCamera.matrixWorldInverse
        ),
        viewCamera.coordinateSystem,
        viewCamera.reversedDepth
      )
    : null;
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
    if (viewFrustum && !viewFrustum.intersectsBox(worldBounds)) return;
    minimum = Math.min(minimum, worldBounds.min.y);
    maximum = Math.max(maximum, worldBounds.max.y);
  });
  return [minimum, maximum];
};

const getViewElevationRange = (
  scene: THREE.Scene,
  runtimes: readonly SharedThreeSceneRuntime[],
  camera: THREE.Camera,
  fallbackElevation: number
): readonly [number, number] => {
  let [minimum, maximum] = getVisibleSceneElevationRange(
    scene,
    fallbackElevation,
    camera
  );
  for (const runtime of runtimes) {
    const range = runtime.getViewElevationRange?.(camera);
    if (!range) continue;
    minimum = Math.min(minimum, range[0]);
    maximum = Math.max(maximum, range[1]);
  }
  return [minimum, maximum];
};

const VIEWPORT_NDC_CORNERS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const FRUSTUM_EDGE_VERTEX_INDICES = [
  [0, 1],
  [1, 3],
  [3, 2],
  [2, 0],
  [4, 5],
  [5, 7],
  [7, 6],
  [6, 4],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
] as const;

const getViewportElevationEnvelopePoints = (
  camera: THREE.Camera,
  minimumElevationMeters: number,
  maximumElevationMeters: number,
  anchor: THREE.Vector3
): THREE.Vector3[] => {
  camera.updateMatrixWorld(true);
  const minimumElevation = Math.min(
    minimumElevationMeters,
    maximumElevationMeters
  );
  const maximumElevation = Math.max(
    minimumElevationMeters,
    maximumElevationMeters
  );
  const frustumVertices = [-1, 1].flatMap((z) =>
    VIEWPORT_NDC_CORNERS.map(([x, y]) =>
      new THREE.Vector3(x, y, z).unproject(camera)
    )
  );
  const points = frustumVertices
    .filter(
      (point) => point.y >= minimumElevation && point.y <= maximumElevation
    )
    .map((point) => point.clone());

  for (const [startIndex, endIndex] of FRUSTUM_EDGE_VERTEX_INDICES) {
    const start = frustumVertices[startIndex];
    const end = frustumVertices[endIndex];
    const elevationDelta = end.y - start.y;
    if (Math.abs(elevationDelta) <= Number.EPSILON) continue;
    for (const elevation of [minimumElevation, maximumElevation]) {
      const interpolation = (elevation - start.y) / elevationDelta;
      if (interpolation < 0 || interpolation > 1) continue;
      points.push(start.clone().lerp(end, interpolation));
    }
  }

  for (const point of points) {
    const offset = point.clone().sub(anchor);
    const horizontalDistance = Math.hypot(offset.x, offset.z);
    if (horizontalDistance <= MAX_RECEIVER_DISTANCE_METERS) continue;
    const scale = MAX_RECEIVER_DISTANCE_METERS / horizontalDistance;
    offset.x *= scale;
    offset.z *= scale;
    point.copy(anchor).add(offset);
  }

  return points;
};

const applyBuildingAppearance = (
  root: THREE.Object3D,
  appearance: ShadowBuildingAppearance
) => {
  const useUniformColor =
    appearance.uniformColor !== null &&
    clamp(appearance.uniformColorMix ?? 1, 0, 1) >= 1;
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
      if (useUniformColor && appearance.uniformColor && colorMaterial.color) {
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
  initialBuildingAppearance: ShadowBuildingAppearance
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
    disposeCopiedMaterials(root);
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
      makeMeshShadeable(copy);
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
      disposeCopiedMaterials(root);
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
  shadowAreaMeters: number,
  groundAlbedo: THREE.Color
): ShadowLightBinding => {
  const controller = new ShadowController(scene);
  const sunLight = controller.lights[0];
  const lightTarget = sunLight.target;
  const sunVector = buildSunVector();
  const skyLight = new THREE.LightProbe(undefined, 0);
  skyLight.name = SHADOW_SIMULATION_SKY_LIGHT_NAME;
  const atmosphericSky = buildAtmosphericSky(groundAlbedo);
  atmosphericSky.mesh.userData[SHADOW_OVERLAY_MARKER] = true;
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
    atmosphericSky,
    ambientLightIntensities,
    lightTarget,
    sunVector,
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
  scene.add(sunVector.root);
  return binding;
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
  const elevationRadians = Math.asin(clamp(normalizedDirection.y, -1, 1));
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
  binding.sunIntensity = intensity ?? ATMOSPHERIC_DISPLAY_EXPOSURE;
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
  binding.scene.remove(binding.atmosphericSky.mesh);
  binding.scene.remove(binding.sunVector.root);
  binding.sunVector.dispose();
  binding.atmosphericSky.dispose();
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
    uniformColorMix: 0,
    textureSaturation: 1,
  };
  let latestShadowIntensity = 1;
  let latestMeshErrorTarget = DEFAULT_MESH_ERROR_TARGET_PIXELS;
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
  const atmosphereReferenceCenter = map.getCenter();
  const sceneLease = acquireSharedThreeScene(map);
  const atmosphereSkyObserver: AtmosphericSkyReference["observer"] = {
    longitude: atmosphereReferenceCenter.lng,
    latitude: atmosphereReferenceCenter.lat,
    altitudeMeters: 0,
  };
  const atmosphereSkyScenePosition =
    sceneLease.layer.projectLngLatToScene?.(
      [atmosphereReferenceCenter.lng, atmosphereReferenceCenter.lat],
      0
    ) ?? new THREE.Vector3();
  const atmosphereSkyReference: AtmosphericSkyReference = {
    observer: atmosphereSkyObserver,
    scenePosition: atmosphereSkyScenePosition,
  };
  const atmosphericSunlight = new AtmosphericSunlightEvaluator();
  let invalidateShadowMap = () => undefined;
  let refreshTerrainShadowState = () => invalidateShadowMap();
  const buildTerrainRuntime = () => {
    if (!terrain) return null;
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
  };
  const sharedSceneProvidesTerrain = () =>
    getSharedThreeSceneRuntimes(map).some(
      (runtime) => runtime.providesTerrain === true
    );
  let terrainRuntime = sharedSceneProvidesTerrain()
    ? null
    : buildTerrainRuntime();
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    initialShadowAreaMeters,
    terrainColor
  );
  let shadowStateEpoch = 0;
  let shadowVisualEpoch = 0;
  let cameraAltitudeMeters: number | null = null;
  let lastAtmosphereErrorSignature = "";
  const rejectAtmosphereUpdate = (
    phase: string,
    reason: string,
    details: Readonly<Record<string, unknown>>
  ) => {
    const signature = `${phase}:${reason}`;
    if (signature === lastAtmosphereErrorSignature) return;
    lastAtmosphereErrorSignature = signature;
    console.error(
      "[SHADOW] Atmospheric update rejected; retaining last valid frame",
      {
        phase,
        reason,
        ...details,
      }
    );
  };
  const acceptAtmosphereUpdate = () => {
    lastAtmosphereErrorSignature = "";
  };
  const invalidateShadowPresentation = () => {
    shadowStateEpoch += 1;
    shadowVisualEpoch += 1;
  };
  const applyMapLibreLightSample = (sample: AtmosphericSunlightSample) => {
    if (!map.isStyleLoaded()) return;
    const nextPosition: [number, number, number] = [
      1.5,
      sample.azimuthDegrees,
      90 - sample.elevationDegrees,
    ];
    const nextColor = `#${sample.color.getHexString()}`;
    const nextIntensity = clamp(sample.relativeIntensity, 0, 1);
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
      cameraAltitudeMeters ??
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ??
      0;
    const observer = {
      longitude: mapCenter.lng,
      latitude: mapCenter.lat,
      altitudeMeters,
    };
    const inputError = getAtmosphericInputValidationError(
      position.instant,
      observer,
      atmosphereSkyReference
    );
    if (inputError) {
      rejectAtmosphereUpdate("sunlight input", inputError, {
        observer,
        skyReference: atmosphereSkyReference,
      });
      return latestAtmosphericSunlight;
    }
    atmosphericSunlight.ensure(() => {
      if (disposed || !latestSolarPosition) return;
      invalidateShadowPresentation();
      const sample = evaluateAtmosphericSunlightForMap(latestSolarPosition);
      if (sample) applyMapLibreLightSample(sample);
      map.triggerRepaint();
    }, atmosphericSunlightOptions);
    atmosphericSunlight.ensureSky(() => {
      if (disposed || !latestSolarPosition) return;
      invalidateShadowPresentation();
      evaluateAtmosphericSunlightForMap(latestSolarPosition);
      map.triggerRepaint();
    });
    let sample: AtmosphericSunlightSample;
    try {
      sample = atmosphericSunlight.evaluate(
        position.instant,
        observer,
        atmosphericSunlightOptions,
        atmosphereSkyReference
      );
    } catch (error) {
      rejectAtmosphereUpdate("sunlight generation", "generator threw", {
        observer,
        error,
      });
      return latestAtmosphericSunlight;
    }
    const outputError = getAtmosphericSunlightSampleValidationError(sample);
    if (outputError) {
      rejectAtmosphereUpdate("sunlight output", outputError, {
        observer,
        sample,
      });
      return latestAtmosphericSunlight;
    }
    acceptAtmosphereUpdate();
    latestAtmosphericSunlight = sample;
    sharedBinding.atmosphericSky.update(
      sample.skyFrame,
      atmosphericSunlight.skyTextures
    );
    applyAtmosphericSkyLightToBinding(sharedBinding, sample);
    applySolarPositionToBinding(
      sharedBinding,
      sample.directionToSun,
      sample.radiance,
      ATMOSPHERIC_DISPLAY_EXPOSURE
    );
    return sample;
  };
  const updateAtmosphericSkyFrameForMap = (position: SolarPosition) => {
    const mapCenter = map.getCenter();
    const observer = {
      longitude: mapCenter.lng,
      latitude: mapCenter.lat,
      altitudeMeters: cameraAltitudeMeters ?? 0,
    };
    const inputError = getAtmosphericInputValidationError(
      position.instant,
      observer,
      atmosphereSkyReference
    );
    if (inputError) {
      rejectAtmosphereUpdate("sky input", inputError, { observer });
      return;
    }
    let skyFrame;
    try {
      skyFrame = evaluateAtmosphericSkyFrame(
        position.instant,
        observer,
        atmosphereSkyReference
      );
    } catch (error) {
      rejectAtmosphereUpdate("sky generation", "generator threw", {
        observer,
        error,
      });
      return;
    }
    const frameError = getAtmosphericSkyFrameValidationError(skyFrame);
    if (frameError) {
      rejectAtmosphereUpdate("sky output", frameError, {
        observer,
        skyFrame,
      });
      return;
    }
    acceptAtmosphereUpdate();
    sharedBinding.atmosphericSky.update(
      skyFrame,
      atmosphericSunlight.skyTextures
    );
  };
  invalidateShadowMap = () => {
    if (disposed) return;
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
  };
  const genericBridges = new Map<GenericThreeLayer, GenericThreeShadowBridge>();
  const getCoverageRuntimes = (): readonly SharedThreeSceneRuntime[] => {
    const runtimes = getSharedThreeSceneRuntimes(map);
    return terrainRuntime && !runtimes.includes(terrainRuntime)
      ? [terrainRuntime, ...runtimes]
      : runtimes;
  };
  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] =>
    getCoverageRuntimes().flatMap(
      (runtime) => runtime.getActiveTileVolumes?.() ?? []
    );
  let cachedElevationRange: readonly [number, number] | null = null;
  let timeAnimating = false;
  let latestShadowView: SharedThreeSceneShadowView | null = null;
  let appliedRuntimeShadowView: SharedThreeSceneShadowView | null = null;
  const applyRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    if (view === null && appliedRuntimeShadowView === null) return;
    appliedRuntimeShadowView = view;
    terrainRuntime?.setShadowView(view);
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      if (runtime === terrainRuntime) continue;
      runtime.setShadowView?.(view);
    }
  };
  const setRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    latestShadowView = view;
    applyRuntimeShadowView(view);
  };

  let mapInMotion = false;
  let lastDebugPublishMs = 0;
  let softSunShadowsEnabled = true;
  let contentChangeTimer = 0;
  let coverageNeedsCameraReevaluation = true;
  let fallbackReceiverWorldPoints: THREE.Vector3[] = [];
  let renderCameraSignature = "";
  let maxAccumulationPixels = Number.POSITIVE_INFINITY;
  sharedBinding.controller.setSoftSun(softSunShadowsEnabled);

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
    // Fit the actual screen corners rather than their geographic AABB.
    const viewportLngLats = [
      [0, viewportHeight],
      [0, 0],
      [viewportWidth, viewportHeight],
      [viewportWidth, 0],
    ].map((point) => {
      const lngLat = map.unproject(point as [number, number]);
      return [lngLat.lng, lngLat.lat] as [number, number];
    });
    // Clamp near-horizon projections to the supported receiver radius.
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
      // Include the scene's vertical span in the receiver radius.
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
    fallbackReceiverWorldPoints = coveragePoints;
    sharedBinding.receiverWorldPoints = coveragePoints;
    sharedBinding.minimumElevationMeters = minimumElevation;
    sharedBinding.maximumElevationMeters = maximumElevation;
    sharedBinding.dirty = true;
    // During movement, move the anchor without resampling the atmosphere.
    if (latestSolarPosition && (reevaluateSun || !latestAtmosphericSunlight)) {
      evaluateAtmosphericSunlightForMap(latestSolarPosition);
    } else {
      if (latestSolarPosition) {
        updateAtmosphericSkyFrameForMap(latestSolarPosition);
      }
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
    id: "shadow-simulation-controller",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root: new THREE.Group(),
    updatePriority: SHADOW_CONTROLLER_UPDATE_PRIORITY,
    update(frame) {
      const nextCameraAltitudeMeters = frame.renderCamera.position.y;
      const renderCameraMatricesValid = [
        ...frame.renderCamera.matrixWorld.elements,
        ...frame.renderCamera.projectionMatrix.elements,
      ].every(Number.isFinite);
      if (
        !renderCameraMatricesValid ||
        !Number.isFinite(nextCameraAltitudeMeters)
      ) {
        rejectAtmosphereUpdate(
          "render camera",
          "camera matrix or altitude is non-finite",
          {
            altitudeMeters: nextCameraAltitudeMeters,
            matrixWorld: frame.renderCamera.matrixWorld.elements,
            projectionMatrix: frame.renderCamera.projectionMatrix.elements,
          }
        );
      } else if (
        cameraAltitudeMeters === null ||
        Math.abs(nextCameraAltitudeMeters - cameraAltitudeMeters) >= 0.25
      ) {
        cameraAltitudeMeters = nextCameraAltitudeMeters;
        if (latestSolarPosition) {
          evaluateAtmosphericSunlightForMap(latestSolarPosition);
        }
      }
      const nextRenderCameraSignature = getSharedThreeShadowViewSignature({
        camera: frame.renderCamera,
        shadowMapSize: {
          width: frame.viewport.x,
          height: frame.viewport.y,
        },
      });
      if (
        coverageNeedsCameraReevaluation ||
        nextRenderCameraSignature !== renderCameraSignature
      ) {
        renderCameraSignature = nextRenderCameraSignature;
        cachedElevationRange = getViewElevationRange(
          sharedBinding.scene,
          getSharedThreeSceneRuntimes(map),
          frame.renderCamera,
          sharedBinding.center.y
        );
        updateSharedShadowCoverage(false);
        coverageNeedsCameraReevaluation = false;
      }
      if (!sharedBinding.dirty) return;
      shadowStateEpoch += 1;
      const cameraCoveragePoints = getViewportElevationEnvelopePoints(
        frame.renderCamera,
        sharedBinding.minimumElevationMeters,
        sharedBinding.maximumElevationMeters,
        sharedBinding.center
      );
      const visibleTileVolumePoints = getActiveTileVolumes().flatMap(
        ({ minimum, maximum }) =>
          getFrustumBoxIntersectionPoints(
            frame.renderCamera,
            new THREE.Box3(
              new THREE.Vector3(...minimum),
              new THREE.Vector3(...maximum)
            )
          )
      );
      sharedBinding.receiverWorldPoints =
        visibleTileVolumePoints.length > 0
          ? visibleTileVolumePoints
          : cameraCoveragePoints.length > 0
          ? cameraCoveragePoints
          : fallbackReceiverWorldPoints;
      if (
        sharedBinding.receiverWorldPoints.length === 0 ||
        !latestSolarPosition
      ) {
        setRuntimeShadowView(null);
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      const rendererCaps = sceneLease.layer.getRenderer?.()?.capabilities;
      if (rendererCaps?.maxTextureSize) {
        const resourceLimits = resolveShadowResourceLimits(
          rendererCaps.maxTextureSize
        );
        sharedBinding.controller.setMaxShadowMapSize(
          resourceLimits.maxShadowMapSize
        );
        maxAccumulationPixels = resourceLimits.maxAccumulationPixels;
      }
      const snapshot = sharedBinding.controller.update({
        receiverWorldPoints: sharedBinding.receiverWorldPoints,
        receiverAnchorWorldPosition: sharedBinding.center,
        minimumElevationMeters: sharedBinding.minimumElevationMeters,
        maximumElevationMeters: sharedBinding.maximumElevationMeters,
        directionToSun: sharedBinding.directionToSun,
        color: sharedBinding.sunColor,
        intensity: sharedBinding.sunIntensity,
        shadowIntensity: sharedBinding.shadowIntensity,
        quality: sharedBinding.shadowQuality,
      });
      sharedBinding.dirty = false;
      if (!snapshot) {
        setRuntimeShadowView(null);
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      const primary = snapshot.camera;
      const primaryCamera = sharedBinding.controller.lights[0].shadow.camera;
      setRuntimeShadowView({
        camera: primaryCamera,
        shadowMapSize: {
          width: primary.shadowMapWidth,
          height: primary.shadowMapHeight,
        },
      });
      const nowMs = performance.now();
      const publishDue = !mapInMotion || nowMs - lastDebugPublishMs >= 100;
      const publishWanted = hasShadowProjectionDebugListeners(map);
      if (primary && publishWanted && publishDue) {
        lastDebugPublishMs = nowMs;
        frame.lodCamera.updateMatrixWorld(true);
        frame.lodCamera.updateProjectionMatrix();
        const tileVolumes = getCoverageRuntimes().flatMap((runtime) =>
          (runtime.getActiveTileVolumes?.() ?? []).map(
            ({ id, loadReason, minimum, maximum }) => ({
              id,
              loadReason,
              minimum,
              maximum,
            })
          )
        );
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
          mainCamera: {
            viewMatrixElements: [
              ...frame.lodCamera.matrixWorldInverse.elements,
            ],
            projectionMatrixElements: [
              ...frame.lodCamera.projectionMatrix.elements,
            ],
            nearMeters: frame.lodCamera.near,
            farMeters: frame.lodCamera.far,
            viewportWidth: frame.viewport.x,
            viewportHeight: frame.viewport.y,
          },
          tileVolumes,
          shadow: snapshot,
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

  const getSunDiscAccumulationRounds = () =>
    sharedBinding.shadowQuality === 64
      ? MAX_SUN_DISC_ACCUMULATION_ROUNDS
      : SUN_DISC_ACCUMULATION_ROUNDS;
  const accumulationController = {
    get maxRenderTargetPixels() {
      return maxAccumulationPixels;
    },
    get rounds() {
      return getSunDiscAccumulationRounds();
    },
    epoch: () => shadowStateEpoch,
    visualEpoch: () => shadowVisualEpoch,
    active: () =>
      softSunShadowsEnabled &&
      !mapInMotion &&
      !timeAnimating &&
      latestSolarPosition !== null &&
      latestShadowView !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    retainSettledFrame: () =>
      softSunShadowsEnabled &&
      latestSolarPosition !== null &&
      latestShadowView !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    prepareRound: (round: number) => {
      sharedBinding.controller.applySunDiscSample(
        round,
        getSunDiscAccumulationRounds()
      );
    },
    finishRound: () => sharedBinding.controller.restoreSunDiscCenter(),
  };
  sceneLease.layer.setAccumulationController?.(accumulationController);
  const refreshSharedShadowCoverage = () => {
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
    updateSharedShadowCoverage();
  };
  refreshTerrainShadowState = () => {
    invalidateShadowMap();
    refreshSharedShadowCoverage();
  };

  const handleMoveStart = () => {
    mapInMotion = true;
    coverageNeedsCameraReevaluation = true;
    updateSharedShadowCoverage(false);
  };
  const handleMove = () => {
    coverageNeedsCameraReevaluation = true;
    updateSharedShadowCoverage(false);
  };
  const handleMoveEnd = () => {
    mapInMotion = false;
    refreshSharedShadowCoverage();
  };
  map.on("movestart", handleMoveStart);
  map.on("move", handleMove);
  map.on("moveend", handleMoveEnd);
  map.on("resize", handleMove);
  const suppressMapLibreTerrain = () => {
    restoreMapLibreTerrain ??= suppressMapLibreTerrainRendering(map);
  };
  const watchTerrainRuntime = (runtime: NonNullable<typeof terrainRuntime>) => {
    void runtime.ready.then((loaded) => {
      if (!loaded || disposed || terrainRuntime !== runtime) return;
      suppressMapLibreTerrain();
      refreshSharedShadowCoverage();
    });
  };
  const syncTerrainRuntime = () => {
    const meshProvidesTerrain = sharedSceneProvidesTerrain();
    if (!terrain) return;
    if (meshProvidesTerrain) {
      suppressMapLibreTerrain();
      const runtime = terrainRuntime;
      terrainRuntime = null;
      if (runtime && sceneLease.layer.hasRuntime(runtime.id)) {
        sceneLease.layer.removeRuntime(runtime.id);
      }
      cachedElevationRange = null;
      coverageNeedsCameraReevaluation = true;
      return;
    }
    if (terrainRuntime) return;

    restoreMapLibreTerrain?.();
    restoreMapLibreTerrain = null;
    const runtime = buildTerrainRuntime();
    if (!runtime) return;
    terrainRuntime = runtime;
    runtime.setMaterialColor(`#${terrainColor.getHexString()}`);
    runtime.setShadowView(latestShadowView);
    sceneLease.layer.addRuntime(runtime);
    watchTerrainRuntime(runtime);
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
  };
  if (terrainRuntime) {
    watchTerrainRuntime(terrainRuntime);
  } else if (terrain && sharedSceneProvidesTerrain()) {
    suppressMapLibreTerrain();
  }
  updateSharedShadowCoverage();

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
        latestBuildingAppearance
      );
      if (nextBridge) genericBridges.set(layer, nextBridge);
    }
    makeSceneMeshesShadeable(sceneLease.layer.getScene());
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
    syncTerrainRuntime();
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      if (runtime.providesTerrain) {
        runtime.setErrorTarget?.(latestMeshErrorTarget);
      }
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
      runtime.setShadowView?.(latestShadowView);
    }
    makeSceneMeshesShadeable(sceneLease.layer.getScene());
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
    coverageNeedsCameraReevaluation = true;
    refreshSharedShadowCoverage();
  };
  const scheduleSharedSceneContentChanged = () => {
    if (disposed) return;
    syncTerrainRuntime();
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
    sharedBinding.controller.invalidate();
    updateSharedShadowCoverage(false);
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
    if (sample) applyMapLibreLightSample(sample);
  };

  const updateSolarPosition = (position: SolarPosition) => {
    if (
      latestSolarPosition?.instant.getTime() === position.instant.getTime() &&
      latestSolarPosition.azimuthDegrees === position.azimuthDegrees &&
      latestSolarPosition.elevationDegrees === position.elevationDegrees
    ) {
      return;
    }
    invalidateShadowPresentation();
    latestSolarPosition = position;
    updateSharedShadowCoverage();
    applyMapLibreLight(position);
  };

  const restoreLighting = () => {
    if (disposed) return;
    if (latestSolarPosition) applyMapLibreLight(latestSolarPosition);
  };

  map.on("style.load", restoreLighting);

  return {
    updateSolarPosition,
    updateTerrainColor(color) {
      const nextColor = new THREE.Color(color);
      if (terrainColor.equals(nextColor)) return;
      invalidateShadowPresentation();
      terrainRuntime?.setMaterialColor(color);
      sharedBinding.atmosphericSky.updateGroundAlbedo(nextColor);
      terrainColor = nextColor;
      ensureShadowBackground();
    },
    updateMeshErrorTarget(errorTarget) {
      if (latestMeshErrorTarget === errorTarget) return;
      latestMeshErrorTarget = errorTarget;
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        if (runtime.providesTerrain) runtime.setErrorTarget?.(errorTarget);
      }
      map.triggerRepaint();
    },
    updateBuildingAppearance(appearance) {
      if (
        latestBuildingAppearance.fullOpacity === appearance.fullOpacity &&
        latestBuildingAppearance.uniformColor === appearance.uniformColor &&
        (latestBuildingAppearance.uniformColorMix ?? 1) ===
          (appearance.uniformColorMix ?? 1) &&
        (latestBuildingAppearance.textureSaturation ?? 1) ===
          (appearance.textureSaturation ?? 1)
      ) {
        return;
      }
      invalidateShadowPresentation();
      latestBuildingAppearance = appearance;
      for (const bridge of genericBridges.values()) {
        bridge.updateBuildingAppearance(appearance);
      }
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(appearance);
      }
      makeSceneMeshesShadeable(sceneLease.layer.getScene());
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateShadowQuality(quality) {
      if (sharedBinding.shadowQuality === quality) return;
      invalidateShadowPresentation();
      sharedBinding.shadowQuality = quality;
      sharedBinding.dirty = true;
      updateSharedShadowCoverage();
      sharedBinding.controller.invalidate();
    },
    updateSoftSunShadows(enabled) {
      if (softSunShadowsEnabled === enabled) return;
      invalidateShadowPresentation();
      softSunShadowsEnabled = enabled;
      sharedBinding.controller.setSoftSun(enabled);
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateTimeAnimating(animating) {
      if (timeAnimating === animating) return;
      timeAnimating = animating;
      if (!animating) sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    refreshProjectionDebug() {
      lastDebugPublishMs = 0;
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateShadowIntensity(intensity) {
      const nextIntensity = clamp(intensity, 0, 1);
      if (latestShadowIntensity === nextIntensity) return;
      invalidateShadowPresentation();
      latestShadowIntensity = nextIntensity;
      sharedBinding.shadowIntensity = latestShadowIntensity;
      for (const light of sharedBinding.controller.lights) {
        light.shadow.intensity = latestShadowIntensity;
      }
      map.triggerRepaint();
    },
    updateSunDebugVectorVisibility(visible) {
      if (sharedBinding.sunVectorVisible === visible) return;
      invalidateShadowPresentation();
      sharedBinding.sunVectorVisible = visible;
      sharedBinding.sunVector.root.visible = visible && !!latestSolarPosition;
      map.triggerRepaint();
    },
    updateAtmosphericLutUsage(options) {
      if (
        atmosphericSunlightOptions.useTransmittanceLut ===
          options.useTransmittanceLut &&
        atmosphericSunlightOptions.useIrradianceLut === options.useIrradianceLut
      ) {
        return;
      }
      invalidateShadowPresentation();
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
      setRuntimeShadowView(null);
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

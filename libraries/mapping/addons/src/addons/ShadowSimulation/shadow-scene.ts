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

const FALLBACK_SHADOW_AREA_METERS = 900;
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const VIEWPORT_SHADOW_PADDING_FACTOR = 1.2;
const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
const SHADOW_CAMERA_DEPTH_PADDING_METERS = 1_000;
const DEFAULT_SHADOW_MAP_SIZE = 2_048;
const SHADOW_DEPTH_BIAS_TEXELS = 0.5;
const SHADOW_NORMAL_BIAS_TEXELS = 0.5;
const MIN_SHADOW_DEPTH_BIAS_METERS = 0.05;
const MAX_SHADOW_DEPTH_BIAS_METERS = 0.5;
const MIN_SHADOW_NORMAL_BIAS_METERS = 0.1;
const MAX_SHADOW_NORMAL_BIAS_METERS = 0.75;
const SHADOW_SIMULATION_SUN_NAME = "shadow-simulation-sun";
const SHADOW_SIMULATION_SUN_VECTOR_NAME = "shadow-simulation-sun-vector";
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-cesium-terrain";
const SUN_VECTOR_COLOR = 0xf59e0b;
const SUN_VECTOR_HEAD_LENGTH_FACTOR = 0.18;
const SUN_VECTOR_HEAD_WIDTH_FACTOR = 0.07;
const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SUN_VECTOR_ANGLE_RADIUS_FACTOR = 0.22;
const SUN_VECTOR_ANGLE_SEGMENTS = 24;
const SHADOW_OVERLAY_MARKER = "isShadowSimulationOverlay";

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
  sunLight: THREE.DirectionalLight;
  lightTarget: THREE.Object3D;
  sunVector: SunVectorGizmo;
  center: THREE.Vector3;
  shadowCameraOffsetMeters: number;
  shadowAreaMeters: number;
  sunVectorLengthMeters: number;
  sunVectorVisible: boolean;
  shadowQuality: ShadowQualityMultiplier;
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

export type ShadowQualityMultiplier = 1 | 4 | 16;

export const DEFAULT_SHADOW_QUALITY: ShadowQualityMultiplier = 4;

const DEFAULT_TERRAIN_COLOR = "#d8d1c4";
const SHADOW_SIMULATION_BACKGROUND_LAYER_ID = "__shadow-simulation-background";

export type ShadowSimulationScene = {
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateSunDebugVectorVisibility: (visible: boolean) => void;
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

const configureShadowMapQuality = (
  light: THREE.DirectionalLight,
  quality: ShadowQualityMultiplier
) => {
  const size = DEFAULT_SHADOW_MAP_SIZE * Math.sqrt(quality);
  if (light.shadow.mapSize.x === size && light.shadow.mapSize.y === size)
    return;
  light.shadow.map?.dispose();
  light.shadow.map = null;
  light.shadow.mapSize.set(size, size);
};

const configureShadowCamera = (
  light: THREE.DirectionalLight,
  shadowAreaMeters: number,
  quality: ShadowQualityMultiplier
) => {
  light.castShadow = true;
  configureShadowMapQuality(light, quality);
  light.shadow.radius = 0;
  const halfShadowArea = shadowAreaMeters / 2;
  const shadowCamera = light.shadow.camera;
  shadowCamera.left = -halfShadowArea;
  shadowCamera.right = halfShadowArea;
  shadowCamera.top = halfShadowArea;
  shadowCamera.bottom = -halfShadowArea;
  // DirectionalLight rays are parallel. This offset only positions its
  // orthographic depth camera; it is not a finite light-source distance.
  const shadowCameraOffsetMeters = Math.max(
    DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
    shadowAreaMeters * 1.5
  );
  shadowCamera.near = 1;
  shadowCamera.far =
    shadowCameraOffsetMeters +
    halfShadowArea +
    SHADOW_CAMERA_DEPTH_PADDING_METERS;
  const shadowTexelMeters =
    shadowAreaMeters / Math.max(1, light.shadow.mapSize.x);
  light.shadow.normalBias = THREE.MathUtils.clamp(
    shadowTexelMeters * SHADOW_NORMAL_BIAS_TEXELS,
    MIN_SHADOW_NORMAL_BIAS_METERS,
    MAX_SHADOW_NORMAL_BIAS_METERS
  );
  const depthBiasMeters = THREE.MathUtils.clamp(
    shadowTexelMeters * SHADOW_DEPTH_BIAS_TEXELS,
    MIN_SHADOW_DEPTH_BIAS_METERS,
    MAX_SHADOW_DEPTH_BIAS_METERS
  );
  light.shadow.bias = -depthBiasMeters / (shadowCamera.far - shadowCamera.near);
  shadowCamera.updateProjectionMatrix();
  return shadowCameraOffsetMeters;
};

const fitShadowCameraToPoints = (
  light: THREE.DirectionalLight,
  points: readonly THREE.Vector3[],
  minimumAreaMeters: number,
  quality: ShadowQualityMultiplier
) => {
  if (points.length === 0) return;
  configureShadowMapQuality(light, quality);
  light.shadow.updateMatrices(light);
  const camera = light.shadow.camera;
  camera.updateMatrixWorld(true);
  let left = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.POSITIVE_INFINITY;
  let top = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    const cameraPoint = point.clone().applyMatrix4(camera.matrixWorldInverse);
    left = Math.min(left, cameraPoint.x);
    right = Math.max(right, cameraPoint.x);
    bottom = Math.min(bottom, cameraPoint.y);
    top = Math.max(top, cameraPoint.y);
  }
  const width = right - left;
  const height = top - bottom;
  const padding =
    Math.max(width, height, MIN_VIEWPORT_SHADOW_AREA_METERS) *
    (VIEWPORT_SHADOW_PADDING_FACTOR - 1);
  const centerX = (left + right) / 2;
  const centerY = (bottom + top) / 2;
  const fittedWidth = Math.max(width + padding, minimumAreaMeters);
  const fittedHeight = Math.max(height + padding, minimumAreaMeters);
  camera.left = centerX - fittedWidth / 2;
  camera.right = centerX + fittedWidth / 2;
  camera.bottom = centerY - fittedHeight / 2;
  camera.top = centerY + fittedHeight / 2;
  const shadowTexelMeters = Math.max(
    fittedWidth / Math.max(1, light.shadow.mapSize.x),
    fittedHeight / Math.max(1, light.shadow.mapSize.y)
  );
  light.shadow.normalBias = THREE.MathUtils.clamp(
    shadowTexelMeters * SHADOW_NORMAL_BIAS_TEXELS,
    MIN_SHADOW_NORMAL_BIAS_METERS,
    MAX_SHADOW_NORMAL_BIAS_METERS
  );
  const depthBiasMeters = THREE.MathUtils.clamp(
    shadowTexelMeters * SHADOW_DEPTH_BIAS_TEXELS,
    MIN_SHADOW_DEPTH_BIAS_METERS,
    MAX_SHADOW_DEPTH_BIAS_METERS
  );
  light.shadow.bias = -depthBiasMeters / (camera.far - camera.near);
  camera.updateProjectionMatrix();
  light.shadow.updateMatrices(light);
  light.shadow.needsUpdate = true;
};

const makeMeshShadeable = (mesh: THREE.Mesh) => {
  if (mesh.userData[SHADOW_OVERLAY_MARKER]) return;
  mesh.castShadow = mesh.userData.disableShadowCasting !== true;
  mesh.receiveShadow = true;
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
    for (const material of materials) material.dispose();
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
      makeMeshShadeable(copy);
      copy.visible = true;
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(source.matrixWorld);
      copy.material = Array.isArray(source.material)
        ? source.material.map((material) => material.clone())
        : source.material.clone();
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
  shadowAreaMeters: number
): ShadowLightBinding => {
  const lightTarget = new THREE.Object3D();
  const sunLight = new THREE.DirectionalLight(0xfff2d8, 2.5);
  const sunVector = buildSunVector();
  sunLight.name = SHADOW_SIMULATION_SUN_NAME;
  // MapLibre can repaint this shared canvas for unrelated style, UI, or tile
  // activity. Only actual caster, camera, and sun changes below should pay for
  // regenerating the (normally 4096 square) shadow map.
  sunLight.shadow.autoUpdate = false;
  sunLight.target = lightTarget;
  const binding: ShadowLightBinding = {
    scene,
    sunLight,
    lightTarget,
    sunVector,
    center: new THREE.Vector3(),
    shadowCameraOffsetMeters: configureShadowCamera(
      sunLight,
      shadowAreaMeters,
      DEFAULT_SHADOW_QUALITY
    ),
    shadowAreaMeters,
    sunVectorLengthMeters: shadowAreaMeters * SUN_VECTOR_VIEWPORT_LENGTH_FACTOR,
    sunVectorVisible: false,
    shadowQuality: DEFAULT_SHADOW_QUALITY,
  };
  scene.add(lightTarget, sunLight);
  makeSceneMeshesShadeable(scene);
  updateBindingCenter(binding);
  scene.add(sunVector.root);
  return binding;
};

const applySolarPositionToBinding = (
  binding: ShadowLightBinding,
  direction: THREE.Vector3
) => {
  const normalizedDirection = direction.clone().normalize();
  binding.lightTarget.position.copy(binding.center);
  binding.sunLight.position
    .copy(normalizedDirection)
    .multiplyScalar(binding.shadowCameraOffsetMeters)
    .add(binding.center);
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
  const daylightStrength = THREE.MathUtils.clamp(normalizedDirection.y, 0, 1);
  binding.sunLight.intensity = 1.2 + Math.sqrt(daylightStrength) * 2.2;
  binding.lightTarget.updateMatrixWorld(true);
  binding.sunLight.updateMatrixWorld(true);
  binding.sunLight.shadow.updateMatrices(binding.sunLight);
  binding.sunLight.shadow.needsUpdate = true;
};

const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  binding.scene.remove(
    binding.sunLight,
    binding.lightTarget,
    binding.sunVector.root
  );
  binding.sunVector.dispose();
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
  let disposed = false;
  const restoreMapLibreStyleLayers = suppressMapLibreRegularStyleLayers(map);
  let terrainColor = new THREE.Color(
    terrain?.material?.color ?? DEFAULT_TERRAIN_COLOR
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
  let invalidateShadowMap = () => undefined;
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
            onContentChanged: () => invalidateShadowMap(),
          }
        );
      })()
    : null;
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    initialShadowAreaMeters
  );
  invalidateShadowMap = () => {
    if (disposed) return;
    sharedBinding.sunLight.shadow.needsUpdate = true;
  };
  const genericBridges = new Map<GenericThreeLayer, GenericThreeShadowBridge>();
  let cachedElevationRange: readonly [number, number] | null = null;

  const updateSharedShadowCoverage = () => {
    const mapCenter = map.getCenter();
    const centerElevation =
      terrainRuntime?.getElevation(mapCenter.lng, mapCenter.lat) ?? 0;
    const center = sceneLease.layer.projectLngLatToScene?.(
      [mapCenter.lng, mapCenter.lat],
      centerElevation
    );
    if (!center) {
      if (latestSolarPosition) {
        applySolarPositionToBinding(
          sharedBinding,
          solarPositionToSceneDirection(latestSolarPosition)
        );
      }
      terrainRuntime?.setShadowCamera(sharedBinding.sunLight.shadow.camera);
      map.triggerRepaint();
      return;
    }
    sharedBinding.center.copy(center);
    const bounds = map.getBounds();
    let radiusMeters = 0;
    const projectedCorners: THREE.Vector3[] = [];
    const viewportLngLats = [
      [bounds.getWest(), bounds.getSouth()],
      [bounds.getWest(), bounds.getNorth()],
      [bounds.getEast(), bounds.getSouth()],
      [bounds.getEast(), bounds.getNorth()],
    ] as [number, number][];
    for (const lngLat of viewportLngLats) {
      const corner = sceneLease.layer.projectLngLatToScene?.(
        lngLat,
        terrainRuntime?.getElevation(lngLat[0], lngLat[1]) ?? centerElevation
      );
      if (corner) {
        projectedCorners.push(corner);
        radiusMeters = Math.max(radiusMeters, corner.distanceTo(center));
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
        viewportRadiusMeters * 2 * VIEWPORT_SHADOW_PADDING_FACTOR
      );
    }
    sharedBinding.shadowCameraOffsetMeters = configureShadowCamera(
      sharedBinding.sunLight,
      sharedBinding.shadowAreaMeters,
      sharedBinding.shadowQuality
    );
    if (latestSolarPosition) {
      applySolarPositionToBinding(
        sharedBinding,
        solarPositionToSceneDirection(latestSolarPosition)
      );
      const coveragePoints = viewportLngLats.flatMap((lngLat) =>
        [minimumElevation, maximumElevation].flatMap((elevation) => {
          const point = sceneLease.layer.projectLngLatToScene?.(
            lngLat,
            elevation
          );
          return point ? [point] : [];
        })
      );
      fitShadowCameraToPoints(
        sharedBinding.sunLight,
        coveragePoints,
        configuredShadowAreaMeters ?? MIN_VIEWPORT_SHADOW_AREA_METERS,
        sharedBinding.shadowQuality
      );
    }
    terrainRuntime?.setShadowCamera(sharedBinding.sunLight.shadow.camera);
    map.triggerRepaint();
  };

  const refreshSharedShadowCoverage = () => {
    cachedElevationRange = null;
    updateSharedShadowCoverage();
  };

  map.on("move", updateSharedShadowCoverage);
  map.on("moveend", refreshSharedShadowCoverage);
  map.on("resize", updateSharedShadowCoverage);
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
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
    }
    makeSceneMeshesShadeable(sceneLease.layer.getScene());
    sharedBinding.sunLight.shadow.needsUpdate = true;
    refreshSharedShadowCoverage();
  };
  const unsubscribeSharedSceneContent = subscribeSharedThreeSceneContent(
    map,
    handleSharedSceneContentChanged
  );
  handleSharedSceneContentChanged();

  const applyMapLibreLight = (position: SolarPosition) => {
    if (!map.isStyleLoaded()) return;
    const daylightStrength = THREE.MathUtils.clamp(
      Math.sin(THREE.MathUtils.degToRad(position.elevationDegrees)),
      0,
      1
    );
    const nextPosition: [number, number, number] = [
      1.5,
      position.azimuthDegrees,
      90 - position.elevationDegrees,
    ];
    const nextIntensity = 0.35 + daylightStrength * 0.55;
    const currentLight = map.getLight();
    const currentPosition = currentLight.position;
    if (
      currentLight.anchor === "map" &&
      Array.isArray(currentPosition) &&
      currentPosition.length === nextPosition.length &&
      currentPosition.every((value, index) => value === nextPosition[index]) &&
      currentLight.color === "#fff3df" &&
      currentLight.intensity === nextIntensity
    ) {
      return;
    }
    map.setLight({
      anchor: "map",
      position: nextPosition,
      color: "#fff3df",
      intensity: nextIntensity,
    });
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
      map.triggerRepaint();
    },
    updateShadowQuality(quality) {
      sharedBinding.shadowQuality = quality;
      sharedBinding.shadowCameraOffsetMeters = configureShadowCamera(
        sharedBinding.sunLight,
        sharedBinding.shadowAreaMeters,
        quality
      );
      updateSharedShadowCoverage();
      if (latestSolarPosition) {
        applySolarPositionToBinding(
          sharedBinding,
          solarPositionToSceneDirection(latestSolarPosition)
        );
      } else {
        sharedBinding.sunLight.shadow.needsUpdate = true;
      }
    },
    updateSunDebugVectorVisibility(visible) {
      sharedBinding.sunVectorVisible = visible;
      sharedBinding.sunVector.root.visible = visible && !!latestSolarPosition;
      map.triggerRepaint();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      map.off("style.load", restoreLighting);
      map.off("styledata", ensureShadowBackground);
      map.off("move", updateSharedShadowCoverage);
      map.off("moveend", refreshSharedShadowCoverage);
      map.off("resize", updateSharedShadowCoverage);
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

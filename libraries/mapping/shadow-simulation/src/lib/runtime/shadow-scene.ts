import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";

import { clamp } from "@carma-commons/math";
import {
  NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  type RasterDemTerrainResource,
} from "@carma-commons/resources";
import {
  acquireSharedThreeScene,
  buildRasterDemTerrainRuntime,
  getGenericThreeLayers,
  MAPLIBRE_EVENT,
  getSharedThreeSceneRuntimes,
  subscribeSharedThreeSceneContent,
  subscribeGenericThreeLayers,
  suppressMapLibreRegularStyleLayers,
  isTerrainShadingStyleLayer,
} from "@carma-mapping/engines/maplibre";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneLayer,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
} from "@carma-mapping/engines/maplibre";
import { degToRadNumeric } from "@carma-units";

import {
  SHADOW_TERRAIN_QUALITY,
  type ShadowSceneOptions,
  type ShadowTerrainOptions,
  type ShadowTerrainQuality,
} from "../contracts/shadow-simulation";
import type { SolarPosition } from "../core/solar-position";
import { getFrustumBoxIntersectionPoints } from "../core/frustum-box-intersection";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  type MeshErrorTargetPixels,
  type ShadowQualityMultiplier,
  type ShadowRenderQualityOptions,
} from "../core/shadow-types";
import {
  AtmosphericSunlightEvaluator,
  getAtmosphericInputValidationError,
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
import {
  applyMapLibreTerrainQuality,
  type InternalMapLibreTerrain,
} from "./maplibre-terrain-quality";
import {
  resolveShadowResourceLimits,
  resolveShadowDepthTexelBudget,
  getShadowRenderCapabilities,
  resolveSupportedShadowMsaa,
} from "./shadow-resource-limits";
import {
  clearShadowProjectionDebugSnapshot,
  hasShadowProjectionDebugListeners,
  publishShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";
import {
  createShadowFrameBudget,
  updateShadowFrameBudget,
} from "./shadow-frame-budget";

const FALLBACK_SHADOW_AREA_METERS = 900;
/** Maximum radius represented by the fitted shadow buffer. */
const MAX_RECEIVER_DISTANCE_METERS = 4_000;
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
const SHADOW_SIMULATION_SUN_VECTOR_NAME = "shadow-simulation-sun-vector";
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-raster-dem";
const SHADOW_CONTROLLER_UPDATE_PRIORITY = 200;
const SUN_VECTOR_COLOR = 0xf59e0b;
const SUN_VECTOR_HEAD_LENGTH_FACTOR = 0.18;
const SUN_VECTOR_HEAD_WIDTH_FACTOR = 0.07;
const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SUN_VECTOR_ANGLE_RADIUS_FACTOR = 0.22;
const SUN_VECTOR_ANGLE_SEGMENTS = 24;
const SHADOW_OVERLAY_MARKER = "isShadowSimulationOverlay";
const SHADOW_SIMULATION_SKY_LIGHT_NAME = "shadow-simulation-sky-light";
const LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS = 100;
const MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS = 1_000;
const SHADOW_MAP_STYLE_BASE_LAYER_ID = "carma-shadow-map-style-base";
const OPAQUE_DRAPE_PROPERTIES = new Map<string, string>([
  ["background", "background-opacity"],
  ["fill", "fill-opacity"],
  ["raster", "raster-opacity"],
]);

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

/**
 * What the MapLibre pass below Three contributes to the projected drape:
 * `opaque` paints the complete basemap onto bare terrain, `labels` keeps only
 * the symbol layers so a textured mesh takes draped street names and nothing
 * else.
 */
export type ShadowMapStyleDrapeMode = "opaque" | "labels";

export type ShadowMapLibreTerrainRelease = (() => void) & {
  /** Re-evaluate the drape mode after the shared scene's runtimes changed. */
  refresh: () => void;
};

export type ShadowBuildingAppearance = Readonly<{
  fullOpacity: boolean;
  uniformColor: string | null;
  uniformColorMix?: number;
  textureSaturation?: number;
}>;

export type ShadowSimulationScene = {
  updateTerrain: (terrain: ShadowTerrainOptions | undefined) => void;
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateMeshErrorTarget: (errorTarget: MeshErrorTargetPixels) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateRenderQuality: (options: ShadowRenderQualityOptions) => void;
  updateSoftSunShadows: (enabled: boolean) => void;
  updateTimeAnimating: (animating: boolean) => void;
  refreshProjectionDebug: () => void;
  updateShadowIntensity: (intensity: number) => void;
  updateMapStyleContentVisibility: (visible: boolean) => void;
  updateMapStyleLabelOverlayVisibility: (visible: boolean) => void;
  updateSunDebugVectorVisibility: (visible: boolean) => void;
  updateAtmosphericLutUsage: (options: AtmosphericSunlightOptions) => void;
  dispose: () => void;
};

/**
 * Keep MapLibre's highest native DEM active while its styled framebuffer is
 * captured for projection onto the shared Three scene. Style replacement can
 * temporarily drop terrain, so re-apply it once the source becomes available.
 */
export const acquireShadowMapLibreTerrain = (
  map: MaplibreMap,
  terrainSource: RasterDemTerrainResource = NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
  isMapStyleContentVisible: () => boolean = () => true,
  getDrapeMode: () => ShadowMapStyleDrapeMode = () => "opaque",
  terrainQuality: ShadowTerrainQuality = SHADOW_TERRAIN_QUALITY.MAX
): ShadowMapLibreTerrainRelease => {
  const sourceId = terrainSource.id;
  type InternalTerrain = InternalMapLibreTerrain & {
    getMeshFrameDelta?: (zoom: number) => number;
  };
  type DrapeLayer = {
    id: string;
    type: string;
    source?: unknown;
    "source-layer"?: unknown;
  };
  const terrainMap = map as MaplibreMap & {
    getTerrain?: MaplibreMap["getTerrain"];
    getSource?: MaplibreMap["getSource"];
    setTerrain?: MaplibreMap["setTerrain"];
    terrain?: InternalTerrain | null;
  };
  if (
    typeof terrainMap.getTerrain !== "function" ||
    typeof terrainMap.getSource !== "function" ||
    typeof terrainMap.setTerrain !== "function"
  ) {
    return Object.assign(() => undefined, { refresh: () => undefined });
  }
  const previousTerrain = terrainMap.getTerrain();
  const savedDrapeOpacities = new Map<
    string,
    { signature: string; property: string; value: unknown }
  >();
  const savedTerrainShadingVisibilities = new Map<
    string,
    { signature: string; value: unknown }
  >();
  let disposed = false;
  let applying = false;
  let createdBaseLayer = false;
  let patchedTerrain: InternalTerrain | null = null;
  let inheritedFrameDelta = false;
  let originalFrameDelta: InternalTerrain["getMeshFrameDelta"];
  let qualityPatchedTerrain: InternalTerrain | null = null;
  let restoreTerrainQuality: () => void = () => undefined;
  let lastApplyErrorMessage: string | null = null;

  const restoreTerrainFrame = () => {
    if (!patchedTerrain) return;
    if (inheritedFrameDelta) {
      delete patchedTerrain.getMeshFrameDelta;
    } else {
      patchedTerrain.getMeshFrameDelta = originalFrameDelta;
    }
    patchedTerrain = null;
    originalFrameDelta = undefined;
    inheritedFrameDelta = false;
  };

  const suppressTerrainFrame = () => {
    const terrain = terrainMap.terrain;
    if (!terrain || terrain === patchedTerrain) return;
    restoreTerrainFrame();
    if (typeof terrain.getMeshFrameDelta !== "function") return;
    inheritedFrameDelta = !Object.prototype.hasOwnProperty.call(
      terrain,
      "getMeshFrameDelta"
    );
    originalFrameDelta = terrain.getMeshFrameDelta;
    terrain.getMeshFrameDelta = () => 0;
    patchedTerrain = terrain;
  };

  const applyTerrainQuality = () => {
    const currentTerrain = terrainMap.terrain;
    if (!currentTerrain || currentTerrain === qualityPatchedTerrain) return;
    restoreTerrainQuality();
    qualityPatchedTerrain = currentTerrain;
    restoreTerrainQuality = applyMapLibreTerrainQuality(
      currentTerrain,
      terrainSource.tileSize,
      terrainQuality,
      () => {
        // Native MapLibre 5.x defaults. Materialize its adaptive LOD callback
        // through the public API before adding our private quality offset.
        // Only this terrain source changes; existing custom hooks are kept.
        map.setSourceTileLodParams?.(9.314, 3, terrainSource.id);
      }
    );
    map.triggerRepaint?.();
  };

  const getLayerSignature = (layer: DrapeLayer) =>
    `${layer.type}:${String(layer.source)}:${String(layer["source-layer"])}`;

  const ensureOpaqueDrape = () => {
    const style = map.getStyle();
    const layers = (style.layers ?? []) as DrapeLayer[];
    for (const layer of layers) {
      if (!isTerrainShadingStyleLayer(layer)) continue;
      const signature = getLayerSignature(layer);
      let saved = savedTerrainShadingVisibilities.get(layer.id);
      const currentVisibility = map.getLayoutProperty(layer.id, "visibility");
      if (!saved || saved.signature !== signature) {
        saved = { signature, value: currentVisibility };
        savedTerrainShadingVisibilities.set(layer.id, saved);
      } else if (currentVisibility !== "none") {
        // Adopt a style-composer replacement as the newest teardown value.
        saved.value = currentVisibility;
      }
      if (currentVisibility !== "none") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
    if (!isMapStyleContentVisible()) return;
    if (!map.getLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID)) {
      map.addLayer(
        {
          id: SHADOW_MAP_STYLE_BASE_LAYER_ID,
          type: "background",
          paint: {
            "background-color": "#ffffff",
            "background-opacity": 1,
          },
        },
        layers[0]?.id
      );
      createdBaseLayer = true;
    }

    for (const layer of layers) {
      if (
        layer.id === SHADOW_MAP_STYLE_BASE_LAYER_ID ||
        layer.type === "custom"
      ) {
        continue;
      }
      const property = OPAQUE_DRAPE_PROPERTIES.get(layer.type);
      if (!property) continue;
      const signature = getLayerSignature(layer);
      let saved = savedDrapeOpacities.get(layer.id);
      const currentOpacity = map.getPaintProperty(layer.id, property);
      if (!saved || saved.signature !== signature) {
        saved = {
          signature,
          property,
          value: currentOpacity,
        };
        savedDrapeOpacities.set(layer.id, saved);
      } else if (currentOpacity !== 1) {
        // StyleComposer and opacity controls may replace the authored value
        // while shadows are active. Preserve the newest value for teardown.
        saved.value = currentOpacity;
      }
      if (currentOpacity !== 1) {
        map.setPaintProperty(layer.id, property, 1);
      }
    }
  };

  const restoreSavedVisibilities = (
    saved: Map<string, { signature: string; value: unknown }>
  ) => {
    for (const [layerId, entry] of saved) {
      try {
        const layer = map
          .getStyle()
          .layers?.find(({ id }) => id === layerId) as DrapeLayer | undefined;
        if (
          layer &&
          getLayerSignature(layer) === entry.signature &&
          map.getLayoutProperty(layerId, "visibility") === "none"
        ) {
          map.setLayoutProperty(
            layerId,
            "visibility",
            entry.value === undefined ? null : entry.value
          );
        }
      } catch {
        // A style replacement may already have removed the layer.
      }
    }
    saved.clear();
  };

  const restoreOpaqueDrape = () => {
    for (const [layerId, saved] of savedDrapeOpacities) {
      try {
        const layer = map
          .getStyle()
          .layers?.find(({ id }) => id === layerId) as DrapeLayer | undefined;
        if (
          layer &&
          getLayerSignature(layer) === saved.signature &&
          map.getPaintProperty(layerId, saved.property) === 1
        ) {
          map.setPaintProperty(
            layerId,
            saved.property,
            saved.value === undefined ? null : saved.value
          );
        }
      } catch {
        // A style replacement may already have removed the layer.
      }
    }
    savedDrapeOpacities.clear();
    if (createdBaseLayer) {
      createdBaseLayer = false;
      try {
        if (map.getLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID)) {
          map.removeLayer(SHADOW_MAP_STYLE_BASE_LAYER_ID);
        }
      } catch {
        // The style may already be gone during map teardown.
      }
    }
  };

  const apply = () => {
    if (disposed || applying) return;
    applying = true;
    try {
      if (!terrainMap.getSource(sourceId) && map.isStyleLoaded()) {
        map.addSource(sourceId, {
          type: "raster-dem",
          tiles: [terrainSource.url],
          tileSize: terrainSource.tileSize,
          minzoom: terrainSource.minzoom,
          maxzoom: terrainSource.maxzoom,
          encoding: terrainSource.encoding,
          bounds: [...terrainSource.bounds],
        });
      }
      if (getDrapeMode() === "labels") {
        // The shared scene registry owns the label drape (it also runs
        // without the shadow simulation); only hand the opaque pass back.
        restoreOpaqueDrape();
        restoreSavedVisibilities(savedTerrainShadingVisibilities);
      } else {
        ensureOpaqueDrape();
      }
      if (terrainMap.getSource(sourceId)) {
        const current = terrainMap.getTerrain();
        if (current?.source !== sourceId || (current.exaggeration ?? 1) !== 1) {
          terrainMap.setTerrain({ source: sourceId, exaggeration: 1 });
        }
        applyTerrainQuality();
        suppressTerrainFrame();
      }
      lastApplyErrorMessage = null;
    } catch (error) {
      // Style replacement briefly exposes an incomplete style. Its next
      // styledata event retries both the opaque drape and terrain setup.
      const message = error instanceof Error ? error.message : String(error);
      if (message !== lastApplyErrorMessage) {
        lastApplyErrorMessage = message;
        console.error(
          "[shadow-simulation] MapLibre terrain setup failed",
          error
        );
      }
    } finally {
      applying = false;
    }
  };
  const handleTerrainChange = () => {
    if (!applying) apply();
  };

  map.on(MAPLIBRE_EVENT.STYLE_DATA, apply);
  map.on(MAPLIBRE_EVENT.TERRAIN, handleTerrainChange);
  apply();

  const release = () => {
    if (disposed) return;
    disposed = true;
    map.off(MAPLIBRE_EVENT.STYLE_DATA, apply);
    map.off(MAPLIBRE_EVENT.TERRAIN, handleTerrainChange);
    restoreTerrainFrame();
    restoreTerrainQuality();
    qualityPatchedTerrain = null;
    restoreOpaqueDrape();
    restoreSavedVisibilities(savedTerrainShadingVisibilities);
    try {
      if (
        previousTerrain &&
        terrainMap.getSource(previousTerrain.source) !== undefined
      ) {
        terrainMap.setTerrain(previousTerrain);
      } else {
        terrainMap.setTerrain(null);
      }
    } catch {
      // The style may already be gone during map teardown.
    }
  };
  return Object.assign(release, {
    refresh: () => {
      if (!disposed && !applying) apply();
    },
  });
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
  // Closed solids default to casting from both faces, so a sun-facing wall
  // shadows the ground under a solid that does not sit flush on the terrain.
  // Tile runtimes can provide a topology-derived side before they join the
  // shared scene; keep that ground truth instead of replacing it here.
  if (!mesh.userData.isShadowTerrainSurface) {
    for (const material of materials) {
      material.shadowSide ??= THREE.DoubleSide;
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
  const {
    shadowAreaMeters: configuredShadowAreaMeters,
    terrain: initialTerrain,
    mapLibreTerrain,
    terrainQuality = SHADOW_TERRAIN_QUALITY.MAX,
  } = options;
  let terrain = initialTerrain;
  const initialShadowAreaMeters =
    configuredShadowAreaMeters ?? FALLBACK_SHADOW_AREA_METERS;
  const previousLight = map.getLight();
  let mapStyleContentVisible = true;
  // A mesh that supplies the terrain carries its own texture: the basemap
  // pass then only contributes draped labels. Bare raster-DEM terrain, or no
  // terrain-providing content at all, keeps the opaque basemap drape.
  const getMapStyleDrapeMode = (): ShadowMapStyleDrapeMode => {
    const providers = getSharedThreeSceneRuntimes(map).filter(
      (runtime) => runtime.providesTerrain === true
    );
    return providers.length > 0 &&
      providers.every(
        (runtime) => runtime.mapStyleProjectionBlend === "overlay"
      )
      ? "labels"
      : "opaque";
  };
  const releaseMapLibreTerrain = acquireShadowMapLibreTerrain(
    map,
    mapLibreTerrain ?? NRW_DGM1_DHHN2016_TERRARIUM_TERRAIN,
    () => mapStyleContentVisible,
    getMapStyleDrapeMode,
    terrainQuality
  );
  const syncMeshLabelStyle = () => {
    sceneLease.setMeshLabelStyle(getMapStyleDrapeMode() === "labels");
  };
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
  let timeAnimating = false;
  let lastMapLibreStyleUpdateMs = Number.NEGATIVE_INFINITY;
  let pendingMapLibreLightSample: AtmosphericSunlightSample | null = null;
  let mapLibreStyleUpdateTimer: ReturnType<typeof setTimeout> | null = null;
  let restoreMapLibreStyleLayers: (() => void) | null = null;
  let terrainColor = new THREE.Color(
    terrain?.material?.color ?? DEFAULT_SHADOW_SURFACE_COLOR
  );
  const syncMapStyleContentVisibility = () => {
    if (mapStyleContentVisible) {
      restoreMapLibreStyleLayers?.();
      restoreMapLibreStyleLayers = null;
      sceneLease.layer.setMapStyleProjectionVisible?.(true);
      return;
    }
    sceneLease.layer.setMapStyleProjectionVisible?.(false);
    restoreMapLibreStyleLayers ??= suppressMapLibreRegularStyleLayers(map);
  };
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
      LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS
    ) ?? new THREE.Vector3(0, LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS, 0);
  const atmosphereSkyReference: AtmosphericSkyReference = {
    observer: atmosphereSkyObserver,
    scenePosition: atmosphereSkyScenePosition,
  };
  const atmosphericSunlight = new AtmosphericSunlightEvaluator();
  let invalidateShadowMap = () => undefined;
  let refreshTerrainShadowState = () => invalidateShadowMap();
  let lastTerrainRuntimeErrorMessage: string | null = null;
  let terrainRevision = 0;
  const buildTerrainRuntime = (originLngLat?: [number, number]) => {
    if (!terrain) return null;
    const mapCenter = map.getCenter();
    const {
      errorTargetPixels,
      shadowLevelOffset,
      minimumLevel,
      maximumLevel,
      maxSelectionTiles,
      requestConcurrency,
      maxCacheBytes,
      maxCachedMeshes,
      meshSegments,
      noDataHeightMeters,
      heightRangeMeters,
      material,
      ...terrainSourceConfig
    } = terrain;
    return buildRasterDemTerrainRuntime(
      `${SHADOW_SIMULATION_TERRAIN_RUNTIME_ID}-${++terrainRevision}`,
      terrainSourceConfig,
      originLngLat ?? [mapCenter.lng, mapCenter.lat],
      {
        errorTargetPixels: errorTargetPixels ?? 0.5,
        shadowLevelOffset,
        minimumLevel,
        maximumLevel,
        maxSelectionTiles,
        requestConcurrency,
        maxCacheBytes,
        maxCachedMeshes,
        meshSegments: meshSegments ?? terrainSourceConfig.tileSize,
        noDataHeightMeters,
        heightRangeMeters,
        material,
        receivesMapStyleTexture: true,
        onContentChanged: () => refreshTerrainShadowState(),
        onError: (error) => {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message === lastTerrainRuntimeErrorMessage) return;
          lastTerrainRuntimeErrorMessage = message;
          console.error(
            "[shadow-simulation] Raster DEM terrain runtime failed",
            error
          );
        },
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
  let initialTerrainStageReady = terrainRuntime === null;
  if (terrainRuntime) sceneLease.layer.addRuntime(terrainRuntime);
  const sharedBinding = buildShadowLightBinding(
    sceneLease.layer.getScene(),
    initialShadowAreaMeters,
    terrainColor
  );
  const atmosphereCameraPosition = new THREE.Vector3();
  let shadowStateEpoch = 0;
  let shadowVisualEpoch = 0;
  let cameraAltitudeMeters = LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS;
  let cachedElevationRange: readonly [number, number] | null = null;
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
      `[SHADOW] Atmospheric update rejected; retaining last valid frame (${phase}: ${reason})`,
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
  const applyMapLibreLightSampleImmediately = (
    sample: AtmosphericSunlightSample
  ) => {
    pendingMapLibreLightSample = null;
    lastMapLibreStyleUpdateMs = performance.now();
    const nextColor = `#${sample.color.getHexString()}`;
    sceneLease.setLocationLabelColor(nextColor);
    if (!map.isStyleLoaded()) return;
    const nextPosition: [number, number, number] = [
      1.5,
      sample.azimuthDegrees,
      90 - sample.elevationDegrees,
    ];
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
  const flushMapLibreLightSample = () => {
    if (mapLibreStyleUpdateTimer !== null) {
      globalThis.clearTimeout(mapLibreStyleUpdateTimer);
      mapLibreStyleUpdateTimer = null;
    }
    const sample = pendingMapLibreLightSample;
    if (sample) applyMapLibreLightSampleImmediately(sample);
  };
  const applyMapLibreLightSample = (sample: AtmosphericSunlightSample) => {
    pendingMapLibreLightSample = sample;
    if (!timeAnimating && !mapInMotion) {
      flushMapLibreLightSample();
      return;
    }

    const elapsedMs = performance.now() - lastMapLibreStyleUpdateMs;
    if (elapsedMs >= MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS) {
      flushMapLibreLightSample();
      return;
    }
    if (mapLibreStyleUpdateTimer !== null) return;
    mapLibreStyleUpdateTimer = globalThis.setTimeout(() => {
      mapLibreStyleUpdateTimer = null;
      const latestSample = pendingMapLibreLightSample;
      if (latestSample) applyMapLibreLightSampleImmediately(latestSample);
    }, MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS - elapsedMs);
  };
  const evaluateAtmosphericSunlightForMap = (position: SolarPosition) => {
    const mapCenter = map.getCenter();
    const observer = {
      longitude: mapCenter.lng,
      latitude: mapCenter.lat,
      altitudeMeters: cameraAltitudeMeters,
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
  let mapInMotion = false;
  let latestShadowView: SharedThreeSceneShadowView | null = null;
  let appliedRuntimeShadowView: SharedThreeSceneShadowView | null = null;
  const terrainSelectionSignatures = new WeakMap<
    SharedThreeSceneRuntime,
    string
  >();
  const getTerrainSelectionSignature = (
    view: SharedThreeSceneShadowView | null
  ) => {
    if (!view) return "none";
    const center = map.getCenter();
    const canvas = map.getCanvas();
    return [
      Math.round(center.lng * 10_000_000),
      Math.round(center.lat * 10_000_000),
      Math.round((map.getZoom?.() ?? 0) * 10_000),
      Math.round((map.getBearing?.() ?? 0) * 1_000),
      Math.round((map.getPitch?.() ?? 0) * 1_000),
      `${canvas.clientWidth || canvas.width}x${
        canvas.clientHeight || canvas.height
      }`,
      latestSolarPosition?.azimuthDegrees ?? "no-sun",
      latestSolarPosition?.elevationDegrees ?? "no-sun",
      sharedBinding.shadowQuality,
    ].join(";");
  };
  const applyRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    appliedRuntimeShadowView = view;
    const selectionSignature = getTerrainSelectionSignature(view);
    const runtimes = [
      ...getSharedThreeSceneRuntimes(map),
      ...(terrainRuntime ? [terrainRuntime] : []),
    ];
    for (const runtime of new Set(runtimes)) {
      if (!runtime.providesTerrain) {
        runtime.setShadowView?.(view);
        continue;
      }
      if (terrainSelectionSignatures.get(runtime) === selectionSignature) {
        continue;
      }
      terrainSelectionSignatures.set(runtime, selectionSignature);
      runtime.setShadowView?.(view);
    }
  };
  const setRuntimeShadowView = (view: SharedThreeSceneShadowView | null) => {
    latestShadowView = view;
    if (!mapInMotion) applyRuntimeShadowView(view);
  };

  let lastDebugPublishMs = 0;
  let softSunShadowsEnabled = true;
  let renderQuality: ShadowRenderQualityOptions = {};
  let effectiveRenderQuality = resolveShadowRenderQuality(renderQuality);
  let renderCapabilities: ReturnType<
    typeof getShadowRenderCapabilities
  > | null = null;
  const getAccumulationOptions = () => ({
    format: effectiveRenderQuality.shadowBufferFormat,
    msaaSamples: resolveSupportedShadowMsaa(
      effectiveRenderQuality,
      (effectiveRenderQuality.shadowBufferFormat === SHADOW_BUFFER_FORMAT.SDR_8
        ? renderCapabilities?.sdrSamples
        : renderCapabilities?.hdrSamples) ?? [0, 2, 4]
    ),
  });
  let accumulationOptions = getAccumulationOptions();
  let contentChangeTimer = 0;
  let coverageNeedsCameraReevaluation = true;
  let fallbackReceiverWorldPoints: THREE.Vector3[] = [];
  let renderCameraSignature = "";
  let lastMotionShadowUpdateMs = Number.NEGATIVE_INFINITY;
  let shadowFrameBudget = createShadowFrameBudget();
  let maxAccumulationPixels = Number.POSITIVE_INFINITY;
  let nativeAccumulationFits = true;
  let resourceLimits = resolveShadowResourceLimits(4096);
  sharedBinding.controller.setSoftSun(softSunShadowsEnabled);

  const quantizeViewValue = (value: number, step: number) =>
    Math.round(value / step) * step;

  const getCoverageViewSignature = (frame: SharedThreeSceneFrame) => {
    const center = map.getCenter();
    return [
      quantizeViewValue(center.lng, 0.0000001),
      quantizeViewValue(center.lat, 0.0000001),
      quantizeViewValue(map.getZoom?.() ?? 0, 0.0001),
      quantizeViewValue(map.getBearing?.() ?? 0, 0.001),
      quantizeViewValue(map.getPitch?.() ?? 0, 0.001),
      `${frame.viewport.x}x${frame.viewport.y}`,
    ].join(";");
  };

  const updateSharedShadowCoverage = (
    reevaluateSun = true,
    requestRepaint = true,
    frame?: SharedThreeSceneFrame
  ) => {
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
      if (requestRepaint) map.triggerRepaint();
      return;
    }
    sharedBinding.center.copy(center);
    cachedElevationRange ??= getVisibleSceneElevationRange(
      sharedBinding.scene,
      center.y
    );
    const [minimumElevation, maximumElevation] = cachedElevationRange;
    if (frame) {
      const coveragePoints = getViewportElevationEnvelopePoints(
        frame.renderCamera,
        minimumElevation,
        maximumElevation,
        center
      );
      if (coveragePoints.length > 0) {
        const viewportSize = new THREE.Box3()
          .setFromPoints(coveragePoints)
          .getSize(new THREE.Vector3());
        const viewportRadiusMeters = Math.max(
          ...coveragePoints.map((point) => point.distanceTo(center))
        );
        sharedBinding.sunVectorLengthMeters =
          Math.min(viewportSize.x, viewportSize.z) *
          SUN_VECTOR_VIEWPORT_LENGTH_FACTOR;
        sharedBinding.shadowAreaMeters = Math.max(
          configuredShadowAreaMeters ?? 0,
          MIN_VIEWPORT_SHADOW_AREA_METERS,
          viewportRadiusMeters * 2
        );
        fallbackReceiverWorldPoints = coveragePoints;
      }
    } else {
      // Public map.unproject performs synchronous terrain depth readback.
      // Fit against the next render camera and retain the last valid coverage.
      coverageNeedsCameraReevaluation = true;
    }
    sharedBinding.shadowCameraOffsetMeters = Math.max(
      DEFAULT_SHADOW_CAMERA_OFFSET_METERS,
      sharedBinding.shadowAreaMeters * 1.5
    );
    sharedBinding.receiverWorldPoints = fallbackReceiverWorldPoints;
    sharedBinding.minimumElevationMeters = minimumElevation;
    sharedBinding.maximumElevationMeters = maximumElevation;
    sharedBinding.dirty = true;
    // During movement, move the anchor without resampling the atmosphere.
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
    if (requestRepaint) map.triggerRepaint();
  };

  const shadowControllerRuntime: SharedThreeSceneRuntime = {
    id: "shadow-simulation-controller",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root: new THREE.Group(),
    updatePriority: SHADOW_CONTROLLER_UPDATE_PRIORITY,
    update(frame) {
      const renderer = sceneLease.layer.getRenderer?.();
      if (renderer && !renderCapabilities) {
        renderCapabilities = getShadowRenderCapabilities(renderer);
        accumulationOptions = getAccumulationOptions();
        resourceLimits = resolveShadowResourceLimits(
          Math.min(
            renderCapabilities.maxTextureSize,
            renderCapabilities.maxRenderbufferSize
          )
        );
        sharedBinding.controller.setMaxShadowMapSize(
          resourceLimits.maxShadowMapSize
        );
        maxAccumulationPixels = resourceLimits.maxAccumulationPixels;
      }
      // Above the device's existing memory cap, retain direct full-resolution
      // shading instead of blurring the captured map/labels by downsampling.
      nativeAccumulationFits =
        frame.viewport.x * frame.viewport.y <= maxAccumulationPixels;
      shadowFrameBudget = updateShadowFrameBudget(
        shadowFrameBudget,
        performance.now(),
        mapInMotion
      );
      const cameraHeightAboveTargetMeters = Math.max(
        0,
        frame.lodCamera.position.y - frame.lookTarget.y
      );
      const nextCameraAltitudeMeters =
        LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS +
        cameraHeightAboveTargetMeters;
      const nextAtmosphereSceneHeight =
        atmosphereSkyScenePosition.y + cameraHeightAboveTargetMeters;
      const atmosphereCameraMatricesValid = [
        ...frame.lodCamera.matrixWorld.elements,
        ...frame.lodCamera.projectionMatrix.elements,
      ].every(Number.isFinite);
      if (
        !atmosphereCameraMatricesValid ||
        !Number.isFinite(nextCameraAltitudeMeters) ||
        !Number.isFinite(nextAtmosphereSceneHeight)
      ) {
        rejectAtmosphereUpdate(
          "render camera",
          "local Three.js camera matrix or altitude is invalid",
          {
            altitudeMeters: nextCameraAltitudeMeters,
            cameraHeightAboveTargetMeters,
            matrixWorld: frame.lodCamera.matrixWorld.elements,
            projectionMatrix: frame.lodCamera.projectionMatrix.elements,
          }
        );
      } else {
        sharedBinding.atmosphericSky.updateViewCamera(frame.lodCamera);
        sharedBinding.atmosphericSky.updateObserverScenePosition(
          atmosphereCameraPosition.set(
            atmosphereSkyScenePosition.x,
            nextAtmosphereSceneHeight,
            atmosphereSkyScenePosition.z
          )
        );
        const altitudeChanged =
          Math.abs(nextCameraAltitudeMeters - cameraAltitudeMeters) >= 0.25;
        cameraAltitudeMeters = nextCameraAltitudeMeters;
        if (altitudeChanged && latestSolarPosition) {
          const sample = evaluateAtmosphericSunlightForMap(latestSolarPosition);
          if (sample) applyMapLibreLightSample(sample);
        }
      }
      // MapLibre may rebuild render-camera matrices while terrain settles even
      // though its public view did not move. Terrain changes invalidate this
      // coverage separately, so use the stable user-facing view state here.
      const nextRenderCameraSignature = getCoverageViewSignature(frame);
      if (
        coverageNeedsCameraReevaluation ||
        nextRenderCameraSignature !== renderCameraSignature
      ) {
        const nowMs = performance.now();
        if (
          mapInMotion &&
          nowMs - lastMotionShadowUpdateMs < shadowFrameBudget.updateIntervalMs
        ) {
          return;
        }
        lastMotionShadowUpdateMs = nowMs;
        renderCameraSignature = nextRenderCameraSignature;
        cachedElevationRange = mapInMotion
          ? cachedElevationRange ?? [
              sharedBinding.minimumElevationMeters,
              sharedBinding.maximumElevationMeters,
            ]
          : getViewElevationRange(
              sharedBinding.scene,
              getSharedThreeSceneRuntimes(map),
              frame.renderCamera,
              sharedBinding.center.y
            );
        // We are already inside the custom-layer render. Triggering MapLibre
        // here would turn a coverage refresh into a self-sustaining idle loop.
        updateSharedShadowCoverage(false, false, frame);
        coverageNeedsCameraReevaluation = false;
      }
      if (!sharedBinding.dirty) return;
      if (
        sharedBinding.sunVectorVisible &&
        sharedBinding.sunVector.root.cone.position.y !==
          sharedBinding.sunVectorLengthMeters
      ) {
        applySolarPositionToBinding(
          sharedBinding,
          sharedBinding.directionToSun,
          sharedBinding.sunColor,
          sharedBinding.sunIntensity
        );
      }
      shadowStateEpoch += 1;
      const visibleTileVolumePoints = mapInMotion
        ? []
        : getActiveTileVolumes().flatMap(({ minimum, maximum }) =>
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
          : fallbackReceiverWorldPoints;
      if (
        sharedBinding.receiverWorldPoints.length === 0 ||
        !latestSolarPosition
      ) {
        setRuntimeShadowView(null);
        clearShadowProjectionDebugSnapshot(map);
        return;
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
        mapTexelBudget: resolveShadowDepthTexelBudget(
          resourceLimits.maxShadowMapSize,
          sharedBinding.shadowQuality,
          frame.viewport.x * frame.viewport.y,
          mapInMotion ? shadowFrameBudget.depthScale : 1
        ),
        groundTexelFit: effectiveRenderQuality.shadowGroundTexelFit,
        stabilizeMapSize: mapInMotion,
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
    effectiveRenderQuality.shadowSunDiscSamples;
  const accumulationController = {
    get options() {
      return accumulationOptions;
    },
    get maxRenderTargetPixels() {
      return maxAccumulationPixels;
    },
    get rounds() {
      return getSunDiscAccumulationRounds();
    },
    epoch: () => shadowStateEpoch,
    visualEpoch: () => shadowVisualEpoch,
    pending: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      !timeAnimating &&
      (!initialTerrainStageReady || mapInMotion || contentChangeTimer !== 0),
    active: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      initialTerrainStageReady &&
      !mapInMotion &&
      !timeAnimating &&
      contentChangeTimer === 0 &&
      latestSolarPosition !== null &&
      latestShadowView !== null &&
      sharedBinding.receiverWorldPoints.length > 0,
    retainSettledFrame: () =>
      nativeAccumulationFits &&
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
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    mapInMotion = true;
    coverageNeedsCameraReevaluation = true;
    sharedBinding.dirty = true;
  };
  const handleMove = () => {
    coverageNeedsCameraReevaluation = true;
    sharedBinding.dirty = true;
  };
  const handleMoveEnd = () => {
    mapInMotion = false;
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    refreshSharedShadowCoverage();
    if (latestAtmosphericSunlight) {
      pendingMapLibreLightSample = latestAtmosphericSunlight;
      flushMapLibreLightSample();
    }
    if (appliedRuntimeShadowView !== latestShadowView) {
      applyRuntimeShadowView(latestShadowView);
    }
  };
  const handleResize = () => {
    handleMove();
    map.triggerRepaint();
  };
  map.on(MAPLIBRE_EVENT.MOVE_START, handleMoveStart);
  map.on(MAPLIBRE_EVENT.MOVE, handleMove);
  map.on(MAPLIBRE_EVENT.MOVE_END, handleMoveEnd);
  map.on(MAPLIBRE_EVENT.RESIZE, handleResize);
  const watchTerrainRuntime = (runtime: NonNullable<typeof terrainRuntime>) => {
    void runtime.ready.then((loaded) => {
      if (!loaded || disposed || terrainRuntime !== runtime) return;
      initialTerrainStageReady = true;
      refreshSharedShadowCoverage();
      map.triggerRepaint();
    });
  };
  const syncTerrainRuntime = () => {
    const meshProvidesTerrain = sharedSceneProvidesTerrain();
    if (!terrain) return;
    if (meshProvidesTerrain) {
      initialTerrainStageReady = true;
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

    const runtime = buildTerrainRuntime();
    if (!runtime) return;
    initialTerrainStageReady = false;
    terrainRuntime = runtime;
    runtime.setMaterialColor(`#${terrainColor.getHexString()}`);
    runtime.setShadowView(appliedRuntimeShadowView);
    sceneLease.layer.addRuntime(runtime);
    watchTerrainRuntime(runtime);
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
  };
  if (terrainRuntime) {
    watchTerrainRuntime(terrainRuntime);
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
  syncMeshLabelStyle();

  const handleSharedSceneContentChanged = () => {
    if (disposed) return;
    syncTerrainRuntime();
    releaseMapLibreTerrain.refresh();
    syncMeshLabelStyle();
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      if (runtime.providesTerrain) {
        runtime.setErrorTarget?.(latestMeshErrorTarget);
      }
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
    }
    // New terrain providers receive the current shadow-selection envelope,
    // while existing ones keep their stationary-view signature. Refitting the
    // light to freshly streamed terrain must not restart terrain traversal.
    applyRuntimeShadowView(appliedRuntimeShadowView);
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
    sharedBinding.dirty = true;
    map.triggerRepaint();
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

  map.on(MAPLIBRE_EVENT.STYLE_LOAD, restoreLighting);

  return {
    updateSolarPosition,
    updateTerrain(nextTerrain) {
      if (terrain === nextTerrain) return;
      terrain = nextTerrain;
      if (!nextTerrain || sharedSceneProvidesTerrain()) return;
      const previous = terrainRuntime;
      const replacement = buildTerrainRuntime(previous?.originLngLat);
      if (!replacement) return;
      replacement.setMaterialColor(`#${terrainColor.getHexString()}`);
      replacement.setShadowView(appliedRuntimeShadowView);
      // One runtime owns the mixed old/new quadtree cut. This keeps borders
      // stitched across sources and preserves receivers while tiles arrive.
      if (previous) replacement.adoptPresentation(previous);
      terrainRuntime = replacement;
      sceneLease.layer.addRuntime(replacement);
      if (previous) sceneLease.layer.removeRuntime(previous.id);
      watchTerrainRuntime(replacement);
      cachedElevationRange = null;
      coverageNeedsCameraReevaluation = true;
      invalidateShadowPresentation();
      refreshTerrainShadowState();
      map.triggerRepaint();
    },
    updateTerrainColor(color) {
      const nextColor = new THREE.Color(color);
      if (terrainColor.equals(nextColor)) return;
      invalidateShadowPresentation();
      terrainRuntime?.setMaterialColor(color);
      sharedBinding.atmosphericSky.updateGroundAlbedo(nextColor);
      terrainColor = nextColor;
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
      effectiveRenderQuality = resolveShadowRenderQuality(
        renderQuality,
        quality
      );
      accumulationOptions = getAccumulationOptions();
      shadowFrameBudget = createShadowFrameBudget(quality);
      sharedBinding.dirty = true;
      updateSharedShadowCoverage();
      sharedBinding.controller.invalidate();
    },
    updateRenderQuality(options) {
      const previous = effectiveRenderQuality;
      const next = resolveShadowRenderQuality(
        options,
        sharedBinding.shadowQuality
      );
      renderQuality = { ...options };
      effectiveRenderQuality = next;
      if (
        previous.shadowBufferFormat === next.shadowBufferFormat &&
        previous.shadowSunDiscSamples === next.shadowSunDiscSamples &&
        previous.shadowMsaaSamples === next.shadowMsaaSamples &&
        previous.shadowGroundTexelFit === next.shadowGroundTexelFit
      ) {
        return;
      }
      accumulationOptions = getAccumulationOptions();
      invalidateShadowPresentation();
      if (previous.shadowGroundTexelFit !== next.shadowGroundTexelFit) {
        sharedBinding.dirty = true;
        sharedBinding.controller.invalidate();
      }
      map.triggerRepaint();
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
      if (!animating) {
        flushMapLibreLightSample();
        sharedBinding.dirty = true;
      }
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
    updateMapStyleContentVisibility(visible) {
      if (mapStyleContentVisible === visible) return;
      mapStyleContentVisible = visible;
      syncMapStyleContentVisibility();
      map.triggerRepaint();
    },
    updateMapStyleLabelOverlayVisibility(visible) {
      sceneLease.setPointLabelOverlayVisible(visible);
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
      if (mapLibreStyleUpdateTimer !== null) {
        globalThis.clearTimeout(mapLibreStyleUpdateTimer);
        mapLibreStyleUpdateTimer = null;
      }
      clearShadowProjectionDebugSnapshot(map);
      map.off(MAPLIBRE_EVENT.STYLE_LOAD, restoreLighting);
      map.off(MAPLIBRE_EVENT.MOVE_START, handleMoveStart);
      map.off(MAPLIBRE_EVENT.MOVE, handleMove);
      map.off(MAPLIBRE_EVENT.MOVE_END, handleMoveEnd);
      map.off(MAPLIBRE_EVENT.RESIZE, handleResize);
      unsubscribeGenericLayers();
      unsubscribeSharedSceneContent();
      latestShadowView = null;
      applyRuntimeShadowView(null);
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
        restoreMapLibreStyleLayers?.();
      } catch {
        // The style may already be gone during map teardown.
      }
      restoreMapLibreStyleLayers = null;
      sceneLease.layer.setMapStyleProjectionVisible?.(true);
      releaseMapLibreTerrain();
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

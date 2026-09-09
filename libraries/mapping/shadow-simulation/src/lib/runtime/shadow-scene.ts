import { MercatorCoordinate, type Map as MaplibreMap } from "maplibre-gl";
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
  TERRAIN_MAP_STYLE,
  isTerrainShadingStyleLayer,
  isSharedThreeTerrainLoading,
  subscribeSharedThreeTerrainLoading,
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
  buildShadowReceiverCells,
  buildShadowReceiverNeighbourRing,
  getVisibleShadowReceiverCorners,
  nearestIdleTerrainLevel,
} from "../core/shadow-receiver-grid";
import type { ShadowReceiverCell } from "../core/shadow-page-plan";
import {
  DEFAULT_MESH_ERROR_TARGET_PIXELS,
  DEFAULT_SHADOW_QUALITY,
  DEFAULT_SHADOW_SURFACE_COLOR,
  resolveShadowRenderQuality,
  SHADOW_BUFFER_FORMAT,
  SHADOW_BUFFER_LAYOUT,
  SHADOW_QUALITY_PROFILES,
  SHADOW_SCENE_USER_DATA,
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
import { ShadowController, SUN_ANGULAR_RADIUS_RAD } from "./shadow-controller";
import { configureReceiverPlaneShadow } from "./shadow-receiver-plane-material";
import type { SunVectorGizmo } from "./shadow-sun-vector";
import { ShadowTiledScene } from "./shadow-tiled-scene";
import { createShadowBootstrapPreview } from "./shadow-bootstrap-preview";
import {
  shadowSceneWorldBasis,
  shadowRegionQueryKey,
  shadowReceiverStageError,
  meshReceiverBiasLimitMeters,
  getPresentedShadowReceiverIds,
  getChangedShadowVolumeBounds,
} from "../core/shadow-corridor-host-state";
import { auditShadowCorridor } from "../core/shadow-corridor-audit";
import { createShadowIdleTerrainPrefetch } from "./shadow-idle-prefetch";
import { disposeShadowDepthPage } from "./shadow-depth-page-cache";
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
  subscribeShadowProjectionDebugDemand,
  type ShadowProjectionDebugSnapshot,
} from "./shadow-projection-debug-store";
import {
  createShadowFrameBudget,
  updateShadowFrameBudget,
} from "./shadow-frame-budget";

const FALLBACK_SHADOW_AREA_METERS = 900;
const MESH_FINAL_SHADOW_BIAS_METERS = 0.01;
const MESH_COARSE_SHADOW_BIAS_LIMIT_METERS = 0.25;
const STREAMED_CONTENT_REFRESH_INTERVAL_MS = 1_000;
// Mesh contact policy is applied again to newly streamed receiver materials.
/** Maximum radius represented by the fitted shadow buffer. */
const MAX_RECEIVER_DISTANCE_METERS = 4_000;
const MIN_VIEWPORT_SHADOW_AREA_METERS = 10;
const DEFAULT_SHADOW_CAMERA_OFFSET_METERS = 2_500;
const SHADOW_SIMULATION_TERRAIN_RUNTIME_ID = "shadow-simulation-raster-dem";
const SHADOW_CONTROLLER_UPDATE_PRIORITY = 200;
const SUN_VECTOR_VIEWPORT_LENGTH_FACTOR = 0.5;
const SHADOW_SIMULATION_SKY_LIGHT_NAME = "shadow-simulation-sky-light";
const LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS = 100;
const MAPLIBRE_STYLE_ANIMATION_UPDATE_INTERVAL_MS = 1_000;
const SHADOW_DEBUG_PUBLISH_INTERVAL_MS = 100;
const SHADOW_MAP_STYLE_BASE_LAYER_ID = "carma-shadow-map-style-base";

type GenericThreeLayer = ReturnType<typeof getGenericThreeLayers>[number];

type ShadowLightBinding = {
  scene: THREE.Scene;
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
  textureColorCorrection?: boolean;
}>;

export type ShadowSimulationScene = {
  updateTerrain: (terrain: ShadowTerrainOptions | undefined) => void;
  updateSolarPosition: (position: SolarPosition) => void;
  updateTerrainColor: (color: string) => void;
  updateMeshErrorTarget: (errorTarget: MeshErrorTargetPixels) => void;
  updateMeshCacheBudget: (bytes?: number) => void;
  updateBuildingAppearance: (appearance: ShadowBuildingAppearance) => void;
  updateShadowQuality: (quality: ShadowQualityMultiplier) => void;
  updateRenderQuality: (options: ShadowRenderQualityOptions) => void;
  updateSoftSunShadows: (enabled: boolean) => void;
  updateTimeAnimating: (animating: boolean) => void;
  refreshProjectionDebug: () => void;
  updateShadowIntensity: (intensity: number) => void;
  updateMapStyleContentVisibility: (visible: boolean) => void;
  updateMapStyleLabelOverlayVisibility: (visible: boolean) => void;
  updateMapStyleElevationVisibility: (lines: boolean, labels: boolean) => void;
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
            "background-color": TERRAIN_MAP_STYLE.baseColor,
            "background-opacity": TERRAIN_MAP_STYLE.opacity,
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
      const property = TERRAIN_MAP_STYLE.opaqueDrapeProperties.get(layer.type);
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

const makeMeshShadeable = (mesh: THREE.Mesh, receiverPlane = false) => {
  if (mesh.userData[SHADOW_SCENE_USER_DATA.OVERLAY]) return;
  mesh.castShadow = mesh.userData.disableShadowCasting !== true;
  const materials = Array.isArray(mesh.material)
    ? mesh.material
    : [mesh.material];
  // Geometry-only offscreen GLTF placeholders deliberately write no colour.
  // Do not promote them to receivers: their unlit/depthless materials would
  // block the entire corridor accumulator despite contributing only occlusion.
  mesh.receiveShadow = materials.some(
    (material) => material.visible && material.colorWrite
  );
  // Closed solids default to casting from both faces, so a sun-facing wall
  // shadows the ground under a solid that does not sit flush on the terrain.
  // Tile runtimes can provide a topology-derived side before they join the
  // shared scene; keep that ground truth instead of replacing it here.
  if (!mesh.userData.isShadowTerrainSurface) {
    for (const material of materials) {
      material.shadowSide ??= THREE.DoubleSide;
      configureReceiverPlaneShadow(material, receiverPlane);
    }
  }
};

const makeSceneMeshesShadeable = (
  scene: THREE.Object3D,
  receiverPlane = false
) => {
  scene.traverseVisible((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh && !(mesh as THREE.InstancedMesh).isInstancedMesh) return;
    makeMeshShadeable(mesh, receiverPlane);
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
      mesh.userData[SHADOW_SCENE_USER_DATA.OVERLAY] ||
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
  const surfaceRanges = runtimes
    .filter((runtime) => runtime.providesTerrain)
    .flatMap((runtime) => {
      const range = runtime.getViewElevationRange?.(camera);
      return range ? [range] : [];
    });
  // Terrain-owning runtimes know their visible cut. Scanning the whole scene
  // also includes retained ancestor/caster meshes with city-wide bounding boxes.
  if (surfaceRanges.length > 0)
    return [
      Math.min(...surfaceRanges.map((range) => range[0])),
      Math.max(...surfaceRanges.map((range) => range[1])),
    ];
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
  scene.add(sunVectorRoot);
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
  binding.controller.invalidate();
  binding.dirty = true;
};

const disposeShadowLightBinding = (binding: ShadowLightBinding) => {
  for (const [ambientLight, intensity] of binding.ambientLightIntensities) {
    ambientLight.intensity = intensity;
  }
  binding.scene.remove(binding.skyLight);
  binding.scene.remove(binding.atmosphericSky.mesh);
  binding.scene.remove(binding.sunVectorRoot);
  binding.sunVector?.dispose();
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
    textureColorCorrection: true,
  };
  let latestShadowIntensity = 1;
  let latestMeshErrorTarget = DEFAULT_MESH_ERROR_TARGET_PIXELS;
  let latestMeshCacheBudget: number | undefined;
  const meshCacheBudgets = new WeakMap<object, number | undefined>();
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
  let invalidateShadowMap: (
    changedBounds?: readonly THREE.Box3[]
  ) => void = () => undefined;
  let refreshTerrainShadowState = (changedBounds?: readonly THREE.Box3[]) =>
    invalidateShadowMap(changedBounds);
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
        onContentChanged: (changedBounds) =>
          refreshTerrainShadowState(changedBounds),
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
  const meshViewReady = () =>
    getSharedThreeSceneRuntimes(map).every(
      (runtime) =>
        !runtime.providesTerrain || (runtime.isMainViewReady?.() ?? true)
    );
  let surfaceProviders = getSharedThreeSceneRuntimes(map).filter(
    (runtime) => runtime.providesTerrain
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
  const idleTerrainPrefetch = createShadowIdleTerrainPrefetch({
    getRequest: () => {
      if (
        disposed ||
        !terrain ||
        !terrainRuntime ||
        !initialTerrainStageReady ||
        isSharedThreeTerrainLoading(map) ||
        mapInMotion ||
        timeAnimating ||
        contentChangeTimer !== 0 ||
        !softSunShadowsEnabled ||
        !nativeAccumulationFits ||
        !latestFrame
      )
        return null;
      const availability = terrainRuntime.getIdlePrefetchAvailability?.();
      // Even a fully warm neighbour ring needs once-per-settled-view cache
      // maintenance/calibration. The idle controller deduplicates this key.
      if (!availability?.ready) return null;
      const runtime = terrainRuntime;
      return {
        key: JSON.stringify([
          terrainRevision,
          shadowStateEpoch,
          shadowVisualEpoch,
          latestFrame.renderCamera.projectionMatrix.elements,
          latestFrame.renderCamera.matrixWorldInverse.elements,
          latestFrame.viewport.x,
          latestFrame.viewport.y,
        ]),
        run: async (signal) => {
          await runtime.prefetchIdleTerrain(signal);
          if (
            signal.aborted ||
            !isTiledBufferEnabled() ||
            !tiledScene ||
            !latestFrame ||
            !sceneLease.layer.runIdleRender
          )
            return;
          // Other streamed meshes currently have no complete offscreen-caster
          // lease contract. Warming terrain remains safe, but caching shadows
          // with missing buildings would poison later views. Fail closed until
          // those providers can prove coverage for the same finite-sun corridor.
          if (
            genericBridges.size > 0 ||
            getCoverageRuntimes().some(
              (candidate) =>
                candidate !== runtime && candidate !== shadowControllerRuntime
            )
          )
            return;
          // Native receiver IDs are not coordinates of the legacy viewport
          // grid. Terrain sibling prefetch above remains valid; do not invent
          // unrelated shadow pages by parsing source IDs as spacing:x:z.
          if (receiverCells.some(({ id }) => !/^\d+:[-\d]+:[-\d]+$/.test(id)))
            return;
          const regions = runtime.getIdleShadowRegions?.() ?? [];
          if (regions.length === 0 || !runtime.prepareIdleShadowRegion) return;
          await tiledScene.prewarm({
            cells: buildShadowReceiverNeighbourRing(receiverCells),
            frame: latestFrame,
            lighting: {
              directionToSun: sharedBinding.directionToSun,
              color: sharedBinding.sunColor,
              intensity: sharedBinding.sunIntensity,
              shadowIntensity: sharedBinding.shadowIntensity,
            },
            targetPixels:
              SHADOW_QUALITY_PROFILES[sharedBinding.shadowQuality]
                .shadowTexelErrorPixels,
            samples: getSunDiscAccumulationRounds(),
            signal,
            prepare: async (page, leaseSignal) => {
              const terrainLevel = nearestIdleTerrainLevel(
                page.receiverBounds,
                regions
              );
              if (terrainLevel === null)
                return {
                  covered: false,
                  group: null,
                  isCurrent: () => false,
                  dispose: () => undefined,
                };
              return runtime.prepareIdleShadowRegion(
                {
                  receiverBounds: page.receiverBounds,
                  casterBounds: page.casterBounds,
                  terrainLevel,
                },
                leaseSignal
              );
            },
          });
          if (!signal.aborted) publishProjectionDebug();
        },
      };
    },
  });
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
    idleTerrainPrefetch.cancel();
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
    // Incident light belongs to the local world, not the viewing camera. A pan
    // must not change its direction/radiance and invalidate every shadow page.
    // The sky still receives the live view camera and observer scene position.
    const observer = {
      longitude: atmosphereReferenceCenter.lng,
      latitude: atmosphereReferenceCenter.lat,
      altitudeMeters: LOCAL_ATMOSPHERE_GROUND_ELEVATION_METERS,
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
  invalidateShadowMap = (changedBounds) => {
    if (disposed) return;
    idleTerrainPrefetch.cancel();
    tiledScene?.invalidateContent(changedBounds);
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
  let renderTileVolumes: readonly SharedThreeSceneTileVolume[] | null = null;
  let renderRegionReadiness: Map<string, boolean> | null = null;
  let renderedTileVolumes: readonly SharedThreeSceneTileVolume[] = [];
  const readActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] =>
    getCoverageRuntimes().flatMap(
      (runtime) => runtime.getActiveTileVolumes?.() ?? []
    );
  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] =>
    renderTileVolumes ?? readActiveTileVolumes();
  const resolveMeshReceiverBiasLimit = (
    bounds?: THREE.Box3,
    groundTexelTargetMeters = MESH_FINAL_SHADOW_BIAS_METERS * 4
  ) => {
    if (!sharedSceneProvidesTerrain()) return undefined;
    const volumes = getActiveTileVolumes();
    const stageError = bounds
      ? shadowReceiverStageError(bounds, volumes, latestMeshErrorTarget)
      : Math.max(
          latestMeshErrorTarget,
          ...volumes
            .filter(({ loadReason }) => loadReason !== "shadow")
            .map(({ errorPixels }) => errorPixels)
            .filter((error): error is number => Number.isFinite(error))
        );
    // Coarse mesh triangles need enough self-intersection tolerance for their
    // achieved depth-map footprint. Keeping the final 1 cm cap at the 16 px
    // bootstrap stage produced triangle-edge acne across whole roofs. The cap
    // follows progressive SSE and converges back to 1 cm at the requested LOD;
    // only the temporary coarse representation may use up to 25 cm.
    return meshReceiverBiasLimitMeters({
      stageErrorPixels: stageError,
      targetErrorPixels: latestMeshErrorTarget,
      groundTexelTargetMeters,
      finalBiasMeters: MESH_FINAL_SHADOW_BIAS_METERS,
      maximumCoarseBiasMeters: MESH_COARSE_SHADOW_BIAS_LIMIT_METERS,
    });
  };
  const withTileVolumeSnapshot = <T>(render: () => T): T => {
    // A synchronous render cannot observe a new asynchronous tile publication.
    // Rebuilding the same volumes per corridor cost 15.6 s across 31,158 calls
    // in a 56 s mesh startup profile. Share only within this call: the next
    // frame still sees all newly committed geometry and changed transforms.
    const previous = renderTileVolumes;
    const previousReadiness = renderRegionReadiness;
    renderTileVolumes = previous ?? readActiveTileVolumes();
    renderRegionReadiness = previousReadiness ?? new Map();
    if (!previous) {
      const changes = getChangedShadowVolumeBounds(
        renderedTileVolumes,
        renderTileVolumes
      );
      if (changes.length > 0) {
        tiledScene?.invalidateContent(changes);
        // Native content events may precede publication by one paint. This
        // coherent active-cut diff includes every published add/remove, so the
        // later batch must not invalidate those same corridors a second time.
        changedContentBoundsPending.length = 0;
      }
      renderedTileVolumes = renderTileVolumes;
    }
    try {
      return render();
    } finally {
      renderTileVolumes = previous;
      renderRegionReadiness = previousReadiness;
    }
  };
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
      // Keep mesh display admission independent from corridor publication
      // while per-tile stages are diagnosed in the scene overlay.
      runtime.setShadowStagePresentationGate?.(false);
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

  let lastDebugPublishMs = Number.NEGATIVE_INFINITY;
  let debugPublishTimer: ReturnType<typeof setTimeout> | null = null;
  let latestProjectionDebugSnapshot: ShadowProjectionDebugSnapshot | null =
    null;
  let publishedProjectionDebugBase: ShadowProjectionDebugSnapshot | null = null;
  let publishedDebugRenderingKey = "";
  let softSunShadowsEnabled = true;
  let renderQuality: ShadowRenderQualityOptions = {};
  let effectiveRenderQuality = resolveShadowRenderQuality(renderQuality);
  let renderCapabilities: ReturnType<
    typeof getShadowRenderCapabilities
  > | null = null;
  const getAccumulationOptions = () => ({
    format: effectiveRenderQuality.shadowBufferFormat,
    // Page ownership is resolved at the native pixel centre. MSAA coverage
    // split across different receiver pages needs its own per-sample ownership
    // buffer; until then only the mono path exposes geometry MSAA (see UI).
    msaaSamples:
      effectiveRenderQuality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED
        ? 0
        : resolveSupportedShadowMsaa(
            effectiveRenderQuality,
            (effectiveRenderQuality.shadowBufferFormat ===
            SHADOW_BUFFER_FORMAT.SDR_8
              ? renderCapabilities?.sdrSamples
              : renderCapabilities?.hdrSamples) ?? [0, 2, 4]
          ),
  });
  let accumulationOptions = getAccumulationOptions();
  let contentChangeTimer = 0;
  let contentRefreshPendingAfterMove = false;
  let fullContentInvalidationPending = false;
  const changedContentBoundsPending: THREE.Box3[] = [];
  let coverageNeedsCameraReevaluation = true;
  let fallbackReceiverWorldPoints: THREE.Vector3[] = [];
  let renderCameraSignature = "";
  let lastMotionShadowUpdateMs = Number.NEGATIVE_INFINITY;
  let shadowFrameBudget = createShadowFrameBudget();
  let maxAccumulationPixels = Number.POSITIVE_INFINITY;
  let nativeAccumulationFits = true;
  let resourceLimits = resolveShadowResourceLimits(4096);
  let latestFrame: SharedThreeSceneFrame | null = null;
  let tiledScene: ShadowTiledScene | null = null;
  let tiledRenderer: THREE.WebGLRenderer | null = null;
  let receiverCells: readonly ShadowReceiverCell[] = [];
  const isTiledBufferEnabled = () =>
    effectiveRenderQuality.shadowBufferLayout === SHADOW_BUFFER_LAYOUT.TILED;
  const releaseTiledScene = () => {
    tiledScene?.dispose();
    tiledScene = null;
    tiledRenderer = null;
    receiverCells = [];
  };
  const publishProjectionDebug = () => {
    if (
      disposed ||
      !latestProjectionDebugSnapshot ||
      !hasShadowProjectionDebugListeners(map)
    )
      return;
    const elapsed = performance.now() - lastDebugPublishMs;
    if (elapsed < SHADOW_DEBUG_PUBLISH_INTERVAL_MS) {
      debugPublishTimer ??= globalThis.setTimeout(() => {
        debugPublishTimer = null;
        publishProjectionDebug();
      }, SHADOW_DEBUG_PUBLISH_INTERVAL_MS - elapsed);
      return;
    }
    if (debugPublishTimer !== null) {
      globalThis.clearTimeout(debugPublishTimer);
      debugPublishTimer = null;
    }
    const bufferLayout = effectiveRenderQuality.shadowBufferLayout;
    const sunDiscSamples = effectiveRenderQuality.shadowSunDiscSamples;
    const tiledStats = isTiledBufferEnabled()
      ? tiledScene?.stats ?? null
      : null;
    const renderingKey = JSON.stringify([
      bufferLayout,
      sunDiscSamples,
      tiledStats,
    ]);
    if (
      publishedProjectionDebugBase === latestProjectionDebugSnapshot &&
      publishedDebugRenderingKey === renderingKey
    )
      return;
    lastDebugPublishMs = performance.now();
    publishedProjectionDebugBase = latestProjectionDebugSnapshot;
    publishedDebugRenderingKey = renderingKey;
    publishShadowProjectionDebugSnapshot(map, {
      ...latestProjectionDebugSnapshot,
      bufferLayout,
      sunDiscSamples,
      tiledStats,
    });
  };
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
      sharedBinding.sunVector?.root.position.copy(sharedBinding.center);
      sharedBinding.sunVector?.root.updateMatrixWorld(true);
    }
    if (requestRepaint) map.triggerRepaint();
  };

  const shadowControllerRuntime: SharedThreeSceneRuntime = {
    id: "shadow-simulation-controller",
    originLngLat: [map.getCenter().lng, map.getCenter().lat],
    root: new THREE.Group(),
    updatePriority: SHADOW_CONTROLLER_UPDATE_PRIORITY,
    update(frame) {
      latestFrame = frame;
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
        mapInMotion,
        {
          enabled: effectiveRenderQuality.shadowAdaptiveQuality,
          allowCadenceReduction: !isTiledBufferEnabled(),
        }
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
      }
      // MapLibre may rebuild render-camera matrices while terrain settles even
      // though its public view did not move. Terrain changes invalidate this
      // coverage separately, so use the stable user-facing view state here.
      const nextRenderCameraSignature = getCoverageViewSignature(frame);
      if (
        coverageNeedsCameraReevaluation ||
        nextRenderCameraSignature !== renderCameraSignature
      ) {
        // Dragging only changes the observer. Corridor geometry, sun direction
        // and tile-owned shadow textures remain valid, so defer every expensive
        // fit/query/update to moveend and let the presentation path reproject
        // the retained pages meanwhile.
        if (mapInMotion) return;
        const nowMs = performance.now();
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
        sharedBinding.sunVector &&
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
      // The loaded receiver surfaces remain authoritative during movement too.
      // Dropping them on drag start shrinks the clipping grid to an estimated
      // elevation envelope and can cut away still-visible terrain.
      const committedVolumes = getActiveTileVolumes();
      const visibleTileVolumePoints = committedVolumes.flatMap(
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
          : fallbackReceiverWorldPoints;
      if (
        sharedBinding.receiverWorldPoints.length === 0 ||
        !latestSolarPosition
      ) {
        setRuntimeShadowView(null);
        latestProjectionDebugSnapshot = null;
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      if (isTiledBufferEnabled()) {
        // A corridor belongs to a committed source tile, not the intersection
        // of the camera with a freshly fitted viewport grid. Plan all retained
        // full boxes before frustum filtering so panning cannot rename pages.
        receiverCells = buildShadowReceiverCells(
          committedVolumes
            .filter(({ loadReason }) => loadReason !== "shadow")
            .map(({ id, minimum, maximum }) => ({
              id,
              bounds: new THREE.Box3(
                new THREE.Vector3(...minimum),
                new THREE.Vector3(...maximum)
              ),
            }))
        );
        const fullPagePoints = getVisibleShadowReceiverCorners(
          receiverCells,
          frame.renderCamera
        );
        // Capture readiness and fetching must refer to the SAME full source
        // page. Clipping discovery to the screen starves edge-page casters.
        // Keep the startup fallback until a committed cut exists: clearing it
        // would release/re-enable the provider barrier every frame (strobing).
        if (fullPagePoints.length > 0) {
          sharedBinding.receiverWorldPoints = [...fullPagePoints];
        }
      }
      const snapshot = sharedBinding.controller.update({
        maxReceiverBiasMeters: resolveMeshReceiverBiasLimit(),
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
        latestProjectionDebugSnapshot = null;
        clearShadowProjectionDebugSnapshot(map);
        return;
      }
      const primary = snapshot.camera;
      const primaryCamera = sharedBinding.controller.lights[0].shadow.camera;
      setRuntimeShadowView({
        camera: primaryCamera,
        casterAngularRadiusRadians: softSunShadowsEnabled
          ? SUN_ANGULAR_RADIUS_RAD
          : 0,
        shadowMapSize: {
          width: primary.shadowMapWidth,
          height: primary.shadowMapHeight,
        },
      });
      // The mono camera remains the conservative caster-fetch envelope in tiled
      // mode; it needs no resident depth target or visible directional light.
      if (isTiledBufferEnabled()) {
        const light = sharedBinding.controller.lights[0];
        if (light.shadow.map) {
          disposeShadowDepthPage(light.shadow.map);
          light.shadow.map = null;
        }
      }
      const publishWanted = hasShadowProjectionDebugListeners(map);
      if (primary && publishWanted) {
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
        latestProjectionDebugSnapshot = {
          bufferLayout: effectiveRenderQuality.shadowBufferLayout,
          sunDiscSamples: effectiveRenderQuality.shadowSunDiscSamples,
          tiledStats: null,
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
        };
        publishProjectionDebug();
      }
    },
    dispose: () => undefined,
  };
  sceneLease.layer.addRuntime(shadowControllerRuntime);

  const getSunDiscAccumulationRounds = () =>
    effectiveRenderQuality.shadowSunDiscSamples;
  const updateTiledScene = () => {
    if (
      !isTiledBufferEnabled() ||
      !latestFrame ||
      sharedBinding.directionToSun.y <= 0
    )
      return null;
    const renderer = sceneLease.layer.getRenderer?.();
    if (!renderer) return null;
    let created = false;
    if (!tiledScene || tiledRenderer !== renderer) {
      const cells = receiverCells;
      releaseTiledScene();
      receiverCells = cells;
      tiledRenderer = renderer;
      tiledScene = new ShadowTiledScene(sharedBinding.scene, renderer, {
        light: sharedBinding.controller.lights[0],
        sky: sharedBinding.atmosphericSky.mesh,
        overlay: sharedBinding.sunVectorRoot,
        maximumMapSize: resourceLimits.maxShadowMapSize,
        isBaseCoverageReady: () =>
          initialTerrainStageReady &&
          getSharedThreeSceneRuntimes(map).every(
            (runtime) =>
              !runtime.providesTerrain || (runtime.isBaseViewReady?.() ?? true)
          ),
        isCorridorReady: (bounds, errorPixels, receiverBounds) => {
          // Hard capture, soft scheduling and presentation inspect the same
          // immutable cut during this synchronous draw. Do not traverse its
          // tree again for each consumer; both true and false expire next draw.
          const key = shadowRegionQueryKey(bounds, errorPixels, receiverBounds);
          const cached = renderRegionReadiness?.get(key);
          if (cached !== undefined) return cached;
          const ready = getCoverageRuntimes().every(
            (runtime) =>
              runtime.isShadowRegionReady?.(
                bounds,
                errorPixels,
                receiverBounds
              ) ??
              (runtime.getRequestDemand
                ? runtime.getRequestDemand() === 0
                : !runtime.providesTerrain || !isSharedThreeTerrainLoading(map))
          );
          renderRegionReadiness?.set(key, ready);
          return ready;
        },
        receiverStageError: (bounds) =>
          shadowReceiverStageError(
            bounds,
            getActiveTileVolumes(),
            latestMeshErrorTarget
          ),
        receiverBiasLimit: (bounds, groundTexelTargetMeters) =>
          resolveMeshReceiverBiasLimit(bounds, groundTexelTargetMeters) ??
          MESH_FINAL_SHADOW_BIAS_METERS,
        onPresentedPages: (presentedPages, visiblePages) => {
          const receiverIds = getPresentedShadowReceiverIds(
            getActiveTileVolumes(),
            visiblePages.map(({ id, receiverBounds: bounds }) => ({
              id,
              bounds,
            })),
            presentedPages.map(({ id, receiverBounds: bounds }) => ({
              id,
              bounds,
            }))
          );
          if (receiverIds.length === 0) return;
          for (const runtime of getCoverageRuntimes()) {
            runtime.acknowledgeShadowStage?.(receiverIds);
          }
        },
        corridorRevision: (bounds, errorPixels, receiverBounds) => {
          const revisions: string[] = [];
          for (const runtime of getCoverageRuntimes()) {
            if (runtime === shadowControllerRuntime) continue;
            const revision = runtime.getShadowRegionRevision?.(
              bounds,
              errorPixels,
              receiverBounds
            );
            // A runtime with no persistent geometry identity cannot certify a
            // cache hit. Live shadows continue normally without persistent I/O.
            if (!revision) return null;
            revisions.push(JSON.stringify([runtime.id, revision]));
          }
          return revisions.length ? JSON.stringify(revisions.sort()) : null;
        },
        dateTimeKey: () => latestSolarPosition?.instant.toISOString() ?? null,
        worldBasis: () => {
          const origin = sceneLease.layer.projectSceneToLngLat([0, 0, 0]);
          if (!origin)
            throw new Error("Shared scene origin is not initialized");
          const mercator = MercatorCoordinate.fromLngLat(origin, 0);
          return shadowSceneWorldBasis(
            mercator.x,
            mercator.y,
            mercator.meterInMercatorCoordinateUnits()
          );
        },
        requestRepaint: () => map.triggerRepaint(),
        visualEpoch: () => shadowVisualEpoch,
        auditCorridors: (pages) => {
          // Debug-only: take one coherent geometry snapshot for all queries.
          // Do not rebuild every provider's volume list for every page.
          const volumes = getActiveTileVolumes();
          const runtimes = getCoverageRuntimes();
          return pages.map(({ id, casterBounds, receiverBounds }) =>
            auditShadowCorridor({
              id,
              casterBounds,
              sunElevationDegrees: latestSolarPosition?.elevationDegrees ?? 0,
              volumes,
              regions: runtimes.flatMap((runtime) => {
                const result = runtime.getShadowRegionDiagnostics?.(
                  casterBounds,
                  undefined,
                  receiverBounds
                );
                return result ? [result] : [];
              }),
            })
          );
        },
        runIdleRender: (render) =>
          sceneLease.layer.runIdleRender?.(render) ?? false,
      });
      created = true;
    }
    if (!mapInMotion || created) {
      tiledScene.update(
        receiverCells,
        latestFrame,
        {
          maxReceiverBiasMeters: sharedSceneProvidesTerrain()
            ? MESH_FINAL_SHADOW_BIAS_METERS
            : undefined,
          directionToSun: sharedBinding.directionToSun,
          color: sharedBinding.sunColor,
          intensity: sharedBinding.sunIntensity,
          shadowIntensity: sharedBinding.shadowIntensity,
        },
        // Scale depth demand, never the native-pixel map/style colour pass.
        SHADOW_QUALITY_PROFILES[sharedBinding.shadowQuality]
          .shadowTexelErrorPixels
      );
    } else {
      // Receiver pages and their finite-sun captures are world anchored. A
      // camera drag changes only their framebuffer scissor; reproject that
      // presentation without changing corridor or cache identity.
      tiledScene.updatePresentation(latestFrame);
    }
    return tiledScene;
  };
  const bootstrapPreview = createShadowBootstrapPreview();
  const useBootstrapPreview = () =>
    isTiledBufferEnabled() && bootstrapPreview(getCoverageRuntimes());
  const accumulationController = {
    // Mono and tiled soft-sun paths share this post-composition hook. Point
    // lighting has no convergence event and deliberately schedules no prefetch.
    onSettled: idleTerrainPrefetch.onSettled,
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
      (!initialTerrainStageReady ||
        useBootstrapPreview() ||
        (!isTiledBufferEnabled() && !meshViewReady()) ||
        (!isTiledBufferEnabled() && isSharedThreeTerrainLoading(map)) ||
        mapInMotion ||
        (!isTiledBufferEnabled() && contentChangeTimer !== 0)),
    active: () =>
      nativeAccumulationFits &&
      softSunShadowsEnabled &&
      initialTerrainStageReady &&
      !useBootstrapPreview() &&
      (isTiledBufferEnabled() || meshViewReady()) &&
      (isTiledBufferEnabled() || !isSharedThreeTerrainLoading(map)) &&
      !mapInMotion &&
      !timeAnimating &&
      (isTiledBufferEnabled() || contentChangeTimer === 0) &&
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
      if (isTiledBufferEnabled()) return;
      sharedBinding.controller.applySunDiscSample(
        round,
        getSunDiscAccumulationRounds()
      );
    },
    finishRound: () => sharedBinding.controller.restoreSunDiscCenter(),
    get renderProgressive() {
      if (!isTiledBufferEnabled()) return undefined;
      return (
        camera: THREE.Camera,
        frame: Readonly<{
          width: number;
          height: number;
          viewKey: string;
          styleEpoch: number;
          active: boolean;
        }>
      ) =>
        withTileVolumeSnapshot(() => {
          if (!softSunShadowsEnabled || !nativeAccumulationFits) return null;
          if (useBootstrapPreview()) return null;
          const tiles = updateTiledScene();
          if (!tiles) return null;
          const result = tiles.renderProgressive(camera, {
            ...frame,
            samples: getSunDiscAccumulationRounds(),
            maxRenderTargetPixels: maxAccumulationPixels,
            options: accumulationOptions,
          });
          publishProjectionDebug();
          return result;
        });
    },
    renderScene: (camera: THREE.Camera, round: number | null) =>
      withTileVolumeSnapshot(() => {
        // A common centre-sun pass includes every currently loaded caster;
        // unlike page-by-page replay it leaves time for the remaining loads.
        if (useBootstrapPreview()) return false;
        const tiles = updateTiledScene();
        if (!tiles) return false;
        const rendered = tiles.render(
          camera,
          round,
          getSunDiscAccumulationRounds(),
          !mapInMotion
        );
        // A trailing publication includes the final page counters even when
        // convergence stops repaints before the next debug interval.
        publishProjectionDebug();
        return rendered;
      }),
  };
  sceneLease.layer.setAccumulationController?.(accumulationController);
  const refreshSharedShadowCoverage = () => {
    cachedElevationRange = null;
    coverageNeedsCameraReevaluation = true;
    updateSharedShadowCoverage();
  };
  refreshTerrainShadowState = (changedBounds) => {
    invalidateShadowMap(changedBounds);
    refreshSharedShadowCoverage();
  };

  const handleMoveStart = () => {
    idleTerrainPrefetch.cancel();
    tiledScene?.pausePending();
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    mapInMotion = true;
    coverageNeedsCameraReevaluation = true;
  };
  const handleMove = () => {
    idleTerrainPrefetch.cancel();
    coverageNeedsCameraReevaluation = true;
  };
  const handleMoveEnd = () => {
    mapInMotion = false;
    shadowFrameBudget = updateShadowFrameBudget(
      shadowFrameBudget,
      performance.now(),
      false
    );
    if (contentRefreshPendingAfterMove) {
      contentRefreshPendingAfterMove = false;
      handleSharedSceneContentChanged();
    } else {
      refreshSharedShadowCoverage();
    }
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
    const nextProviders = getSharedThreeSceneRuntimes(map).filter(
      (runtime) => runtime.providesTerrain
    );
    if (
      nextProviders.length !== surfaceProviders.length ||
      nextProviders.some((runtime) => !surfaceProviders.includes(runtime))
    ) {
      surfaceProviders = nextProviders;
      // Decision: MESH-FIRST-20260908 in three/TILED_SHADOW_PAGES.md.
      // Release the previous surface's buffers once, never on tile arrivals.
      releaseTiledScene();
      sceneLease.layer.setAccumulationController?.(null);
      sceneLease.layer.setAccumulationController?.(accumulationController);
      for (const light of sharedBinding.controller.lights) {
        if (!light.shadow.map) continue;
        disposeShadowDepthPage(light.shadow.map);
        light.shadow.map = null;
      }
      invalidateShadowPresentation();
    }
    const meshProvidesTerrain = sharedSceneProvidesTerrain();
    if (!terrain) return;
    if (meshProvidesTerrain) {
      idleTerrainPrefetch.cancel();
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
    idleTerrainPrefetch.cancel();
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
    makeSceneMeshesShadeable(
      sceneLease.layer.getScene(),
      sharedSceneProvidesTerrain()
    );
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
    if (contentChangeTimer) {
      window.clearTimeout(contentChangeTimer);
      contentChangeTimer = 0;
    }
    if (fullContentInvalidationPending) tiledScene?.invalidateContent();
    else if (changedContentBoundsPending.length > 0) {
      tiledScene?.invalidateContent(changedContentBoundsPending);
    }
    fullContentInvalidationPending = false;
    changedContentBoundsPending.length = 0;
    idleTerrainPrefetch.cancel();
    syncTerrainRuntime();
    releaseMapLibreTerrain.refresh();
    for (const runtime of getSharedThreeSceneRuntimes(map)) {
      if (runtime.providesTerrain) {
        runtime.setErrorTarget?.(latestMeshErrorTarget);
        if (
          !meshCacheBudgets.has(runtime) ||
          meshCacheBudgets.get(runtime) !== latestMeshCacheBudget
        ) {
          runtime.setCacheBudget?.(latestMeshCacheBudget);
          meshCacheBudgets.set(runtime, latestMeshCacheBudget);
        }
      }
      runtime.setShadowSimulationStyle?.(latestBuildingAppearance);
    }
    // New terrain providers receive the current shadow-selection envelope,
    // while existing ones keep their stationary-view signature. Refitting the
    // light to freshly streamed terrain must not restart terrain traversal.
    applyRuntimeShadowView(appliedRuntimeShadowView);
    // Native tile runtimes configure only the arriving model subtree. A full
    // scene traversal is reserved for generic Three layers that do not expose
    // that lifecycle hook.
    if (genericBridges.size > 0) {
      makeSceneMeshesShadeable(
        sceneLease.layer.getScene(),
        sharedSceneProvidesTerrain()
      );
    }
    sharedBinding.controller.invalidate();
    sharedBinding.dirty = true;
    coverageNeedsCameraReevaluation = true;
    // A tile arrival changes geometry, not the sun. Fit once with the next
    // render camera, using the runtime's cached model bounds. Calling the
    // generic refresh here also walked the whole scene and reevaluated the
    // atmosphere before doing the same camera fit in the next render.
    cachedElevationRange = null;
    map.triggerRepaint();
  };
  const scheduleSharedSceneContentChanged = (
    change?: Readonly<{
      bounds?: readonly THREE.Box3[];
      roots?: readonly THREE.Object3D[];
    }>
  ) => {
    if (disposed) return;
    const changedBounds = change?.bounds;
    // Native runtimes already know the exact published GLTF subtree. Apply
    // receiver-plane PCF there synchronously so its first shaded frame does not
    // use the acne-prone stock comparison. This replaces the old full-scene
    // traversal without making correctness depend on the later batch refresh.
    for (const root of change?.roots ?? []) {
      makeSceneMeshesShadeable(root, sharedSceneProvidesTerrain());
    }
    if (changedBounds === undefined) {
      fullContentInvalidationPending = true;
    } else if (changedBounds.length > 0) {
      // A native tile publication carries exact world bounds. Invalidate only
      // pages whose caster corridor intersects that delta; unrelated finished
      // hard and sun-disc captures remain reusable.
      changedContentBoundsPending.push(
        ...changedBounds.map((bounds) => bounds.clone())
      );
    }
    idleTerrainPrefetch.cancel();
    // Native runtimes publish stable tile-volume IDs. Diff that committed cut
    // at render entry; parsing another offscreen tile must not restart EVERY
    // corridor. Unknown generic geometry still requires a conservative reset.
    if (
      changedBounds === undefined &&
      getCoverageRuntimes().some(
        (runtime) =>
          runtime !== shadowControllerRuntime && !runtime.getActiveTileVolumes
      )
    )
      fullContentInvalidationPending = true;
    if (mapInMotion) {
      // Loading continues, but camera input never pays for repeated global
      // shadow invalidation. One consolidated refresh runs at moveend.
      contentRefreshPendingAfterMove = true;
      map.triggerRepaint();
      return;
    }
    map.triggerRepaint();
    // Fixed-cadence batching, not a trailing debounce: a continuous tile
    // stream still publishes progress once per second, but cannot refit the
    // whole viewport shadow envelope once per model completion. Exact changed
    // bounds above invalidate only the intersecting tiled corridors.
    if (contentChangeTimer) return;
    contentChangeTimer = window.setTimeout(() => {
      contentChangeTimer = 0;
      handleSharedSceneContentChanged();
    }, STREAMED_CONTENT_REFRESH_INTERVAL_MS);
  };
  const unsubscribeSharedSceneContent = subscribeSharedThreeSceneContent(
    map,
    scheduleSharedSceneContentChanged
  );
  // Coverage and interaction take priority over finite-disc refinement. Wake
  // the renderer when loading finishes even if the last tile was already cached.
  const unsubscribeTerrainLoading = subscribeSharedThreeTerrainLoading(
    map,
    () => {
      if (isSharedThreeTerrainLoading(map)) idleTerrainPrefetch.cancel();
      if (!disposed) map.triggerRepaint();
    }
  );
  handleSharedSceneContentChanged();

  const applyMapLibreLight = (position: SolarPosition) => {
    const sample =
      latestAtmosphericSunlight ?? evaluateAtmosphericSunlightForMap(position);
    if (sample) applyMapLibreLightSample(sample);
  };

  const updateSolarPosition = (position: SolarPosition) => {
    if (latestSolarPosition?.instant.getTime() === position.instant.getTime()) {
      return;
    }
    tiledScene?.cancelPending(true);
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

  const refreshProjectionDebug = () => {
    lastDebugPublishMs = Number.NEGATIVE_INFINITY;
    sharedBinding.dirty = true;
    map.triggerRepaint();
  };
  const unsubscribeDebugDemand = subscribeShadowProjectionDebugDemand(
    map,
    (active) => {
      if (active) {
        // React.lazy may finish after the scene has already settled. Capture
        // only once the panel actually subscribes, without a camera move.
        refreshProjectionDebug();
      } else {
        if (debugPublishTimer !== null)
          globalThis.clearTimeout(debugPublishTimer);
        debugPublishTimer = null;
        latestProjectionDebugSnapshot = null;
        publishedProjectionDebugBase = null;
        publishedDebugRenderingKey = "";
      }
    }
  );

  return {
    updateSolarPosition,
    updateMeshCacheBudget(bytes) {
      const next =
        bytes !== undefined && Number.isFinite(bytes) && bytes > 0
          ? bytes
          : undefined;
      if (latestMeshCacheBudget === next) return;
      latestMeshCacheBudget = next;
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        if (!runtime.providesTerrain) continue;
        runtime.setCacheBudget?.(next);
        meshCacheBudgets.set(runtime, next);
      }
      map.triggerRepaint();
    },
    updateTerrain(nextTerrain) {
      if (terrain === nextTerrain) return;
      idleTerrainPrefetch.cancel();
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
          (appearance.textureSaturation ?? 1) &&
        (latestBuildingAppearance.textureColorCorrection ?? false) ===
          (appearance.textureColorCorrection ?? false)
      ) {
        return;
      }
      invalidateShadowPresentation();
      tiledScene?.invalidateContent();
      latestBuildingAppearance = appearance;
      for (const bridge of genericBridges.values()) {
        bridge.updateBuildingAppearance(appearance);
      }
      for (const runtime of getSharedThreeSceneRuntimes(map)) {
        runtime.setShadowSimulationStyle?.(appearance);
      }
      makeSceneMeshesShadeable(
        sceneLease.layer.getScene(),
        sharedSceneProvidesTerrain()
      );
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
      const adaptationChanged =
        previous.shadowAdaptiveQuality !== next.shadowAdaptiveQuality;
      if (
        adaptationChanged ||
        previous.shadowBufferLayout !== next.shadowBufferLayout
      ) {
        shadowFrameBudget = createShadowFrameBudget(
          sharedBinding.shadowQuality
        );
      }
      if (
        !adaptationChanged &&
        previous.shadowBufferLayout === next.shadowBufferLayout &&
        previous.shadowBufferFormat === next.shadowBufferFormat &&
        previous.shadowSunDiscSamples === next.shadowSunDiscSamples &&
        previous.shadowMsaaSamples === next.shadowMsaaSamples &&
        previous.shadowGroundTexelFit === next.shadowGroundTexelFit
      ) {
        return;
      }
      accumulationOptions = getAccumulationOptions();
      invalidateShadowPresentation();
      if (previous.shadowBufferLayout !== next.shadowBufferLayout) {
        releaseTiledScene();
        coverageNeedsCameraReevaluation = true;
      }
      if (
        adaptationChanged ||
        previous.shadowGroundTexelFit !== next.shadowGroundTexelFit ||
        previous.shadowBufferLayout !== next.shadowBufferLayout
      ) {
        sharedBinding.dirty = true;
        sharedBinding.controller.invalidate();
      }
      publishProjectionDebug();
      map.triggerRepaint();
    },
    updateSoftSunShadows(enabled) {
      if (softSunShadowsEnabled === enabled) return;
      invalidateShadowPresentation();
      softSunShadowsEnabled = enabled;
      releaseTiledScene();
      sharedBinding.controller.setSoftSun(enabled);
      sharedBinding.controller.invalidate();
      sharedBinding.dirty = true;
      map.triggerRepaint();
    },
    updateTimeAnimating(animating) {
      if (timeAnimating === animating) return;
      idleTerrainPrefetch.cancel();
      timeAnimating = animating;
      if (!animating) {
        flushMapLibreLightSample();
        sharedBinding.dirty = true;
      }
      map.triggerRepaint();
    },
    refreshProjectionDebug,
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
    updateMapStyleElevationVisibility(lines, labels) {
      sceneLease.setMapStyleElevationVisibility(lines, labels);
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
      sharedBinding.sunVectorRoot.visible = visible && !!latestSolarPosition;
      if (!visible) {
        if (sharedBinding.sunVector) {
          sharedBinding.sunVectorRoot.remove(sharedBinding.sunVector.root);
          sharedBinding.sunVector.dispose();
          sharedBinding.sunVector = null;
        }
      } else {
        void import("./shadow-sun-vector")
          .then(({ buildSunVector }) => {
            // Closing the panel or disposing the scene while the chunk loads
            // must not resurrect debug geometry or allocate GPU resources.
            if (
              disposed ||
              !sharedBinding.sunVectorVisible ||
              sharedBinding.sunVector
            )
              return;
            const vector = buildSunVector();
            sharedBinding.sunVector = vector;
            sharedBinding.sunVectorRoot.add(vector.root);
            vector.update(
              sharedBinding.center,
              sharedBinding.directionToSun,
              sharedBinding.sunVectorLengthMeters
            );
            vector.root.visible = true;
            sharedBinding.sunVectorRoot.visible = !!latestSolarPosition;
            map.triggerRepaint();
          })
          .catch((error: unknown) => {
            if (!disposed)
              console.error("Unable to load sun-vector diagnostics", error);
          });
      }
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
      idleTerrainPrefetch.dispose();
      unsubscribeDebugDemand();
      releaseTiledScene();
      if (debugPublishTimer !== null) {
        globalThis.clearTimeout(debugPublishTimer);
        debugPublishTimer = null;
      }
      latestProjectionDebugSnapshot = null;
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
      unsubscribeTerrainLoading();
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

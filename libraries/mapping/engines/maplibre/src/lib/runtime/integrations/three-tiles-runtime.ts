import { TilesRenderer } from "3d-tiles-renderer";
import {
  DownloadPriorityQueue,
  LRUCache,
  PriorityQueue,
  type Tile,
} from "3d-tiles-renderer/core";
import * as TilesRendererCore from "3d-tiles-renderer/core";
import {
  GLTFExtensionsPlugin,
  ImplicitTilingPlugin,
  ReorientationPlugin,
  UpdateOnChangePlugin,
} from "3d-tiles-renderer/plugins";
import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import * as THREE from "three";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

import { clamp } from "@carma-commons/math";
import { GLTFPrimitiveOutlineExtension } from "@carma-mapping/engines/threejs";
import { degToRadNumeric } from "@carma-units";
import { Gltf1UpgradePlugin } from "./gltf1-upgrade-plugin";
import { createPayloadAwareRequestConcurrency } from "./payload-aware-request-concurrency";
import {
  DEFERRED_TILE_LOADING_STATE,
  TILES_LOAD_POLICY,
  createEffectiveErrorTargetState,
  createTileBytesPredictor,
  deriveTilePriority,
  nextEffectiveErrorTarget,
  resolveRequestConcurrency,
  resolveTilesCacheBounds,
  resolveTilesCacheCeiling,
  shouldDeferTile,
} from "./three-tiles-load-policy";
import type {
  EffectiveErrorTargetState,
  TilesDeviceProfile,
} from "./three-tiles-load-policy";
import {
  createTilesCameraSet,
  resolveTilesViewCamera,
} from "./tiles-camera-set";
import type { TilesCameraSet } from "./tiles-camera-set";
import {
  createThreeTilesRetryController,
  type RetryableTilesRenderer,
} from "./three-tiles-retry-controller";
import { createThreeTilesDebugOverlay } from "./three-tiles-debug-overlay";
import {
  applyShadowReceiverMask,
  createShadowReceiverMask,
  maximumSweepDistanceWithinBox,
  type ShadowReceiverMatch,
  type ShadowReceiverMask,
  type ShadowReceiverSource,
} from "./three-tiles-shadow-receiver-mask";
import {
  isSharedThreeTerrainLoading,
  subscribeSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowStyle,
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
} from "./shared-three-scene-layer";
import { getSharedThreeShadowViewSignature } from "./shared-three-scene-layer";

// Match the direct screen-space-error control used by the official
// 3DTilesRendererJS kitchen-sink demo. Lower values request more detail.
export const TILES_ERROR_TARGET_MIN_PIXELS = 0;
export const TILES_ERROR_TARGET_MAX_PIXELS = 50;
export const TILES_ERROR_TARGET_DEFAULT_PIXELS = 4;

const VIEW_QUALITY_AUDIT_PASSES = 2;
const SHADOW_SELECTION_ERROR_FACTOR = 1.25;
const DEFAULT_CACHE_MIN_ITEMS = 6_000;
const DEFAULT_CACHE_MAX_ITEMS = 8_000;
export const THREE_TILES_DEFAULT_REQUEST_CONCURRENCY = 64;
/** Frames are requested at this interval until the root tileset arrived. */
const KICKSTART_INTERVAL_MS = 400;
/** A hidden tab keeps its used tiles this long before the cache is wiped. */
export const HIDDEN_TAB_WIPE_DELAY_MS = 30_000;
// tile.internal.loadingState values (3d-tiles-renderer core constants.js; the
// core typings do not export them).
const UNLOADED_LOADING_STATE = 0;
const FAILED_LOADING_STATE = -1;
const CLAY_COLOR = 0xd6d2ca;
const TILE_OUTLINE_FLAG = "isTileOutline";
const tilesRendererCoreRuntime = TilesRendererCore as unknown as {
  DEFAULT_LRU_CACHE: {
    unloadPriorityCallback: (first: unknown, second: unknown) => number;
  };
  unifiedPriorityCallback: (first: unknown, second: unknown) => number;
};
const tilesCacheUnloadPriorityCallback =
  tilesRendererCoreRuntime.DEFAULT_LRU_CACHE.unloadPriorityCallback;
const tilesQueuePriorityCallback =
  tilesRendererCoreRuntime.unifiedPriorityCallback;
// Mirrors upstream DEFAULT_NODE_QUEUE.priorityCallback (not exported from the
// bundled build): children are processed in the load order of their parents.
const tilesNodeQueuePriorityCallback = (first: Tile, second: Tile): number => {
  const firstParent = first.parent;
  const secondParent = second.parent;
  if (firstParent === secondParent) return 0;
  if (!firstParent) return 1;
  if (!secondParent) return -1;
  return tilesQueuePriorityCallback(firstParent, secondParent);
};

type RuntimePriorityQueue = PriorityQueue & {
  items: Tile[];
  currJobs: number;
};

type TileViewErrorTarget = {
  inView: boolean;
  error: number;
  distanceFromCamera: number;
};

type RuntimeTile = Tile & {
  priority?: number;
  shadowLightFacing?: number;
  shadowReceiverCenterness?: number;
  shadowReceiverCurrent?: boolean;
  traversal: Tile["traversal"] & { unconditionallyRefine?: boolean };
  engineData?: {
    boundingVolume?: {
      getAABB: (target: THREE.Box3) => void;
      getSphere: (target: THREE.Sphere) => void;
      intersectsFrustum: (frustum: THREE.Frustum) => boolean;
    };
  };
};

const frustumCornerPlanes = [
  [0, 3, 4],
  [1, 3, 4],
  [0, 2, 4],
  [1, 2, 4],
  [0, 3, 5],
  [1, 3, 5],
  [0, 2, 5],
  [1, 2, 5],
] as const;
const frustumCornerMatrix = new THREE.Matrix3();

/**
 * Frustum with its eight corner points, which upstream's oriented bounding
 * box test needs (mirrors the unexported `ExtendedFrustum` of the renderer).
 */
class TilesViewFrustum extends THREE.Frustum {
  readonly points = Array.from({ length: 8 }, () => new THREE.Vector3());

  override setFromProjectionMatrix(
    matrix: THREE.Matrix4,
    coordinateSystem?: THREE.CoordinateSystem,
    reversedDepth?: boolean
  ): this {
    super.setFromProjectionMatrix(matrix, coordinateSystem, reversedDepth);
    const { planes, points } = this;
    frustumCornerPlanes.forEach(([first, second, third], index) => {
      const a = planes[first];
      const b = planes[second];
      const c = planes[third];
      frustumCornerMatrix.set(
        a.normal.x,
        a.normal.y,
        a.normal.z,
        b.normal.x,
        b.normal.y,
        b.normal.z,
        c.normal.x,
        c.normal.y,
        c.normal.z
      );
      points[index]
        .set(-a.constant, -b.constant, -c.constant)
        .applyMatrix3(frustumCornerMatrix.invert());
    });
    return this;
  }
}

type RuntimeTilesRenderer = TilesRenderer & {
  calculateBytesUsed: (
    tile: Tile,
    scene: THREE.Object3D | null
  ) => number | null;
  calculateTileViewErrorWithPlugin: (
    tile: Tile,
    target: TileViewErrorTarget
  ) => void;
  loadingTiles: Set<Tile>;
  usedSet: Set<Tile>;
  /** Incremented by every traversal that actually ran. */
  frameCount: number;
  stats: {
    failed: number;
    queued: number;
    downloading: number;
    parsing: number;
  };
  queueTileForDownload: (tile: Tile) => void;
};

type RuntimeLruCache = TilesRenderer["lruCache"] & {
  itemSet: Map<Tile, number>;
  itemList: Tile[];
  usedSet: Set<Tile>;
  cachedBytes: number;
};

const readTilesDeviceProfile = (): TilesDeviceProfile => {
  if (typeof navigator === "undefined") {
    return { userAgent: "", platform: "", maxTouchPoints: 0 };
  }
  const deviceMemory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  return {
    deviceMemoryGiB:
      typeof deviceMemory === "number" ? deviceMemory : undefined,
    userAgent: navigator.userAgent ?? "",
    platform: navigator.platform ?? "",
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
  };
};

const resolveTileContentUrl = (tile: Tile): string | null => {
  const uri = tile.content?.uri;
  if (!uri) return null;
  try {
    return new URL(uri, `${tile.internal.basePath}/`).toString();
  } catch {
    return uri;
  }
};

/**
 * Upstream computes `unconditionallyRefine` after the view error of a tile, so
 * derive the current-frame value for the deferral decision the same way.
 */
const isUnconditionallyRefined = (tile: Tile): boolean => {
  if (tile.internal.hasUnrenderableContent) return true;
  let ancestor = tile.parent as RuntimeTile | null;
  while (ancestor && ancestor.traversal?.unconditionallyRefine) {
    ancestor = ancestor.parent as RuntimeTile | null;
  }
  return ancestor !== null && ancestor.geometricError <= tile.geometricError;
};

const readMapView = (
  map: MaplibreMap | null
): { zoom: number; pitch: number } =>
  map && typeof map.getZoom === "function" && typeof map.getPitch === "function"
    ? { zoom: map.getZoom(), pitch: map.getPitch() }
    : { zoom: 0, pitch: 0 };

const buildPrimitiveOutlinePlugin = (
  parser: unknown,
  options: {
    color: THREE.ColorRepresentation;
    opacity: number;
  }
) => ({
  name: "CARMA_lazy_primitive_outline",
  async afterRoot(result: { scene: THREE.Object3D }) {
    await new GLTFPrimitiveOutlineExtension(
      parser as ConstructorParameters<typeof GLTFPrimitiveOutlineExtension>[0],
      options
    ).afterRoot(result);
  },
});

/** Cesium 3D Tiles runtime for the shared local MapLibre Three.js scene. */

export type ImageProjector =
  | {
      kind: "pano";
      position: THREE.Vector3;
      headingRad: number;
      texture: THREE.Texture;
      opacity: number;
    }
  | {
      kind: "frustum";
      viewProj: THREE.Matrix4;
      texture: THREE.Texture;
      opacity: number;
    };

export interface ThreeTilesRuntime extends SharedThreeSceneRuntime {
  setVisible: (visible: boolean) => void;
  setHeightOffset: (offsetMeters: number) => void;
  setErrorTarget: (errorTarget: number) => void;
  /** Override textures with physically lit clay shading (reversible). */
  setWhiteShading: (white: boolean) => void;
  setClayMaterial: (options: ClayMaterialOptions) => void;
  setClayColor: (color: string) => void;
  setOpacity: (opacity: number) => void;
  setWireframe: (enabled: boolean) => void;
  setOutlineVisible: (visible: boolean) => void;
  /** Restyle loaded outlines and the ones parsed from now on. */
  setOutlineStyle: (style: OutlineStyleOptions) => void;
  setTileBoundsVisible: (enabled: boolean) => void;
  /**
   * Style cache limits; they can only lower the device ceiling. No budget
   * restores the device ceiling.
   */
  setCacheBudget: (bytes?: number, options?: CacheBudgetOptions) => void;
  setRequestConcurrency: (jobs: number) => void;
  getRequestDemand: () => number;
  getViewElevationRange: (
    camera: THREE.Camera
  ) => readonly [minimum: number, maximum: number] | null;
  setProjector: (projector: ImageProjector | null) => void;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  originMerc: MercatorCoordinate;
  mScale: number;
}

export interface ClayMaterialOptions {
  color?: string;
  roughness?: number;
  metalness?: number;
}

export interface OutlineStyleOptions {
  color?: THREE.ColorRepresentation;
  opacity?: number;
}

export interface CacheBudgetOptions {
  /** Bytes the style allows beyond its budget before downloads pause. */
  overflowBytes?: number;
}

export interface ThreeTilesRuntimeOptions {
  cacheBudgetBytes?: number;
  /** Bytes allowed beyond the eviction budget before downloads pause. */
  cacheOverflowBytes?: number;
  requestConcurrency?: number;
  onRequestStateChange?: () => void;
  onContentChanged?: () => void;
  outline?: boolean;
  outlineColor?: THREE.ColorRepresentation;
  outlineOpacity?: number;
  /** The tileset includes the ground surface represented by terrain. */
  providesTerrain?: boolean;
  /** Restyle this tileset like a building layer while shadow mode is active. */
  shadowBuildingStyle?: boolean;
}

export function buildThreeTilesRuntime(
  layerId: string,
  tilesetUrl: string,
  originLngLat: [number, number],
  options: ThreeTilesRuntimeOptions = {}
): ThreeTilesRuntime {
  const originMerc = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const mScale = originMerc.meterInMercatorCoordinateUnits();

  let map: MaplibreMap | null = null;
  let tiles: RuntimeTilesRenderer | null = null;
  let dracoLoader: DRACOLoader | null = null;
  let tileDebugOverlay: ReturnType<typeof createThreeTilesDebugOverlay> | null =
    null;
  let cameraSet: TilesCameraSet | null = null;
  let kickstartTimer = 0;
  let requestBackoffTimer = 0;
  let hiddenWipeTimer = 0;
  let disposed = false;
  let lastTraversalFrameCount = -1;
  let unsubscribeTerrainLoading: (() => void) | null = null;
  let requestedErrorTarget = TILES_ERROR_TARGET_DEFAULT_PIXELS;
  let effectiveErrorTarget = requestedErrorTarget;
  let errorTargetState: EffectiveErrorTargetState =
    createEffectiveErrorTargetState(requestedErrorTarget, Date.now());
  let errorTargetTimer = 0;
  let lastProgressAt = 0;
  let usedBytesMain = 0;
  let lastMainViewConverged = false;
  const deviceProfile = readTilesDeviceProfile();
  let styleCacheBudgetBytes = options.cacheBudgetBytes;
  let styleCacheOverflowBytes = options.cacheOverflowBytes;
  let ceilingBytes = resolveTilesCacheCeiling(deviceProfile, {
    cacheBudgetBytes: styleCacheBudgetBytes,
    cacheOverflowBytes: styleCacheOverflowBytes,
  });
  const bytesPredictor = createTileBytesPredictor();
  /** Displayable siblings outside the view and its prefetch margin (D1). */
  const deferred = new Set<Tile>();
  let requestConcurrency = Math.max(
    0,
    Math.floor(
      options.requestConcurrency ?? THREE_TILES_DEFAULT_REQUEST_CONCURRENCY
    )
  );
  const payloadAwareConcurrency = createPayloadAwareRequestConcurrency();
  // ReorientationPlugin produces X west / Z north. The MapLibre custom-layer
  // matrix below and the other pointcloud layers use X east / Z south, so keep
  // the plugin-owned group untouched and correct the horizontal axes in a
  // persistent parent (the plugin updates tiles.group asynchronously).
  const orientationGroup = new THREE.Group();
  orientationGroup.rotation.y = Math.PI;
  const offsetGroup = new THREE.Group();
  orientationGroup.add(offsetGroup);
  let whiteShading = false;
  let clayColor = new THREE.Color(CLAY_COLOR);
  let clayRoughness = 0.92;
  let clayMetalness = 0;
  let opacity = 1;
  let wireframe = false;
  let outlineVisible = options.outline ?? true;
  let outlineColor: THREE.ColorRepresentation =
    options.outlineColor ?? 0x000000;
  let outlineOpacity = clamp(options.outlineOpacity ?? 1, 0, 1);
  let shadowSimulationStyle: SharedThreeSceneShadowStyle | null = null;
  const shadowStylesEqual = (
    first: SharedThreeSceneShadowStyle | null,
    second: SharedThreeSceneShadowStyle | null
  ) =>
    first === second ||
    (first !== null &&
      second !== null &&
      first.fullOpacity === second.fullOpacity &&
      first.uniformColor === second.uniformColor &&
      first.uniformColorMix === second.uniformColorMix &&
      first.textureSaturation === second.textureSaturation);
  let shadowView: SharedThreeSceneShadowView | null = null;
  let shadowViewSignature = "";
  let shadowSelectionEnabled = false;
  let shadowSelectionNeedsTraversal = false;
  let shadowSelectionRefreshPending = false;
  let shadowReceiverMask: ShadowReceiverMask | null = null;
  let previousShadowReceiverMask: ShadowReceiverMask | null = null;
  let shadowReceiverMaskConverged = false;
  let shadowReceiverSourceSignature = "";
  const mainViewSourceTiles = new Set<Tile>();
  let viewRefinementPending = false;
  let viewQualityAuditPasses = 0;
  const shadowClayColor = new THREE.Color(CLAY_COLOR);
  let tileBoundsVisible = false;
  const tileDebugIds = new WeakMap<Tile, number>();
  let nextTileDebugId = 1;
  let runtimeVisible = true;
  let activeProjector: ImageProjector | null = null;
  const placementMatrix = new THREE.Matrix4();
  const inversePlacementMatrix = new THREE.Matrix4();
  const tileViewProjection = new THREE.Matrix4();
  const tileViewFrustum = new TilesViewFrustum();
  const marginCamera = new THREE.PerspectiveCamera();
  const marginProjection = new THREE.Matrix4();
  const marginFrustum = new TilesViewFrustum();
  let viewFrustumsReady = false;
  const tileBoundingSphere = new THREE.Sphere();
  const tileBoundingBox = new THREE.Box3();
  const activeTileBoundingBox = new THREE.Box3();
  const rootTileBoundingBox = new THREE.Box3();
  const rootWorldBoundingBox = new THREE.Box3();
  const sourceWorldBoundingBox = new THREE.Box3();
  const tileViewElevationFrustum = new THREE.Frustum();
  const tileViewElevationProjection = new THREE.Matrix4();
  const tileProjectedCenter = new THREE.Vector3();
  const tilesToShadowView = new THREE.Matrix4();
  const sunwardDirection = new THREE.Vector3();
  const shadowReceiverMatch: ShadowReceiverMatch = {
    receiverGeometricError: Number.POSITIVE_INFINITY,
    receiverCenterness: 0,
    lightFacing: 0,
  };
  const identityRotation = new THREE.Quaternion();
  const projectorUniforms = {
    uProjKind: { value: 0 },
    uProjOpacity: { value: 0 },
    uProjPos: { value: new THREE.Vector3() },
    uProjHeading: { value: 0 },
    uProjMatrix: { value: new THREE.Matrix4() },
    tProj: { value: null as THREE.Texture | null },
  };
  const shadowAppearanceUniforms = {
    uShadowUniformColor: { value: shadowClayColor },
    uShadowUniformColorMix: { value: 0 },
    uShadowTextureSaturation: { value: 1 },
  };
  const flatTerrainNormalMap = options.providesTerrain
    ? new THREE.DataTexture(
        new Uint8Array([128, 255, 128, 255]),
        1,
        1,
        THREE.RGBAFormat,
        THREE.UnsignedByteType
      )
    : null;
  if (flatTerrainNormalMap) {
    flatTerrainNormalMap.name = `${layerId}-flat-terrain-normal`;
    flatTerrainNormalMap.generateMipmaps = false;
    flatTerrainNormalMap.minFilter = THREE.NearestFilter;
    flatTerrainNormalMap.magFilter = THREE.NearestFilter;
    flatTerrainNormalMap.needsUpdate = true;
  }

  const patchMaterialForProjection = (material: THREE.Material) => {
    if ((material as { __projPatched?: boolean }).__projPatched) return;
    (material as { __projPatched?: boolean }).__projPatched = true;
    material.onBeforeCompile = (shader) => {
      Object.assign(
        shader.uniforms,
        projectorUniforms,
        shadowAppearanceUniforms
      );
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nvarying vec3 vProjWorld;"
        )
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvProjWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
varying vec3 vProjWorld;
uniform float uProjKind;
uniform float uProjOpacity;
uniform vec3 uProjPos;
uniform float uProjHeading;
uniform mat4 uProjMatrix;
uniform sampler2D tProj;
uniform vec3 uShadowUniformColor;
uniform float uShadowUniformColorMix;
uniform float uShadowTextureSaturation;`
        )
        .replace(
          "#include <map_fragment>",
          `#include <map_fragment>
float shadowTextureLuma = dot(
  diffuseColor.rgb,
  vec3(0.2126, 0.7152, 0.0722)
);
diffuseColor.rgb = mix(
  vec3(shadowTextureLuma),
  diffuseColor.rgb,
  uShadowTextureSaturation
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  uShadowUniformColor,
  uShadowUniformColorMix
);`
        )
        .replace(
          "#include <dithering_fragment>",
          `#include <dithering_fragment>
if (uProjKind > 0.5 && uProjOpacity > 0.001) {
  vec3 projColor = vec3(0.0);
  float mask = 0.0;
  if (uProjKind < 1.5) {
    vec3 dir = normalize(vProjWorld - uProjPos);
    float theta = atan(dir.x, -dir.z) - uProjHeading;
    float u = fract(theta / 6.28318530718 + 0.5);
    float v = 0.5 - asin(clamp(dir.y, -1.0, 1.0)) / 3.14159265359;
    projColor = texture2D(tProj, vec2(u, v)).rgb;
    mask = 1.0;
  } else {
    vec4 clipPos = uProjMatrix * vec4(vProjWorld, 1.0);
    if (clipPos.w > 0.0) {
      vec2 uv = clipPos.xy / clipPos.w * 0.5 + 0.5;
      if (uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0) {
        projColor = texture2D(tProj, uv).rgb;
        mask = 1.0;
      }
    }
  }
  gl_FragColor.rgb = mix(gl_FragColor.rgb, projColor, uProjOpacity * mask);
}`
        );
    };
    material.needsUpdate = true;
  };

  type ClayMaterialState = {
    original: THREE.Material | THREE.Material[];
    clay: THREE.Material | THREE.Material[];
  };

  type LitTextureMaterialState = {
    original: THREE.Material | THREE.Material[];
    lit: THREE.Material | THREE.Material[];
    generated: THREE.Material[];
  };

  const clayMaterialStates = new Map<THREE.Mesh, ClayMaterialState>();
  const litTextureMaterialStates = new Map<
    THREE.Mesh,
    LitTextureMaterialState
  >();
  const originalShadowSides = new Map<THREE.Material, THREE.Side | null>();
  const originalRenderSides = new Map<THREE.Material, THREE.Side>();
  const separatedSurfaceRenderSides = new WeakMap<THREE.Material, THREE.Side>();
  const separatedSurfaceShadowSides = new WeakMap<THREE.Material, THREE.Side>();
  const isSeparatedBuildingSurface = (material: THREE.Material) => {
    const surfaceName = material.name.trim().toLowerCase();
    return surfaceName === "roof" || surfaceName === "wall";
  };
  let mapStyleProjectionVersion = 0;
  const isRenderedBuildingSurface = (material: THREE.Material) => {
    const sourceName = material.name
      .trim()
      .toLowerCase()
      .split(" · ", 1)[0];
    return sourceName === "roof" || sourceName === "wall";
  };
  const resolveShadowCastingSide = (material: THREE.Material) =>
    separatedSurfaceShadowSides.get(material) ??
    (options.providesTerrain === true || isSeparatedBuildingSurface(material)
      ? THREE.FrontSide
      : THREE.BackSide);
  const resolveRenderSide = (material: THREE.Material) =>
    separatedSurfaceRenderSides.get(material) ?? THREE.FrontSide;
  const asMaterialArray = (
    material: THREE.Material | THREE.Material[]
  ): THREE.Material[] => (Array.isArray(material) ? material : [material]);
  const normalizedSeparatedSurfaceGeometries =
    new WeakSet<THREE.BufferGeometry>();
  const normalizeSeparatedBuildingSurfaces = (root: THREE.Object3D) => {
    root.traverse((parent) => {
      const surfaceNames = new Set<string>();
      const parts: Array<{
        materials: THREE.Material[];
        geometry: THREE.BufferGeometry;
        position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        featureId: THREE.BufferAttribute | THREE.InterleavedBufferAttribute;
        index: THREE.BufferAttribute;
      }> = [];

      for (const child of parent.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const geometry = mesh.geometry as THREE.BufferGeometry;
        if (normalizedSeparatedSurfaceGeometries.has(geometry)) continue;
        const materials = asMaterialArray(mesh.material);
        for (const material of materials) {
          const name = material.name.trim().toLowerCase();
          if (name === "roof" || name === "wall") surfaceNames.add(name);
        }
        if (!materials.some(isSeparatedBuildingSurface)) continue;
        const position = geometry.getAttribute("position");
        const featureId = geometry.getAttribute("_feature_id_0");
        const index = geometry.getIndex();
        if (!position || !featureId || !index) continue;
        parts.push({ materials, geometry, position, featureId, index });
      }
      if (!surfaceNames.has("roof") || !surfaceNames.has("wall")) return;

      type SurfaceTriangle = {
        part: number;
        offset: number;
        featureId: number;
        indices: [number, number, number];
        vertexKeys: [string, string, string];
      };
      type SurfaceEdgeReference = {
        triangle: number;
        forward: boolean;
      };
      const coordinateKey = (
        position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
        vertex: number
      ) => {
        const precision = 10_000;
        return `${Math.round(position.getX(vertex) * precision)},${Math.round(
          position.getY(vertex) * precision
        )},${Math.round(position.getZ(vertex) * precision)}`;
      };
      const triangles: SurfaceTriangle[] = [];
      for (let part = 0; part < parts.length; part += 1) {
        const { position, featureId, index } = parts[part];
        for (let offset = 0; offset + 2 < index.count; offset += 3) {
          const first = index.getX(offset);
          const second = index.getX(offset + 1);
          const third = index.getX(offset + 2);
          const id = featureId.getX(first);
          if (featureId.getX(second) !== id || featureId.getX(third) !== id) {
            continue;
          }
          const vertexKeys: [string, string, string] = [
            coordinateKey(position, first),
            coordinateKey(position, second),
            coordinateKey(position, third),
          ];
          if (new Set(vertexKeys).size !== 3) continue;
          triangles.push({
            part,
            offset,
            featureId: id,
            indices: [first, second, third],
            vertexKeys,
          });
        }
      }

      const edges = new Map<string, SurfaceEdgeReference[]>();
      const addEdge = (
        triangle: number,
        firstVertex: number,
        secondVertex: number
      ) => {
        const surface = triangles[triangle];
        const first = surface.vertexKeys[firstVertex];
        const second = surface.vertexKeys[secondVertex];
        const forward = first < second;
        const key = `${surface.featureId}|${forward ? first : second}|${
          forward ? second : first
        }`;
        const references = edges.get(key) ?? [];
        references.push({ triangle, forward });
        edges.set(key, references);
      };
      for (let triangle = 0; triangle < triangles.length; triangle += 1) {
        addEdge(triangle, 0, 1);
        addEdge(triangle, 1, 2);
        addEdge(triangle, 2, 0);
      }

      const adjacency = Array.from(
        { length: triangles.length },
        (): Array<{ triangle: number; invert: boolean }> => []
      );
      for (const references of edges.values()) {
        if (references.length !== 2) continue;
        const [first, second] = references;
        const invert = first.forward === second.forward;
        adjacency[first.triangle].push({
          triangle: second.triangle,
          invert,
        });
        adjacency[second.triangle].push({
          triangle: first.triangle,
          invert,
        });
      }

      const triangleFlips: Array<boolean | undefined> = Array(
        triangles.length
      ).fill(undefined);
      const componentByTriangle = new Int32Array(triangles.length).fill(-1);
      const components: number[][] = [];
      const inconsistentComponents = new Set<number>();
      for (let start = 0; start < triangles.length; start += 1) {
        if (triangleFlips[start] !== undefined) continue;
        const component = components.length;
        const members: number[] = [];
        const pending = [start];
        triangleFlips[start] = false;
        while (pending.length > 0) {
          const triangle = pending.pop();
          if (triangle === undefined) break;
          members.push(triangle);
          componentByTriangle[triangle] = component;
          for (const neighbor of adjacency[triangle]) {
            const expected =
              (triangleFlips[triangle] as boolean) !== neighbor.invert;
            const current = triangleFlips[neighbor.triangle];
            if (current === undefined) {
              triangleFlips[neighbor.triangle] = expected;
              pending.push(neighbor.triangle);
            } else if (current !== expected) {
              inconsistentComponents.add(component);
            }
          }
        }
        components.push(members);
      }

      const openComponents = new Set(inconsistentComponents);
      for (const references of edges.values()) {
        if (references.length === 2) continue;
        for (const reference of references) {
          openComponents.add(componentByTriangle[reference.triangle]);
        }
      }

      const componentVolumes = new Float64Array(components.length);
      for (let component = 0; component < components.length; component += 1) {
        const members = components[component];
        const firstTriangle = triangles[members[0]];
        const firstPosition = parts[firstTriangle.part].position;
        const anchorIndex = firstTriangle.indices[0];
        const anchorX = firstPosition.getX(anchorIndex);
        const anchorY = firstPosition.getY(anchorIndex);
        const anchorZ = firstPosition.getZ(anchorIndex);
        let volume = 0;
        for (const triangleIndex of members) {
          const triangle = triangles[triangleIndex];
          const position = parts[triangle.part].position;
          const [first, sourceSecond, sourceThird] = triangle.indices;
          const second = triangleFlips[triangleIndex]
            ? sourceThird
            : sourceSecond;
          const third = triangleFlips[triangleIndex]
            ? sourceSecond
            : sourceThird;
          const ax = position.getX(first) - anchorX;
          const ay = position.getY(first) - anchorY;
          const az = position.getZ(first) - anchorZ;
          const bx = position.getX(second) - anchorX;
          const by = position.getY(second) - anchorY;
          const bz = position.getZ(second) - anchorZ;
          const cx = position.getX(third) - anchorX;
          const cy = position.getY(third) - anchorY;
          const cz = position.getZ(third) - anchorZ;
          volume +=
            (ax * (by * cz - bz * cy) +
              ay * (bz * cx - bx * cz) +
              az * (bx * cy - by * cx)) /
            6;
        }
        componentVolumes[component] = volume;
        if (Math.abs(volume) <= 1e-6) openComponents.add(component);
      }

      for (
        let triangleIndex = 0;
        triangleIndex < triangles.length;
        triangleIndex += 1
      ) {
        const triangle = triangles[triangleIndex];
        const component = componentByTriangle[triangleIndex];
        const flip =
          (triangleFlips[triangleIndex] as boolean) !==
          componentVolumes[component] < 0;
        if (!flip) continue;
        const index = parts[triangle.part].index;
        const second = index.getX(triangle.offset + 1);
        index.setX(triangle.offset + 1, index.getX(triangle.offset + 2));
        index.setX(triangle.offset + 2, second);
      }

      const isClosed = openComponents.size === 0;
      for (const { geometry, index, materials } of parts) {
        index.needsUpdate = true;
        geometry.computeVertexNormals();
        for (const material of materials) {
          if (!isSeparatedBuildingSurface(material)) continue;
          separatedSurfaceRenderSides.set(
            material,
            isClosed ? THREE.FrontSide : THREE.DoubleSide
          );
          separatedSurfaceShadowSides.set(
            material,
            isClosed ? THREE.BackSide : THREE.FrontSide
          );
        }
        normalizedSeparatedSurfaceGeometries.add(geometry);
      }
    });
  };
  const buildClayMaterial = (source: THREE.Material) => {
    const material = new THREE.MeshStandardMaterial({
      color: shadowSimulationStyle?.uniformColor ? shadowClayColor : clayColor,
      roughness: clayRoughness,
      metalness: clayMetalness,
      // Keep the visible shell outside-facing. The shadow pass uses the side
      // appropriate for a closed building solid or an open terrain surface.
      side: resolveRenderSide(source),
      opacity: source.opacity,
      transparent: source.transparent,
      depthTest: true,
      depthWrite: source.depthWrite,
      alphaTest: source.alphaTest,
    });
    material.shadowSide = resolveShadowCastingSide(source);
    material.name = source.name ? `${source.name} · clay` : "tileset-clay";
    return material;
  };

  const buildLitTextureMaterial = (source: THREE.Material) => {
    const basic = source as THREE.MeshBasicMaterial;
    if (!basic.isMeshBasicMaterial) return source;

    // Mesh 2024 declares KHR_materials_unlit, which GLTFLoader represents as a
    // MeshBasicMaterial. Preserve its source texture and render state, but use
    // the same rough non-metallic PBR path as the regular LoD tiles while
    // shadow mode is active. No mesh-specific lighting shader is involved.
    const material = new THREE.MeshStandardMaterial({
      color: basic.color,
      map: basic.map,
      alphaMap: basic.alphaMap,
      aoMap: basic.aoMap,
      aoMapIntensity: basic.aoMapIntensity,
      lightMap: basic.lightMap,
      lightMapIntensity: basic.lightMapIntensity,
      roughness: 1,
      metalness: 0,
      opacity: basic.opacity,
      transparent: basic.transparent,
      depthTest: basic.depthTest,
      depthWrite: basic.depthWrite,
      alphaTest: basic.alphaTest,
      side: basic.side,
      vertexColors: basic.vertexColors,
      fog: basic.fog,
      wireframe: basic.wireframe,
    });
    material.name = basic.name
      ? `${basic.name} · shadow-lit`
      : "tileset-shadow-lit";
    material.blending = basic.blending;
    material.blendSrc = basic.blendSrc;
    material.blendDst = basic.blendDst;
    material.blendEquation = basic.blendEquation;
    material.colorWrite = basic.colorWrite;
    material.depthFunc = basic.depthFunc;
    material.polygonOffset = basic.polygonOffset;
    material.polygonOffsetFactor = basic.polygonOffsetFactor;
    material.polygonOffsetUnits = basic.polygonOffsetUnits;
    material.toneMapped = basic.toneMapped;
    material.visible = basic.visible;
    material.userData = { ...basic.userData };
    if (flatTerrainNormalMap) {
      // Keep the baked texture evenly lit without replacing the geometry
      // normals that Three.js uses for receiver-side shadow bias.
      material.normalMap = flatTerrainNormalMap;
      material.normalMapType = THREE.ObjectSpaceNormalMap;
    }
    delete material.userData.__projPatched;
    delete material.userData.__baseOpacity;
    delete material.userData.__baseTransparent;
    delete material.userData.__baseDepthWrite;
    return material;
  };

  const disposeClayState = (mesh: THREE.Mesh, state: ClayMaterialState) => {
    mesh.material = state.original;
    for (const material of asMaterialArray(state.clay)) material.dispose();
    clayMaterialStates.delete(mesh);
  };

  const restoreClayMaterials = (root: THREE.Object3D) => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const state = mesh.isMesh ? clayMaterialStates.get(mesh) : undefined;
      if (state) disposeClayState(mesh, state);
    });
  };

  const disposeLitTextureState = (
    mesh: THREE.Mesh,
    state: LitTextureMaterialState
  ) => {
    mesh.material = state.original;
    for (const material of state.generated) {
      if (originalShadowSides.has(material)) {
        material.shadowSide = originalShadowSides.get(material) ?? null;
        originalShadowSides.delete(material);
      }
      if (originalRenderSides.has(material)) {
        material.side = originalRenderSides.get(material) ?? material.side;
        originalRenderSides.delete(material);
      }
      material.dispose();
    }
    litTextureMaterialStates.delete(mesh);
  };

  const restoreLitTextureMaterials = (root: THREE.Object3D) => {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      const state = mesh.isMesh
        ? litTextureMaterialStates.get(mesh)
        : undefined;
      if (state) disposeLitTextureState(mesh, state);
    });
  };

  const applyShadowCastingSide = (material: THREE.Material) => {
    if (shadowSimulationStyle) {
      if (!originalShadowSides.has(material)) {
        originalShadowSides.set(material, material.shadowSide);
      }
      const renderSide = separatedSurfaceRenderSides.get(material);
      if (renderSide !== undefined && !originalRenderSides.has(material)) {
        originalRenderSides.set(material, material.side);
        material.side = renderSide;
        material.needsUpdate = true;
      }
      material.shadowSide = resolveShadowCastingSide(material);
      return;
    }

    if (originalShadowSides.has(material)) {
      material.shadowSide = originalShadowSides.get(material) ?? null;
      originalShadowSides.delete(material);
    }
    if (originalRenderSides.has(material)) {
      material.side = originalRenderSides.get(material) ?? material.side;
      originalRenderSides.delete(material);
      material.needsUpdate = true;
    }
  };

  const restoreShadowSides = () => {
    for (const [material, shadowSide] of originalShadowSides) {
      material.shadowSide = shadowSide;
      material.needsUpdate = true;
    }
    originalShadowSides.clear();
    for (const [material, side] of originalRenderSides) {
      material.side = side;
      material.needsUpdate = true;
    }
    originalRenderSides.clear();
  };

  const applyMaterialFlags = (root: THREE.Object3D) => {
    normalizeSeparatedBuildingSurfaces(root);
    const useClayShading = whiteShading;
    const effectiveClayColor = clayColor;
    shadowAppearanceUniforms.uShadowUniformColorMix.value =
      shadowSimulationStyle?.uniformColor
        ? clamp(shadowSimulationStyle.uniformColorMix ?? 1, 0, 1)
        : 0;
    shadowAppearanceUniforms.uShadowTextureSaturation.value = clamp(
      shadowSimulationStyle?.textureSaturation ?? 1,
      0,
      1
    );
    const forceOpaque = shadowSimulationStyle?.fullOpacity === true;
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      let clayState = clayMaterialStates.get(mesh);
      let litTextureState = litTextureMaterialStates.get(mesh);
      if (useClayShading) {
        if (litTextureState) {
          disposeLitTextureState(mesh, litTextureState);
          litTextureState = undefined;
        }
        if (!clayState) {
          const original = mesh.material;
          const clay = Array.isArray(original)
            ? original.map(buildClayMaterial)
            : buildClayMaterial(original);
          clayState = { original, clay };
          clayMaterialStates.set(mesh, clayState);
          mesh.material = clay;
        }
      } else {
        if (clayState) {
          disposeClayState(mesh, clayState);
          clayState = undefined;
        }
        const sourceMaterials = asMaterialArray(mesh.material);
        const needsLitTextureMaterial =
          options.providesTerrain === true &&
          shadowSimulationStyle !== null &&
          (litTextureState !== undefined ||
            sourceMaterials.some(
              (material) =>
                (material as THREE.MeshBasicMaterial).isMeshBasicMaterial
            ));
        if (needsLitTextureMaterial && !litTextureState) {
          const original = mesh.material;
          const generated: THREE.Material[] = [];
          const buildMaterial = (source: THREE.Material) => {
            const lit = buildLitTextureMaterial(source);
            if (lit !== source) generated.push(lit);
            return lit;
          };
          const lit = Array.isArray(original)
            ? original.map(buildMaterial)
            : buildMaterial(original);
          litTextureState = { original, lit, generated };
          litTextureMaterialStates.set(mesh, litTextureState);
          mesh.material = lit;
        } else if (!needsLitTextureMaterial && litTextureState) {
          disposeLitTextureState(mesh, litTextureState);
          litTextureState = undefined;
        }
      }

      const materials = asMaterialArray(mesh.material);
      for (const material of materials) {
        // Clay materials already enforce the correct casting side. Apply it to
        // original textured PBR materials too, then restore their source
        // setting when shadow simulation ends.
        if (!clayState) applyShadowCastingSide(material);
        // The reorientation parent keeps tile coordinates in the same local
        // meter frame and projection as the point layers. Write that shared
        // depth so later point-cloud layers are hidden by nearer mesh faces.
        material.depthTest = true;
        if (material.userData.__baseOpacity === undefined) {
          material.userData.__baseOpacity = material.opacity;
          material.userData.__baseTransparent = material.transparent;
          material.userData.__baseDepthWrite = material.depthWrite;
        }
        const translucent = opacity < 0.999;
        material.opacity = forceOpaque
          ? 1
          : (material.userData.__baseOpacity as number) * opacity;
        material.transparent = forceOpaque
          ? false
          : (material.userData.__baseTransparent as boolean) || translucent;
        material.depthWrite = forceOpaque
          ? true
          : (material.userData.__baseDepthWrite as boolean) && !translucent;
        if ("wireframe" in material) {
          (material as THREE.Material & { wireframe: boolean }).wireframe =
            wireframe;
        }
        if (useClayShading && "color" in material) {
          (material as THREE.Material & { color: THREE.Color }).color.copy(
            effectiveClayColor
          );
        }
        patchMaterialForProjection(material);
        material.needsUpdate = true;
      }
    });
  };
  const refreshRenderedMaterials = (root: THREE.Object3D) => {
    applyMaterialFlags(root);
    mapStyleProjectionVersion += 1;
  };

  const applyOutlineVisibility = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (object.userData[TILE_OUTLINE_FLAG]) {
        object.visible = shadowSimulationStyle ? false : outlineVisible;
      }
    });
  };
  const applyOutlineStyle = (root: THREE.Object3D) => {
    root.traverse((object) => {
      if (!object.userData[TILE_OUTLINE_FLAG]) return;
      const outline = object as THREE.LineSegments;
      for (const material of asMaterialArray(outline.material)) {
        if (!(material instanceof THREE.LineBasicMaterial)) continue;
        material.color.set(outlineColor);
        material.opacity = outlineOpacity;
        material.transparent = outlineOpacity < 1;
        material.needsUpdate = true;
      }
    });
  };

  const requestRender = () => map?.triggerRepaint();
  const getDownloadQueues = (): RuntimePriorityQueue[] =>
    tiles
      ? [...tiles.downloadQueue.originQueues.values()].map(
          (queue) => queue as RuntimePriorityQueue
        )
      : [];
  const runDownloadQueues = () => {
    for (const queue of getDownloadQueues()) queue.tryRunJobs();
  };
  const clearErrorTargetTimer = () => {
    if (errorTargetTimer) {
      window.clearTimeout(errorTargetTimer);
      errorTargetTimer = 0;
    }
  };
  const clearKickstartTimer = () => {
    if (kickstartTimer) {
      window.clearInterval(kickstartTimer);
      kickstartTimer = 0;
    }
  };
  const clearHiddenWipeTimer = () => {
    if (hiddenWipeTimer) {
      window.clearTimeout(hiddenWipeTimer);
      hiddenWipeTimer = 0;
    }
  };
  const getRuntimeCache = (): RuntimeLruCache | null =>
    tiles ? (tiles.lruCache as RuntimeLruCache) : null;
  const tileRetries = createThreeTilesRetryController(
    () => tiles as unknown as (TilesRenderer & RetryableTilesRenderer) | null,
    requestRender
  );
  const getRequestDemand = () => {
    if (disposed || !runtimeVisible) return 0;
    if (!tiles) return 1;
    const downloadDemand = getDownloadQueues().reduce(
      (total, queue) => total + queue.items.length + queue.currJobs,
      0
    );
    const processNodeQueue =
      tiles.processNodeQueue as typeof tiles.processNodeQueue & {
        items: unknown[];
        currJobs: number;
      };
    const stats = (
      tiles as TilesRenderer & {
        stats?: { queued?: number; downloading?: number; parsing?: number };
      }
    ).stats;
    return (
      downloadDemand +
      processNodeQueue.items.length +
      processNodeQueue.currJobs +
      (stats?.queued ?? 0) +
      (stats?.downloading ?? 0) +
      (stats?.parsing ?? 0) +
      (shadowView && !shadowSelectionEnabled ? 1 : 0) +
      (shadowSelectionNeedsTraversal ? 1 : 0) +
      (tileRetries.hasPendingRetries() ? 1 : 0) +
      viewQualityAuditPasses +
      (tiles.group.children.length === 0 && !tileRetries.hasExhaustedRetries()
        ? 1
        : 0)
    );
  };
  const getViewElevationRange = (
    camera: THREE.Camera
  ): readonly [number, number] | null => {
    if (!tiles || !runtimeVisible) return null;
    const currentTiles = tiles;
    camera.updateMatrixWorld(true);
    currentTiles.group.updateWorldMatrix(true, false);
    tileViewElevationProjection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    tileViewElevationFrustum.setFromProjectionMatrix(
      tileViewElevationProjection,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    currentTiles.forEachLoadedModel((model) => {
      model.updateWorldMatrix(true, true);
      tileBoundingBox.setFromObject(model);
      if (tileBoundingBox.isEmpty()) return;
      if (!tileViewElevationFrustum.intersectsBox(tileBoundingBox)) return;
      minimum = Math.min(minimum, tileBoundingBox.min.y);
      maximum = Math.max(maximum, tileBoundingBox.max.y);
    });
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum]
      : null;
  };
  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] => {
    if (!tiles || !runtimeVisible) return [];
    tiles.group.updateWorldMatrix(true, false);
    const volumes: SharedThreeSceneTileVolume[] = [];
    for (const tile of tiles.activeTiles) {
      const activeTile = tile as Tile & {
        engineData?: {
          boundingVolume?: { getAABB?: (target: THREE.Box3) => void };
        };
      };
      const boundingVolume = activeTile.engineData?.boundingVolume;
      if (!boundingVolume?.getAABB) continue;
      boundingVolume.getAABB(activeTileBoundingBox);
      activeTileBoundingBox.applyMatrix4(tiles.group.matrixWorld);
      if (activeTileBoundingBox.isEmpty()) continue;
      volumes.push({
        id: getTileDebugId(tile),
        kind: options.providesTerrain ? "terrain-tile" : "3d-tile",
        loadReason: getTileLoadReason(activeTile as RuntimeTile),
        minimum: activeTileBoundingBox.min.toArray(),
        maximum: activeTileBoundingBox.max.toArray(),
      });
    }
    return volumes;
  };
  let lastNotifiedRequestDemand = Number.NaN;
  const notifyRequestStateChange = () => {
    const requestDemand = getRequestDemand();
    if (requestDemand === lastNotifiedRequestDemand) return;
    lastNotifiedRequestDemand = requestDemand;
    options.onRequestStateChange?.();
  };
  const clearShadowReceiverSources = () => {
    shadowReceiverMask = null;
    previousShadowReceiverMask = null;
    shadowReceiverMaskConverged = false;
    shadowReceiverSourceSignature = "";
    mainViewSourceTiles.clear();
    shadowSelectionRefreshPending = false;
  };
  const setShadowSelectionEnabled = (enabled: boolean) => {
    const nextEnabled = enabled && shadowView !== null;
    if (!nextEnabled) clearShadowReceiverSources();
    if (shadowSelectionEnabled === nextEnabled) return;
    shadowSelectionEnabled = nextEnabled;
    shadowSelectionNeedsTraversal = nextEnabled;
  };
  const requestShadowSelectionRefresh = () => {
    if (!shadowView) return;
    shadowSelectionRefreshPending = true;
  };
  const isPipelineIdle = () =>
    tiles !== null &&
    !tiles.downloadQueue.running &&
    !tiles.parseQueue.running &&
    !tiles.processNodeQueue.running &&
    tiles.loadingTiles.size === 0 &&
    !tileRetries.hasPendingRetries() &&
    payloadAwareConcurrency.getCooldownRemainingMs() <= 0;
  const isTileInMainView = (tile: RuntimeTile): boolean => {
    const bounds = tile.engineData?.boundingVolume;
    if (
      !bounds ||
      !viewFrustumsReady ||
      typeof bounds.intersectsFrustum !== "function"
    ) {
      return tile.traversal?.inFrustum ?? false;
    }
    return bounds.intersectsFrustum(tileViewFrustum);
  };
  const isChildUnloadable = (child: RuntimeTile): boolean =>
    deferred.has(child) ||
    tileRetries.isBlocked(child) ||
    (!child.internal?.hasContent && (child.children?.length ?? 0) === 0);
  /**
   * The main view converged when every displayed tile inside the main camera
   * frustum either meets the effective target or cannot refine any further
   * because all of its children are deferred, retry-blocked or empty.
   */
  const mainViewWithinErrorFactor = (factor: number) => {
    if (!tiles || tiles.visibleTiles.size === 0) return false;
    const acceptedError = effectiveErrorTarget * factor;
    for (const visible of tiles.visibleTiles) {
      const tile = visible as RuntimeTile;
      const children = (tile.children ?? []) as RuntimeTile[];
      if (children.length === 0 || tile.traversal?.unconditionallyRefine) {
        continue;
      }
      if (!isTileInMainView(tile)) continue;
      if (tile.traversal.error <= acceptedError) continue;
      if (!children.every(isChildUnloadable)) return false;
    }
    return true;
  };
  const mainViewConverged = () => mainViewWithinErrorFactor(1);
  const currentShadowPathConverged = () => {
    if (!tiles || !shadowReceiverMask) return false;
    let currentTileCount = 0;
    for (const visible of tiles.visibleTiles) {
      const tile = visible as RuntimeTile;
      if (tile.shadowReceiverCurrent !== true || isTileInMainView(tile)) {
        continue;
      }
      currentTileCount += 1;
      const children = (tile.children ?? []) as RuntimeTile[];
      if (children.length === 0 || tile.traversal?.unconditionallyRefine) {
        continue;
      }
      if (tile.traversal.error <= effectiveErrorTarget) continue;
      if (!children.every(isChildUnloadable)) return false;
    }
    return currentTileCount > 0;
  };
  const getTileCenterness = (
    bounds: NonNullable<RuntimeTile["engineData"]>["boundingVolume"]
  ) => {
    if (!bounds) return 0;
    bounds.getSphere(tileBoundingSphere);
    tileProjectedCenter
      .copy(tileBoundingSphere.center)
      .applyMatrix4(tileViewProjection);
    const centerDistance = Math.min(
      Math.SQRT2,
      Math.hypot(tileProjectedCenter.x, tileProjectedCenter.y)
    );
    return 1 - centerDistance / Math.SQRT2;
  };
  const getTileDebugId = (tile: Tile) => {
    let sequence = tileDebugIds.get(tile);
    if (sequence === undefined) {
      sequence = nextTileDebugId++;
      tileDebugIds.set(tile, sequence);
    }
    const uri = tile.content?.uri;
    const depth = (tile as Tile & { internal?: { depth?: number } }).internal
      ?.depth;
    return `${layerId}:${uri ?? `d${depth ?? "?"}:t${sequence}`}`;
  };
  const getTileLoadReason = (
    tile: RuntimeTile
  ): SharedThreeSceneTileVolume["loadReason"] => {
    if (isTileInMainView(tile)) return "viewport";
    return tile.shadowReceiverCenterness === undefined ? undefined : "shadow";
  };
  const captureShadowReceiverSources = () => {
    const sourceCamera = shadowView?.camera;
    if (
      !tiles ||
      !(sourceCamera instanceof THREE.OrthographicCamera) ||
      !viewFrustumsReady ||
      !tiles.getBoundingBox(rootTileBoundingBox)
    ) {
      return "empty" as const;
    }

    sourceCamera.updateMatrixWorld(true);
    tiles.group.updateWorldMatrix(true, false);
    rootWorldBoundingBox
      .copy(rootTileBoundingBox)
      .applyMatrix4(tiles.group.matrixWorld);
    sourceCamera.getWorldDirection(sunwardDirection).negate().normalize();
    tilesToShadowView.multiplyMatrices(
      sourceCamera.matrixWorldInverse,
      tiles.group.matrixWorld
    );
    const sources: ShadowReceiverSource[] = [];
    const sourceTiles = new Set<Tile>();
    const sourceKeys: string[] = [];
    for (const visible of tiles.visibleTiles) {
      const tile = visible as RuntimeTile;
      if (!isTileInMainView(tile)) continue;
      const bounds = tile.engineData?.boundingVolume;
      if (!bounds?.getAABB) continue;
      bounds.getAABB(tileBoundingBox);
      if (!tileBoundingBox.isEmpty()) {
        sourceWorldBoundingBox
          .copy(tileBoundingBox)
          .applyMatrix4(tiles.group.matrixWorld);
        sources.push({
          bounds: tileBoundingBox.clone(),
          maximumCasterDistance: maximumSweepDistanceWithinBox(
            sourceWorldBoundingBox,
            rootWorldBoundingBox,
            sunwardDirection
          ),
          geometricError: tile.geometricError,
          centerness: getTileCenterness(bounds),
        });
        sourceKeys.push(`${getTileDebugId(tile)}:${tile.geometricError}`);
      }
      let source: Tile | null = tile;
      while (source) {
        sourceTiles.add(source);
        source = source.parent;
      }
    }
    const nextSignature = [shadowViewSignature, ...sourceKeys.sort()].join("|");
    if (shadowReceiverMask && nextSignature === shadowReceiverSourceSignature) {
      return "unchanged" as const;
    }
    const nextMask = createShadowReceiverMask(sources, tilesToShadowView);
    if (!nextMask) {
      clearShadowReceiverSources();
      return "empty" as const;
    }
    if (shadowReceiverMaskConverged) {
      previousShadowReceiverMask = shadowReceiverMask;
    }
    shadowReceiverMask = nextMask;
    shadowReceiverMaskConverged = false;
    shadowReceiverSourceSignature = nextSignature;
    mainViewSourceTiles.clear();
    for (const tile of sourceTiles) mainViewSourceTiles.add(tile);
    return "updated" as const;
  };
  const measureUsedBytesMain = () => {
    if (!tiles) return;
    let bytes = 0;
    for (const tile of tiles.usedSet) {
      bytes += tiles.lruCache.getMemoryUsage(tile);
    }
    usedBytesMain = bytes;
  };
  const applyEffectiveErrorTarget = (nextTarget: number) => {
    if (effectiveErrorTarget === nextTarget) return;
    effectiveErrorTarget = nextTarget;
    if (tiles) tiles.errorTarget = effectiveErrorTarget;
    viewRefinementPending = true;
    requestShadowSelectionRefresh();
    tiles?.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
  const resetEffectiveErrorTarget = () => {
    clearErrorTargetTimer();
    errorTargetState = createEffectiveErrorTargetState(
      requestedErrorTarget,
      Date.now()
    );
    effectiveErrorTarget = requestedErrorTarget;
    if (tiles) tiles.errorTarget = effectiveErrorTarget;
  };
  const applyErrorTargetPolicy = () => {
    const cache = getRuntimeCache();
    if (!tiles || !cache) return;
    const { zoom, pitch } = readMapView(map);
    const result = nextEffectiveErrorTarget(errorTargetState, {
      now: Date.now(),
      physicallyFull: cache.isFull(),
      pipelineIdle: isPipelineIdle(),
      mainConverged: lastMainViewConverged,
      usedBytesMain,
      cachedBytes: cache.cachedBytes,
      ceiling: ceilingBytes,
      zoom,
      pitch,
      unusedEvictable: cache.itemList.length > cache.usedSet.size,
      lastProgressAt,
    });
    errorTargetState = result.state;
    clearErrorTargetTimer();
    if (result.changed) {
      applyEffectiveErrorTarget(errorTargetState.effective);
      return;
    }
    if (result.retryInMs !== null) {
      errorTargetTimer = window.setTimeout(() => {
        errorTargetTimer = 0;
        tiles?.dispatchEvent({ type: "needs-update" });
        requestRender();
      }, Math.max(1, Math.ceil(result.retryInMs)));
    }
  };
  const resetDeferredTiles = () => {
    for (const tile of deferred) {
      if (tile.internal.loadingState === DEFERRED_TILE_LOADING_STATE) {
        tile.internal.loadingState = UNLOADED_LOADING_STATE;
      }
    }
    deferred.clear();
  };
  const evictUnusedCacheItems = () => {
    const cache = getRuntimeCache();
    if (!cache) return;
    for (const tile of [...cache.itemList]) {
      if (!cache.usedSet.has(tile)) cache.remove(tile);
    }
  };
  /** Full wipe of a tab that stayed hidden: memory back, state reset. */
  const wipeCacheWhileHidden = () => {
    hiddenWipeTimer = 0;
    if (!tiles) return;
    viewRefinementPending = true;
    setShadowSelectionEnabled(false);
    resetEffectiveErrorTarget();
    resetDeferredTiles();
    tileRetries.reset();
    const cache = getRuntimeCache();
    if (!cache) return;
    for (const tile of [...cache.itemSet.keys()]) cache.remove(tile);
  };
  const handleVisibilityChange = () => {
    if (!tiles) return;
    if (document.visibilityState !== "hidden") {
      clearHiddenWipeTimer();
      viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
      tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
      return;
    }
    // Unused content goes at once; the tiles of the last view stay for a
    // quick return before the debounced full wipe.
    evictUnusedCacheItems();
    clearHiddenWipeTimer();
    hiddenWipeTimer = window.setTimeout(
      wipeCacheWhileHidden,
      HIDDEN_TAB_WIPE_DELAY_MS
    );
  };
  const maybeEnableShadowSelection = () => {
    if (
      !shadowView ||
      !tiles ||
      !cameraSet ||
      (tiles.group.children.length === 0 && !tileRetries.hasExhaustedRetries())
    ) {
      return;
    }
    if (!mainViewWithinErrorFactor(SHADOW_SELECTION_ERROR_FACTOR)) {
      return;
    }
    const receiverUpdate = captureShadowReceiverSources();
    if (receiverUpdate === "empty") {
      setShadowSelectionEnabled(false);
      return;
    }
    shadowSelectionRefreshPending = false;
    if (receiverUpdate === "unchanged") return;
    viewRefinementPending = false;
    if (shadowSelectionEnabled) {
      shadowSelectionNeedsTraversal = true;
    } else {
      setShadowSelectionEnabled(true);
    }
    tiles.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
  const maybeFinalizeShadowSelection = () => {
    if (
      !tiles ||
      !shadowSelectionEnabled ||
      shadowReceiverMaskConverged ||
      shadowSelectionNeedsTraversal ||
      !isPipelineIdle() ||
      !currentShadowPathConverged()
    ) {
      return;
    }
    shadowReceiverMaskConverged = true;
    if (!previousShadowReceiverMask) return;
    previousShadowReceiverMask = null;
    tiles.dispatchEvent({ type: "needs-update" });
    requestRender();
  };
  const handleModelLoad = (event: {
    scene?: THREE.Object3D;
    tile?: Tile;
    url?: string;
  }) => {
    if (event.tile) tileRetries.handleSuccess(event.tile, event.url);
    if (event.scene) {
      event.scene.traverse((object) => {
        object.frustumCulled = false;
      });
      refreshRenderedMaterials(event.scene);
      applyOutlineVisibility(event.scene);
    }
    options.onContentChanged?.();
    lastProgressAt = Date.now();
    if (event.tile && tiles) {
      const registeredBytes = tiles.lruCache.getMemoryUsage(event.tile);
      bytesPredictor.observe(
        {
          url: event.url ?? resolveTileContentUrl(event.tile),
          geometricError: event.tile.geometricError,
        },
        registeredBytes
      );
      reapplyCacheBoundsIfDrifted();
    }
    payloadAwareConcurrency.observeSuccess();
    applyRequestConcurrency();
    notifyRequestStateChange();
    requestRender();
  };
  const handleModelDispose = (event: { scene?: THREE.Object3D }) => {
    if (event.scene) {
      restoreClayMaterials(event.scene);
      restoreLitTextureMaterials(event.scene);
    }
    options.onContentChanged?.();
    // Freed space admits waiting tiles only through a new traversal, which
    // the change-gated update would otherwise wait for the camera to trigger.
    if (tiles && !tiles.lruCache.isFull()) {
      tiles.dispatchEvent({ type: "needs-update" });
      requestRender();
    }
  };
  const handleTilesetLoad = (event: { url?: string }) => {
    clearKickstartTimer();
    tileRetries.handleSuccess(null, event.url);
    payloadAwareConcurrency.observeSuccess();
    applyRequestConcurrency();
    requestRender();
  };
  /**
   * D8: a failed tile leaves the cache so a later retry can be admitted again;
   * it stays UNLOADED and is skipped by `queueTileForDownload` while blocked,
   * so its parent keeps rendering as the fallback.
   */
  const handleLoadError = (event: {
    tile?: Tile | null;
    url?: string | URL;
    error?: unknown;
  }) => {
    const failedTile = event.tile ?? null;
    if (failedTile && deferred.has(failedTile)) return;
    const retryState = tileRetries.handleFailure(
      failedTile,
      event.url,
      event.error
    );
    if (failedTile && tiles && retryState !== "ignored") {
      const wasFailed =
        failedTile.internal.loadingState === FAILED_LOADING_STATE;
      const removed = tiles.lruCache.remove(failedTile);
      if (!removed && wasFailed) {
        failedTile.internal.loadingState = UNLOADED_LOADING_STATE;
      }
      if (wasFailed) {
        tiles.stats.failed = Math.max(0, tiles.stats.failed - 1);
      }
      if (retryState === "exhausted") {
        tiles.dispatchEvent({ type: "needs-update" });
        requestRender();
      }
    }
    payloadAwareConcurrency.observeFailure(event.error);
    applyRequestConcurrency();
    scheduleRequestBackoffRecovery();
    // A failed root is retried by the controller; tile errors keep the
    // kickstart running until the root tileset arrives.
    if (!failedTile) clearKickstartTimer();
    maybeEnableShadowSelection();
    notifyRequestStateChange();
  };
  const handleTilesLoadEnd = () => {
    notifyRequestStateChange();
    maybeEnableShadowSelection();
  };
  const syncProjector = () => {
    const projector = activeProjector;
    if (!projector) {
      projectorUniforms.uProjKind.value = 0;
      projectorUniforms.uProjOpacity.value = 0;
      projectorUniforms.tProj.value = null;
      return;
    }
    placementMatrix.compose(
      orientationGroup.position,
      identityRotation,
      orientationGroup.scale
    );
    inversePlacementMatrix.copy(placementMatrix).invert();
    projectorUniforms.uProjKind.value = projector.kind === "pano" ? 1 : 2;
    projectorUniforms.uProjOpacity.value = projector.opacity;
    projectorUniforms.tProj.value = projector.texture;
    if (projector.kind === "pano") {
      projectorUniforms.uProjPos.value
        .copy(projector.position)
        .applyMatrix4(placementMatrix);
      projectorUniforms.uProjHeading.value = projector.headingRad;
    } else {
      projectorUniforms.uProjMatrix.value
        .copy(projector.viewProj)
        .multiply(inversePlacementMatrix);
    }
  };
  const applyCacheBudget = () => {
    const cache = getRuntimeCache();
    if (!cache) return;
    const ceiling = ceilingBytes;
    const bounds = resolveTilesCacheBounds({
      ceilingBytes: ceiling,
      estimateBytes: bytesPredictor.globalEstimate(),
    });
    // Admission stops at the physical ceiling (tiles register their predicted
    // bytes on admission, so `cachedBytes` grows before downloads finish); the
    // asynchronous eviction keeps a retention floor below it and only aborts
    // in-flight tiles once the real bytes drift far beyond the estimates.
    cache.minSize = DEFAULT_CACHE_MIN_ITEMS;
    cache.maxSize = DEFAULT_CACHE_MAX_ITEMS;
    cache.minBytesSize = bounds.minBytesSize;
    cache.maxBytesSize = bounds.maxBytesSize;
    cache.unloadPercent = TILES_LOAD_POLICY.cacheUnloadPercent;
    cache.isFull = () =>
      cache.itemSet.size >= cache.maxSize || cache.cachedBytes >= ceiling;
    cache.scheduleUnload();
  };
  const reapplyCacheBoundsIfDrifted = () => {
    const cache = getRuntimeCache();
    if (!cache) return;
    const bounds = resolveTilesCacheBounds({
      ceilingBytes,
      estimateBytes: bytesPredictor.globalEstimate(),
    });
    if (
      Math.abs(bounds.maxBytesSize - cache.maxBytesSize) >
      TILES_LOAD_POLICY.cacheBoundsReapplyBytes
    ) {
      applyCacheBudget();
    }
  };
  const applyRequestConcurrency = () => {
    const cache = getRuntimeCache();
    if (!tiles || !cache) return;
    const activeConcurrency = resolveRequestConcurrency({
      configured: payloadAwareConcurrency.getConcurrency(requestConcurrency),
      ceilingBytes,
      cachedBytes: cache.cachedBytes,
      estimateBytes: bytesPredictor.globalEstimate(),
    });
    tiles.downloadQueue.maxJobsPerOrigin =
      map &&
      options.providesTerrain !== true &&
      isSharedThreeTerrainLoading(map)
        ? 0
        : activeConcurrency;
  };
  const handleWireBytes = (_url: string, response: Response) => {
    const contentLength = Number(response.headers.get("content-length"));
    if (!Number.isFinite(contentLength) || contentLength <= 0) return;
    payloadAwareConcurrency.observePayload(contentLength);
    applyRequestConcurrency();
  };
  const scheduleRequestBackoffRecovery = () => {
    if (!tiles) return;
    const delay = payloadAwareConcurrency.getCooldownRemainingMs();
    if (requestBackoffTimer) {
      window.clearTimeout(requestBackoffTimer);
      requestBackoffTimer = 0;
    }
    if (delay <= 0) return;
    requestBackoffTimer = window.setTimeout(() => {
      requestBackoffTimer = 0;
      applyRequestConcurrency();
      if (tiles && tiles.downloadQueue.maxJobsPerOrigin > 0) {
        runDownloadQueues();
        tiles.dispatchEvent({ type: "needs-update" });
      }
      requestRender();
    }, delay);
  };
  const handleViewStart = () => {
    viewRefinementPending = true;
    requestShadowSelectionRefresh();
    tiles?.dispatchEvent({ type: "needs-update" });
  };
  const handleViewEnd = () => {
    if (!tiles) return;
    viewRefinementPending = true;
    requestShadowSelectionRefresh();
    viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
    tiles.dispatchEvent({ type: "needs-update" });
  };
  /** Main-view and prefetch-margin frustums in the tiles group frame. */
  const prepareViewFrustums = (viewCamera: THREE.Camera) => {
    if (!tiles) return;
    // Refresh the parents directly, then let TilesGroup recompute its own
    // world matrix so its cached inverse (used by the traversal) stays in sync.
    offsetGroup.updateWorldMatrix(true, false);
    tiles.group.updateMatrixWorld(true);
    tileViewProjection
      .multiplyMatrices(
        viewCamera.projectionMatrix,
        viewCamera.matrixWorldInverse
      )
      .multiply(tiles.group.matrixWorld);
    tileViewFrustum.setFromProjectionMatrix(
      tileViewProjection,
      viewCamera.coordinateSystem,
      viewCamera.reversedDepth
    );
    if (viewCamera instanceof THREE.PerspectiveCamera) {
      marginCamera.fov =
        viewCamera.fov * TILES_LOAD_POLICY.prefetchMarginFovFactor;
      marginCamera.aspect = viewCamera.aspect;
      marginCamera.near = viewCamera.near;
      marginCamera.far = viewCamera.far;
      marginCamera.zoom = viewCamera.zoom;
      marginCamera.updateProjectionMatrix();
      marginProjection
        .multiplyMatrices(
          marginCamera.projectionMatrix,
          viewCamera.matrixWorldInverse
        )
        .multiply(tiles.group.matrixWorld);
      marginFrustum.setFromProjectionMatrix(
        marginProjection,
        viewCamera.coordinateSystem,
        viewCamera.reversedDepth
      );
    } else {
      marginFrustum.copy(tileViewFrustum);
    }
    viewFrustumsReady = true;
  };
  const isTileInPrefetchMargin = (tile: RuntimeTile): boolean => {
    const bounds = tile.engineData?.boundingVolume;
    if (!bounds || !viewFrustumsReady) return false;
    return bounds.intersectsFrustum(marginFrustum);
  };
  /**
   * D1: displayable REPLACE siblings outside the view and its prefetch margin
   * are parked in the FAILED state so upstream's parent gate treats them as
   * finished without a download; they are released once they come into view.
   */
  const applyTileDeferral = (tile: Tile, inView: boolean) => {
    const runtimeTile = tile as RuntimeTile;
    const isDeferred = deferred.has(tile);
    const displayable =
      tile.internal.hasRenderableContent &&
      tile.refine === "REPLACE" &&
      !isUnconditionallyRefined(tile);
    const decision = shouldDeferTile({
      displayable,
      inView,
      inMargin:
        !inView && (isDeferred || displayable)
          ? isTileInPrefetchMargin(runtimeTile)
          : false,
      loadingState: tile.internal.loadingState,
      isDeferred,
    });
    if (decision === "defer") {
      tile.internal.loadingState = DEFERRED_TILE_LOADING_STATE;
      deferred.add(tile);
    } else if (decision === "undefer") {
      deferred.delete(tile);
      if (tile.internal.loadingState === DEFERRED_TILE_LOADING_STATE) {
        tile.internal.loadingState = UNLOADED_LOADING_STATE;
      }
    }
  };
  const assignTilePriority = (tile: RuntimeTile) => {
    const bounds = tile.engineData?.boundingVolume;
    let inMainFrustum = tile.traversal?.inFrustum ?? false;
    let centerness = 0;
    if (bounds && viewFrustumsReady && tiles) {
      inMainFrustum = bounds.intersectsFrustum(tileViewFrustum);
      centerness = getTileCenterness(bounds);
    }
    tile.priority = deriveTilePriority({
      depth: tile.internal?.depth ?? 0,
      inMainFrustum,
      isExternalTileset: tile.internal?.hasUnrenderableContent ?? false,
      centerness,
      shadowReceiverCenterness: shadowSelectionEnabled
        ? tile.shadowReceiverCenterness
        : undefined,
      shadowLightFacing: shadowSelectionEnabled
        ? tile.shadowLightFacing
        : undefined,
    });
  };
  /** Refresh the download and parse order for the current view every frame. */
  const prioritizeQueuedTiles = () => {
    if (!tiles) return;
    for (const queue of getDownloadQueues()) {
      for (const tile of queue.items) assignTilePriority(tile as RuntimeTile);
    }
    const parseQueue = tiles.parseQueue as RuntimePriorityQueue;
    for (const tile of parseQueue.items)
      assignTilePriority(tile as RuntimeTile);
  };
  /** The overlay only exists while tile bounds are shown. */
  const syncTileDebugOverlay = () => {
    if (!tiles) return;
    if (!tileBoundsVisible) {
      tileDebugOverlay?.dispose();
      tileDebugOverlay = null;
      return;
    }
    tileDebugOverlay ??= createThreeTilesDebugOverlay(tiles.group);
    const volumes = [...tiles.activeTiles].flatMap((tile) => {
      const runtimeTile = tile as RuntimeTile;
      const bounds = runtimeTile.engineData?.boundingVolume;
      if (!bounds?.getAABB) return [];
      const box = new THREE.Box3();
      bounds.getAABB(box);
      if (box.isEmpty()) return [];
      return [
        {
          id: getTileDebugId(tile),
          bounds: box,
          loadReason: getTileLoadReason(runtimeTile),
        },
      ];
    });
    tileDebugOverlay.update(volumes);
  };
  const handleUpdateAfter = () => {
    const currentTiles = tiles;
    if (!currentTiles) return;
    const cache = currentTiles.lruCache as RuntimeLruCache;
    // A traversal skipped by the change gate never schedules the eviction
    // that would bring the cache back to its retention floor.
    const traversalRan = currentTiles.frameCount !== lastTraversalFrameCount;
    lastTraversalFrameCount = currentTiles.frameCount;
    if (!traversalRan && cache.cachedBytes > cache.minBytesSize) {
      cache.scheduleUnload();
    }
    const entriesBeforeUnload = cache.itemSet.size;
    queueMicrotask(() => {
      if (tiles !== currentTiles) return;
      if (cache.itemSet.size < entriesBeforeUnload) {
        currentTiles.dispatchEvent({ type: "needs-update" });
      }
    });
  };

  const layer: ThreeTilesRuntime = {
    id: layerId,
    originLngLat,
    root: orientationGroup,
    providesTerrain: options.providesTerrain === true,
    receivesMapStyleTexture:
      options.providesTerrain === true
        ? (material) => !isRenderedBuildingSurface(material)
        : false,
    mapStyleProjectionVersion: () => mapStyleProjectionVersion,
    originMerc,
    mScale,

    onAdd(mapInstance: MaplibreMap) {
      map = mapInstance;
      if (tiles) return;

      tiles = new TilesRenderer(tilesetUrl) as RuntimeTilesRenderer;
      const tileCache = new LRUCache();
      tileCache.unloadPriorityCallback =
        tilesCacheUnloadPriorityCallback as typeof tileCache.unloadPriorityCallback;
      const downloadQueue = new DownloadPriorityQueue();
      downloadQueue.priorityCallback = tilesQueuePriorityCallback;
      const parseQueue = new PriorityQueue();
      parseQueue.priorityCallback = tilesQueuePriorityCallback;
      const processNodeQueue = new PriorityQueue();
      processNodeQueue.priorityCallback = tilesNodeQueuePriorityCallback;
      tiles.lruCache = tileCache;
      tiles.downloadQueue = downloadQueue;
      tiles.parseQueue = parseQueue;
      tiles.processNodeQueue = processNodeQueue;
      // D2: admission registers a predicted size so the cache fills before
      // downloads finish; measured content carries the resident overhead.
      const calculateBytesUsed = tiles.calculateBytesUsed.bind(tiles);
      tiles.calculateBytesUsed = (tile, scene) => {
        const measured = calculateBytesUsed(tile, scene);
        if (measured !== null && measured > 0) {
          return Math.round(measured * TILES_LOAD_POLICY.residentOverhead);
        }
        return bytesPredictor.predict({
          url: resolveTileContentUrl(tile),
          geometricError: tile.geometricError,
          isExternalTileset: tile.internal.hasUnrenderableContent,
        });
      };
      // D1: the deferral decision rides on upstream's per-frame view error.
      const calculateTileViewErrorWithPlugin =
        tiles.calculateTileViewErrorWithPlugin.bind(tiles);
      tiles.calculateTileViewErrorWithPlugin = (tile, target) => {
        calculateTileViewErrorWithPlugin(tile, target);
        const runtimeTile = tile as RuntimeTile;
        runtimeTile.shadowReceiverCenterness = undefined;
        runtimeTile.shadowLightFacing = undefined;
        runtimeTile.shadowReceiverCurrent = undefined;
        if (
          shadowSelectionEnabled &&
          shadowReceiverMask &&
          !mainViewSourceTiles.has(tile) &&
          !isTileInMainView(runtimeTile)
        ) {
          const bounds = runtimeTile.engineData?.boundingVolume;
          if (bounds?.getAABB) {
            bounds.getAABB(tileBoundingBox);
            const matchedCurrent = applyShadowReceiverMask(
              shadowReceiverMask,
              tileBoundingBox,
              target,
              shadowReceiverMatch,
              tile.geometricError,
              effectiveErrorTarget
            );
            const matchedPrevious =
              !matchedCurrent &&
              previousShadowReceiverMask !== null &&
              applyShadowReceiverMask(
                previousShadowReceiverMask,
                tileBoundingBox,
                target,
                shadowReceiverMatch,
                tile.geometricError,
                effectiveErrorTarget
              );
            if (matchedCurrent || matchedPrevious) {
              runtimeTile.shadowReceiverCenterness =
                shadowReceiverMatch.receiverCenterness;
              runtimeTile.shadowLightFacing = shadowReceiverMatch.lightFacing;
              runtimeTile.shadowReceiverCurrent = matchedCurrent;
            }
          }
        }
        applyTileDeferral(tile, target.inView);
      };
      const queueTileForDownload = tiles.queueTileForDownload.bind(tiles);
      tiles.queueTileForDownload = (tile) => {
        const runtimeTile = tile as RuntimeTile;
        // D8: a pending retry or an exhausted budget keeps the parent as the
        // fallback instead of re-requesting the tile every frame.
        if (tileRetries.isBlocked(tile)) return;
        // Keep the last complete shadow path active across a camera move, but
        // do not spend bandwidth extending that stale path. Once the main
        // viewport is near its target, the receiver mask is replaced and the
        // new offscreen caster traversal may request content.
        if (
          shadowSelectionRefreshPending &&
          runtimeTile.shadowReceiverCenterness !== undefined &&
          !isTileInMainView(runtimeTile)
        ) {
          return;
        }
        if (runtimeTile.shadowReceiverCurrent === false) return;
        // D7: REPLACE content that refines unconditionally is never displayed.
        if (
          tile.refine === "REPLACE" &&
          (tile as RuntimeTile).traversal?.unconditionallyRefine === true &&
          tile.internal.hasRenderableContent
        ) {
          return;
        }
        assignTilePriority(runtimeTile);
        queueTileForDownload(tile);
      };
      // 3D Tiles 1.1 implicit tiling (template URIs) is plugin-based
      tiles.registerPlugin(new ImplicitTilingPlugin());
      tiles.registerPlugin(new UpdateOnChangePlugin());
      // Mesh 2020 ships glTF 1.0 b3dm — upgrade payloads on the fly. The raw
      // response feeds the wire-size sampling of the request concurrency.
      tiles.registerPlugin(
        new Gltf1UpgradePlugin({ onResponse: handleWireBytes })
      );
      // Draco-compressed glTF payloads need an explicit decoder
      dracoLoader = new DRACOLoader();
      dracoLoader.setDecoderPath(
        "https://www.gstatic.com/draco/versioned/decoders/1.5.6/"
      );
      tiles.registerPlugin(
        new GLTFExtensionsPlugin({
          dracoLoader,
          plugins: [
            (parser: unknown) =>
              buildPrimitiveOutlinePlugin(parser, {
                color: outlineColor,
                opacity: outlineOpacity,
              }),
          ],
        })
      );
      syncTileDebugOverlay();
      // Reorient the ECEF tileset into the local scene frame at the
      // layer origin: ENU with +Y up, north toward -Z — matching the
      // point cloud layers (x east, y up, z south).
      tiles.registerPlugin(
        new ReorientationPlugin({
          lat: degToRadNumeric(originLngLat[1]),
          lon: degToRadNumeric(originLngLat[0]),
          height: 0,
        })
      );

      tiles.loadSiblings = false;
      tiles.loadAncestors = true;
      tiles.displayActiveTiles = true;
      applyRequestConcurrency();
      tiles.parseQueue.maxJobs = 4;
      tiles.processNodeQueue.maxJobs = 48;
      tiles.maxTilesProcessed = 1_000;
      applyCacheBudget();
      effectiveErrorTarget = requestedErrorTarget;
      tiles.errorTarget = effectiveErrorTarget;
      offsetGroup.add(tiles.group);

      // Request frames until the root tileset arrived (`load-tileset`) or
      // tile work started; a hidden runtime does not ask for frames.
      kickstartTimer = window.setInterval(() => {
        if (!tiles || tiles.stats.downloading > 0 || tiles.stats.parsing > 0) {
          clearKickstartTimer();
          return;
        }
        if (!runtimeVisible) return;
        requestRender();
      }, KICKSTART_INTERVAL_MS);
      tiles.addEventListener("needs-update", requestRender);
      tiles.addEventListener("load-tileset", handleTilesetLoad);
      tiles.addEventListener("update-after", handleUpdateAfter);
      tiles.addEventListener("load-model", handleModelLoad);
      tiles.addEventListener("dispose-model", handleModelDispose);
      tiles.addEventListener("load-error", handleLoadError);
      tiles.addEventListener("tiles-load-end", handleTilesLoadEnd);
      unsubscribeTerrainLoading = subscribeSharedThreeTerrainLoading(
        map,
        () => {
          applyRequestConcurrency();
          if (tiles && tiles.downloadQueue.maxJobsPerOrigin > 0) {
            runDownloadQueues();
          }
          tiles?.dispatchEvent({ type: "needs-update" });
          requestRender();
        }
      );
      map.on("movestart", handleViewStart);
      map.on("moveend", handleViewEnd);
      map.on("resize", handleViewEnd);
      document.addEventListener("visibilitychange", handleVisibilityChange);
    },

    update(frame: SharedThreeSceneFrame) {
      if (!runtimeVisible || !tiles || !map) return;
      syncProjector();
      try {
        const viewCamera = resolveTilesViewCamera(
          frame.renderCamera,
          frame.lodCamera
        );
        if (!cameraSet) {
          cameraSet = createTilesCameraSet(tiles, viewCamera);
        }
        cameraSet.update(viewCamera, frame.viewport.x, frame.viewport.y);
        prepareViewFrustums(viewCamera);
        const completingShadowTraversal = shadowSelectionNeedsTraversal;
        tiles.update();
        syncTileDebugOverlay();
        if (completingShadowTraversal) shadowSelectionNeedsTraversal = false;
        maybeFinalizeShadowSelection();
        if (!shadowSelectionEnabled) measureUsedBytesMain();
        lastMainViewConverged = mainViewConverged();
        applyErrorTargetPolicy();
        applyRequestConcurrency();
        if (viewQualityAuditPasses > 0) {
          viewQualityAuditPasses -= 1;
          if (viewQualityAuditPasses > 0) {
            tiles.dispatchEvent({ type: "needs-update" });
          }
        }
        maybeEnableShadowSelection();
      } catch (error) {
        console.error("[tiles3d] update failed:", error);
      }
      prioritizeQueuedTiles();

      // Keep rendering while the tile pipeline has work. Queued downloads
      // only count while downloads run; the backoff and terrain listeners
      // wake the loop once they may start.
      const { stats } = tiles;
      const processNodeQueue =
        tiles.processNodeQueue as typeof tiles.processNodeQueue & {
          items: unknown[];
          currJobs: number;
        };
      if (
        (stats.queued > 0 && tiles.downloadQueue.maxJobsPerOrigin > 0) ||
        stats.downloading > 0 ||
        stats.parsing > 0 ||
        processNodeQueue.items.length > 0 ||
        processNodeQueue.currJobs > 0 ||
        viewQualityAuditPasses > 0
      ) {
        map.triggerRepaint();
      }
      notifyRequestStateChange();
    },

    setVisible(visible: boolean) {
      if (runtimeVisible === visible) return;
      runtimeVisible = visible;
      orientationGroup.visible = visible;
      notifyRequestStateChange();
      if (!visible) {
        clearErrorTargetTimer();
        viewQualityAuditPasses = 0;
        map?.triggerRepaint();
        return;
      }
      viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
      tiles?.dispatchEvent({ type: "needs-update" });
      map?.triggerRepaint();
    },

    setHeightOffset(offsetMeters: number) {
      offsetGroup.position.y = offsetMeters;
      map?.triggerRepaint();
    },

    setErrorTarget(errorTarget: number) {
      const nextErrorTarget = clamp(
        errorTarget,
        TILES_ERROR_TARGET_MIN_PIXELS,
        TILES_ERROR_TARGET_MAX_PIXELS
      );
      // shadow-scene re-applies the same requested target on every content
      // change; only a changed request resets a relaxed effective target.
      if (requestedErrorTarget === nextErrorTarget) return;
      requestedErrorTarget = nextErrorTarget;
      resetEffectiveErrorTarget();
      viewRefinementPending = true;
      requestShadowSelectionRefresh();
      viewQualityAuditPasses = VIEW_QUALITY_AUDIT_PASSES;
      tiles?.dispatchEvent({ type: "needs-update" });
    },

    setShadowSimulationStyle(style) {
      if (!options.shadowBuildingStyle) return;
      if (shadowStylesEqual(shadowSimulationStyle, style)) return;
      shadowSimulationStyle = style;
      // Reapply one bounded cache policy when shadow mode changes. The shadow
      // camera may add off-screen casters, but it must not create a separate
      // download-admission ceiling or bypass the memory limit.
      applyCacheBudget();
      if (style?.uniformColor) shadowClayColor.set(style.uniformColor);
      refreshRenderedMaterials(orientationGroup);
      applyOutlineVisibility(orientationGroup);
      map?.triggerRepaint();
    },

    setProjector(projector) {
      activeProjector = projector;
      syncProjector();
      map?.triggerRepaint();
    },

    setShadowView(view) {
      const nextSignature = getSharedThreeShadowViewSignature(view);
      if (nextSignature === shadowViewSignature) return;
      shadowViewSignature = nextSignature;
      shadowView = view;
      viewRefinementPending = view !== null;
      if (view) {
        requestShadowSelectionRefresh();
      } else {
        setShadowSelectionEnabled(false);
      }
      applyRequestConcurrency();
      tiles?.dispatchEvent({ type: "needs-update" });
      notifyRequestStateChange();
    },

    setWhiteShading(white: boolean) {
      whiteShading = white;
      refreshRenderedMaterials(orientationGroup);
      map?.triggerRepaint();
    },

    setClayMaterial(options: ClayMaterialOptions) {
      if (options.color !== undefined) clayColor.set(options.color);
      if (options.roughness !== undefined) {
        clayRoughness = clamp(options.roughness, 0, 1);
      }
      if (options.metalness !== undefined) {
        clayMetalness = clamp(options.metalness, 0, 1);
      }
      for (const state of clayMaterialStates.values()) {
        for (const material of asMaterialArray(state.clay)) {
          if (!(material instanceof THREE.MeshStandardMaterial)) continue;
          material.color.copy(clayColor);
          material.roughness = clayRoughness;
          material.metalness = clayMetalness;
          material.needsUpdate = true;
        }
      }
      refreshRenderedMaterials(orientationGroup);
      map?.triggerRepaint();
    },

    setClayColor(color: string) {
      layer.setClayMaterial({ color });
    },

    setOpacity(nextOpacity: number) {
      opacity = clamp(nextOpacity, 0, 1);
      refreshRenderedMaterials(orientationGroup);
      map?.triggerRepaint();
    },

    setWireframe(enabled: boolean) {
      wireframe = enabled;
      refreshRenderedMaterials(orientationGroup);
      map?.triggerRepaint();
    },

    setOutlineVisible(visible: boolean) {
      outlineVisible = visible;
      applyOutlineVisibility(orientationGroup);
      map?.triggerRepaint();
    },

    setOutlineStyle(style: OutlineStyleOptions) {
      if (style.color !== undefined) outlineColor = style.color;
      if (style.opacity !== undefined) {
        outlineOpacity = clamp(style.opacity, 0, 1);
      }
      applyOutlineStyle(orientationGroup);
      map?.triggerRepaint();
    },

    setTileBoundsVisible(enabled: boolean) {
      if (tileBoundsVisible === enabled) return;
      tileBoundsVisible = enabled;
      syncTileDebugOverlay();
      tiles?.dispatchEvent({ type: "needs-update" });
      map?.triggerRepaint();
    },

    setCacheBudget(bytes?: number, cacheOptions?: CacheBudgetOptions) {
      styleCacheBudgetBytes =
        bytes === undefined ? undefined : Math.max(0, Math.floor(bytes));
      styleCacheOverflowBytes =
        cacheOptions?.overflowBytes === undefined
          ? undefined
          : Math.max(0, Math.floor(cacheOptions.overflowBytes));
      ceilingBytes = resolveTilesCacheCeiling(deviceProfile, {
        cacheBudgetBytes: styleCacheBudgetBytes,
        cacheOverflowBytes: styleCacheOverflowBytes,
      });
      resetEffectiveErrorTarget();
      viewRefinementPending = true;
      requestShadowSelectionRefresh();
      applyCacheBudget();
      applyRequestConcurrency();
      tiles?.dispatchEvent({ type: "needs-update" });
    },

    setRequestConcurrency(jobs: number) {
      const nextConcurrency = Math.max(0, Math.floor(jobs));
      const changed = nextConcurrency !== requestConcurrency;
      requestConcurrency = nextConcurrency;
      if (!tiles) return;
      applyRequestConcurrency();
      if (tiles.downloadQueue.maxJobsPerOrigin > 0) {
        runDownloadQueues();
      }
      if (changed) tiles.dispatchEvent({ type: "needs-update" });
    },

    getRequestDemand,
    getViewElevationRange,
    getActiveTileVolumes,
    hasRenderableContent: () => {
      let renderable = false;
      tiles?.group.traverse((object) => {
        if ((object as THREE.Mesh).isMesh && object.visible) renderable = true;
      });
      return renderable;
    },

    dispose() {
      disposed = true;
      clearErrorTargetTimer();
      clearHiddenWipeTimer();
      clearKickstartTimer();
      resetDeferredTiles();
      if (requestBackoffTimer) {
        window.clearTimeout(requestBackoffTimer);
        requestBackoffTimer = 0;
      }
      map?.off("movestart", handleViewStart);
      map?.off("moveend", handleViewEnd);
      map?.off("resize", handleViewEnd);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      unsubscribeTerrainLoading?.();
      unsubscribeTerrainLoading = null;
      tiles?.removeEventListener("needs-update", requestRender);
      tiles?.removeEventListener("load-tileset", handleTilesetLoad);
      tiles?.removeEventListener("update-after", handleUpdateAfter);
      tiles?.removeEventListener("load-model", handleModelLoad);
      tiles?.removeEventListener("dispose-model", handleModelDispose);
      tiles?.removeEventListener("load-error", handleLoadError);
      tiles?.removeEventListener("tiles-load-end", handleTilesLoadEnd);
      cameraSet?.dispose();
      cameraSet = null;
      tileRetries.dispose();
      // The material states are keyed by mesh, so release them directly
      // instead of searching the scene graph for their meshes.
      for (const [mesh, state] of clayMaterialStates) {
        disposeClayState(mesh, state);
      }
      for (const [mesh, state] of litTextureMaterialStates) {
        disposeLitTextureState(mesh, state);
      }
      restoreShadowSides();
      tileDebugOverlay?.dispose();
      tileDebugOverlay = null;
      tiles?.dispose();
      tiles = null;
      dracoLoader?.dispose();
      dracoLoader = null;
      orientationGroup.clear();
      flatTerrainNormalMap?.dispose();
      map = null;
    },
  };

  return layer;
}

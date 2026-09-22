import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Camera,
  type ColorRepresentation,
  FrontSide,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Sphere,
  Vector3,
  WebGLCoordinateSystem,
} from "three";

import { quantize } from "@carma-commons/math";
import type { RasterDemTerrainResource } from "@carma-commons/resources";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import { getWorkerProbeLimit } from "@carma-commons/worker-scaling";
import { geographicBoundsIntersect } from "@carma-geo/helpers";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import {
  getTileBounds,
  latitudeToTileY,
  longitudeToTileX,
} from "../../core/raster-dem-tile";
import {
  MAXIMUM_RASTER_MESH_ERROR_METERS,
  resolveRasterMeshErrorMeters,
} from "../../core/raster-mesh-error";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowView,
  SharedThreeSceneTileVolume,
} from "../../core/shared-three-scene-types";
import { getSharedThreeShadowViewSignature } from "../../core/shared-three-shadow-view";
import {
  planTerrainIdlePrefetch,
  planTerrainIdleShadowRegion,
  TERRAIN_IDLE_SHADOW_REASON,
  type TerrainIdleShadowReason,
} from "../../core/terrain-idle-prefetch";
import {
  NO_DATA_EPSILON_METERS,
  terrainHeightRangeExcludesNoData,
} from "../../core/terrain-no-data";
import {
  getTerrainScreenErrorColor,
  getTerrainScreenErrorRatio,
} from "../../core/terrain-screen-error";
import {
  buildTerrainSelection,
  buildTerrainTileLocalBox,
  type TerrainSelection,
  type TerrainSelectionEntry,
  type TerrainSelectionInput,
} from "../../core/terrain-selection";
import { createTerrainTileHeightSampler } from "../../core/terrain-tile-height-sampler";
import {
  createTileCameraDemand,
  TILE_CAMERA_PRIORITY,
  type TileCameraSnapshot,
  tileCameraViewsSignature,
} from "../../core/tile-camera-demand";
import { planTileLoadStages } from "../../core/tile-load-plan";
import {
  createPayloadAwareRequestConcurrency,
  DEFAULT_MAXIMUM_REQUEST_CONCURRENCY,
} from "./payload-aware-request-concurrency";
import {
  acquireRasterDemTerrainTileSource,
  isConfirmedTerrainServerError,
  type RasterDemTerrainTileSource,
  type TerrainTile,
  type TerrainTileBounds,
  type TerrainTileId,
  terrainTileKey,
} from "./raster-dem-terrain-tile-source";
import {
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";
import {
  runBatchedTerrainBoundaryStitch,
  type TerrainBoundaryStitchState,
  type TerrainStitchInput,
} from "./terrain-boundary-stitch";
import { createTerrainHeightMetadataIndex } from "./terrain-height-metadata-index";
import {
  advanceTerrainTileFrontier,
  terrainTileContains,
} from "./terrain-tile-frontier";
import { runTerrainWorkerTask } from "./terrain-worker-client";
import type { TerrainWorkerResult } from "./terrain-worker-task";

// The runtime chunk owns preparation orchestration outside the worker graph.
const producerAssetUrl =
  resolveDerivedCacheAssetEpoch({
    production: import.meta.env.PROD,
    assetUrl: import.meta.url,
  }) ?? undefined;

const DEFAULT_TERRAIN_COLOR = 0xd8d1c4;
const DEFAULT_ERROR_TARGET_PIXELS = 2.5;
// Same screen-space raster-spacing metric as final selection, not a certified
// vertical DEM error bound. Refine the coverage-first cut to 16 px before
// final-detail work; the very first coverage cut may intentionally be coarser.
const INITIAL_ERROR_TARGET_PIXELS = 16;
/** How long the view has to hold still before the configured target is used. */
const MOTION_SETTLE_MS = 250;
const DEFAULT_SHADOW_LEVEL_OFFSET = 2;
const DEFAULT_MINIMUM_LEVEL = 8;
const DEFAULT_MAX_SELECTION_TILES = 192;
// Network concurrency is independent of the adaptive CPU worker pool.
const MAXIMUM_REQUEST_CONCURRENCY = Math.min(
  24,
  DEFAULT_MAXIMUM_REQUEST_CONCURRENCY
);
const DEFAULT_REQUEST_CONCURRENCY = MAXIMUM_REQUEST_CONCURRENCY;
const DEFAULT_MAX_CACHED_MESHES = 256;
const TERRAIN_UPDATE_PRIORITY = 100;
const UNKNOWN_TERRAIN_HEIGHT_RANGE_METERS = [-1_000, 10_000] as const;
const PUBLICATION_BATCH_DELAY_MS = 32;
const MAXIMUM_IDLE_SHADOW_GEOMETRY_BYTES = 32 * 1024 * 1024;
const IDLE_SHADOW_VALIDATION_CHUNK_VERTICES = 16_384;

export type TerrainIdleShadowRegion = Readonly<{
  id: string;
  terrainLevel: number;
  receiverBounds: Box3;
}>;

export type TerrainIdleShadowLease = Readonly<{
  /** False after cancellation/disposal, even if preparation originally succeeded. */
  covered: boolean;
  /** Detached, depth-only surface; the host owns temporary scene attachment. */
  group: Group | null;
  dependencyBounds: readonly Box3[];
  reason?: TerrainIdleShadowReason;
  isCurrent: () => boolean;
  dispose: () => void;
}>;

export type RasterDemTerrainMaterialOptions = Readonly<{
  color?: ColorRepresentation;
}>;

export type RasterDemTerrainRuntimeOptions = Readonly<{
  /** Unlit per-tile observer SSE / target coloring; no additional geometry. */
  debugScreenError?: boolean;
  errorTargetPixels?: number;
  /**
   * Target to select with while the view keeps changing; the configured
   * `errorTargetPixels` is reached once it settles. A fine target spends the
   * whole tile budget on levels the next camera change discards, so the coarse
   * ladder converges slower than it could. Omitted keeps one target always.
   */
  motionErrorTargetPixels?: number;
  shadowLevelOffset?: number;
  minimumLevel?: number;
  maximumLevel?: number;
  maxSelectionTiles?: number;
  requestConcurrency?: number;
  maxCacheBytes?: number;
  maxCachedMeshes?: number;
  /** Prepared CPU/GPU cache budget; published and requested coverage stays pinned. */
  maxCachedMeshBytes?: number;
  /** Number of height-grid segments per tile used by the Three.js terrain. */
  meshSegments?: number;
  /** Explicit lossy mobile baseline ceiling; omitted preserves native residual accuracy. */
  maximumMeshSegments?: number;
  /** Additional reconstruction residual; source-LOD pixel spacing is separate. */
  maximumMeshErrorMeters?: number;
  /** Source-specific height that denotes missing terrain coverage. */
  noDataHeightMeters?: number;
  /** Conservative elevation range used until a tile or ancestor is loaded. */
  heightRangeMeters?: readonly [minimum: number, maximum: number];
  /** Symmetric local-metre padding for bounds when shaders deform vertices. */
  boundsPaddingMeters?: readonly [x: number, y: number, z: number];
  material?: RasterDemTerrainMaterialOptions;
  /** Project MapLibre ground styling onto this terrain before lighting. */
  receivesMapStyleTexture?: boolean;
  /** Published old-union-new bounds, including stitched normals/topology changes. */
  onContentChanged?: (changedBounds: readonly Box3[]) => void;
  onError?: (error: unknown) => void;
}>;

export interface RasterDemTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
  getIdlePrefetchAvailability: () => Readonly<{
    ready: boolean;
    remaining: number;
  }>;
  /** Source/derived-cache warming only; never changes the published mesh cut. */
  prefetchIdleTerrain: (signal?: AbortSignal) => Promise<
    Readonly<{
      /** Computed/restored and offered to the bounded cache, not guaranteed persisted. */
      prepared: number;
      failed: number;
      remaining: number;
      aborted: boolean;
    }>
  >;
  getIdleShadowRegions: () => readonly TerrainIdleShadowRegion[];
  /** One isolated lease at a time; never changes the published terrain cut. */
  prepareIdleShadowRegion: (
    region: Readonly<{
      receiverBounds: Box3;
      /** Host-computed finite-disc/guard-widened receiver-to-light corridor. */
      casterBounds: Box3;
      terrainLevel: number;
    }>,
    signal?: AbortSignal
  ) => Promise<TerrainIdleShadowLease>;
  /** Move the previous visible cut into this runtime before disposing it. */
  adoptPresentation: (previous: RasterDemTerrainRuntime) => void;
  setShadowView: (view: SharedThreeSceneShadowView | null) => void;
  setMaterialColor: (color: ColorRepresentation) => void;
  getElevation: (longitude: number, latitude: number) => number | undefined;
  getViewElevationRange: (
    camera: Camera
  ) => readonly [minimum: number, maximum: number] | null;
  getViewSourceHeightRange: (
    camera: Camera
  ) => readonly [minimum: number, maximum: number] | null;
  getActiveTileVolumes: () => readonly SharedThreeSceneTileVolume[];
}

type TerrainMeshRecord = {
  equalLevelShell?: TerrainStitchInput;
  equalLevelSignature?: string;
  debugMaterial?: MeshLambertMaterial;
  node: Group;
  reliefMesh: Mesh | null;
  /** Immutable cache geometry; never feed a previous transition topology back in. */
  stitchBase: {
    positions: Float32Array;
    normals: Float32Array;
    indices: Uint16Array | Uint32Array;
  } | null;
  boundaryEdges: TerrainBoundaryEdges;
  boundaryBaseHeights: Record<TerrainBoundarySide, Float32Array>;
  sourceByteLength: number;
  lastUsed: number;
  id: TerrainTileId;
  heightBounds: TerrainTileBounds | null;
  sampleHeight: ReturnType<typeof createTerrainTileHeightSampler>;
  minimumHeightMeters: number;
  maximumHeightMeters: number;
};

type TerrainBoundarySide = "west" | "south" | "east" | "north";

type TerrainBoundaryEdges = Record<TerrainBoundarySide, Uint32Array>;

const terrainSelectionKey = ({ id, kind }: TerrainSelectionEntry) =>
  `${kind}:${terrainTileKey(id)}`;

// Ownership transfer stays private to raster terrain runtimes. Weak keys do not
// keep a disposed scene alive, and no full geometry arrays need to be copied.
const takePresentations = new WeakMap<
  SharedThreeSceneRuntime["root"],
  () => TerrainMeshRecord[]
>();

const clampInteger = (
  value: number | undefined,
  fallback: number,
  minimum: number
) => Math.max(minimum, Math.floor(value ?? fallback));

const normalizeShadowMapSize = (
  shadowMapSize: SharedThreeSceneShadowView["shadowMapSize"]
): SharedThreeSceneShadowView["shadowMapSize"] => ({
  width:
    Number.isFinite(shadowMapSize.width) && shadowMapSize.width > 0
      ? shadowMapSize.width
      : 1,
  height:
    Number.isFinite(shadowMapSize.height) && shadowMapSize.height > 0
      ? shadowMapSize.height
      : 1,
});

const getFiniteHeightRange = (
  heights: ArrayLike<number>,
  excludedHeightMeters?: number
): readonly [minimum: number, maximum: number] | null => {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (
      !Number.isFinite(height) ||
      (excludedHeightMeters !== undefined &&
        Math.abs(height - excludedHeightMeters) <= NO_DATA_EPSILON_METERS)
    )
      continue;
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  return Number.isFinite(minimum) && Number.isFinite(maximum)
    ? [minimum, maximum]
    : null;
};

const getViewportBounds = (map: MaplibreMap): TerrainTileBounds => {
  const bounds = map.getBounds();
  return {
    west: bounds.getWest(),
    south: bounds.getSouth(),
    east: bounds.getEast(),
    north: bounds.getNorth(),
  };
};

const cameraFrustumBounds = (
  camera: Camera | TileCameraSnapshot,
  root: Group,
  origin: MercatorCoordinate,
  meterScale: number
): TerrainTileBounds | null => {
  if (camera instanceof Camera) camera.updateWorldMatrix(true, false);
  const projection =
    camera instanceof Camera
      ? camera.projectionMatrix
      : new Matrix4().fromArray(camera.projectionMatrix);
  const world =
    camera instanceof Camera
      ? camera.matrixWorld
      : new Matrix4().fromArray(camera.matrixWorld);
  const clipToWorld = world.clone().multiply(projection.clone().invert());
  root.updateMatrixWorld(true);
  const localFromWorld = new Matrix4().copy(root.matrixWorld).invert();
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [
        camera.coordinateSystem === WebGLCoordinateSystem &&
        !camera.reversedDepth
          ? -1
          : 0,
        1,
      ]) {
        const local = new Vector3(x, y, z)
          .applyMatrix4(clipToWorld)
          .applyMatrix4(localFromWorld);
        const lngLat = new MercatorCoordinate(
          origin.x + local.x * meterScale,
          origin.y + local.z * meterScale,
          0
        ).toLngLat();
        west = Math.min(west, lngLat.lng);
        south = Math.min(south, lngLat.lat);
        east = Math.max(east, lngLat.lng);
        north = Math.max(north, lngLat.lat);
      }
    }
  }
  return [west, south, east, north].every(Number.isFinite)
    ? {
        west: Math.max(-180, west),
        south: Math.max(-90, south),
        east: Math.min(180, east),
        north: Math.min(90, north),
      }
    : null;
};

type ConcurrentLoadFailure<T> = { value: T; error: unknown };

/**
 * Load every value with bounded concurrency. One failed value does not stop
 * the others: the failures come back with the results so the caller can
 * retry them without losing what did arrive.
 */
const loadWithConcurrency = async <T, R>(
  values: readonly T[],
  concurrency: number,
  load: (value: T) => Promise<R>,
  onLoaded?: (value: T, result: R) => void
): Promise<{
  results: Array<R | undefined>;
  failures: ConcurrentLoadFailure<T>[];
}> => {
  const results = new Array<R | undefined>(values.length);
  const failures: ConcurrentLoadFailure<T>[] = [];
  let cursor = 0;
  const worker = async () => {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      const value = values[index];
      try {
        const result = await load(value);
        results[index] = result;
        onLoaded?.(value, result);
      } catch (error) {
        failures.push({ value, error });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker)
  );
  return { results, failures };
};

const SELECTION_RETRY_BASE_DELAY_MS = 1_000;
const SELECTION_RETRY_MAX_DELAY_MS = 30_000;

export const buildRasterDemTerrainRuntime = (
  runtimeId: string,
  terrainSourceConfig: RasterDemTerrainResource,
  originLngLat: [number, number],
  options: RasterDemTerrainRuntimeOptions = {}
): RasterDemTerrainRuntime => {
  const meshSegments = Math.min(
    terrainSourceConfig.tileSize,
    clampInteger(options.maximumMeshSegments, terrainSourceConfig.tileSize, 16)
  );
  let errorTargetPixels = Math.max(
    0.1,
    options.errorTargetPixels ?? DEFAULT_ERROR_TARGET_PIXELS
  );
  const motionErrorTargetPixels =
    options.motionErrorTargetPixels === undefined
      ? null
      : Math.max(0.1, options.motionErrorTargetPixels);
  let motionSettleTimer: ReturnType<typeof setTimeout> | null = null;
  /** True between the map's movestart and the settle after its moveend. */
  let mapMoving = false;
  /**
   * Coarse while the map is actually moving, configured once it holds still.
   * Keying this on the camera signature instead would coarsen the cut again on
   * any repaint that nudges a matrix, and the published tiles would flip
   * between a parent and its children.
   */
  const effectiveErrorTargetPixels = () =>
    motionErrorTargetPixels !== null && mapMoving
      ? Math.max(errorTargetPixels, motionErrorTargetPixels)
      : errorTargetPixels;
  const minimumLevel = clampInteger(
    options.minimumLevel,
    Math.max(DEFAULT_MINIMUM_LEVEL, terrainSourceConfig.minzoom),
    terrainSourceConfig.minzoom
  );
  const maximumLevel = Math.min(
    terrainSourceConfig.maxzoom,
    Math.max(
      minimumLevel,
      clampInteger(options.maximumLevel, terrainSourceConfig.maxzoom, 0)
    )
  );
  const shadowLevelOffset = clampInteger(
    options.shadowLevelOffset,
    DEFAULT_SHADOW_LEVEL_OFFSET,
    0
  );
  const maxSelectionTiles = clampInteger(
    options.maxSelectionTiles,
    DEFAULT_MAX_SELECTION_TILES,
    1
  );
  const requestConcurrency = Math.min(
    MAXIMUM_REQUEST_CONCURRENCY,
    clampInteger(options.requestConcurrency, DEFAULT_REQUEST_CONCURRENCY, 1)
  );
  const maxCachedMeshes = clampInteger(
    options.maxCachedMeshes,
    DEFAULT_MAX_CACHED_MESHES,
    1
  );
  const maxCachedMeshBytes = clampInteger(
    options.maxCachedMeshBytes,
    256 * 1024 * 1024,
    1
  );
  if (
    options.noDataHeightMeters !== undefined &&
    !Number.isFinite(options.noDataHeightMeters)
  ) {
    throw new RangeError("Terrain no-data height must be finite");
  }
  if (
    options.heightRangeMeters &&
    (!Number.isFinite(options.heightRangeMeters[0]) ||
      !Number.isFinite(options.heightRangeMeters[1]) ||
      options.heightRangeMeters[0] > options.heightRangeMeters[1])
  ) {
    throw new RangeError("Terrain height range must be finite and ordered");
  }
  if (
    options.boundsPaddingMeters?.some(
      (padding) => !Number.isFinite(padding) || padding < 0
    )
  ) {
    throw new RangeError(
      "Terrain bounds padding must be finite and non-negative"
    );
  }
  const noDataHeightMeters = options.noDataHeightMeters;
  const boundsPaddingMeters = new Vector3(
    ...(options.boundsPaddingMeters ?? [0, 0, 0])
  );
  const unknownTerrainHeightRange =
    options.heightRangeMeters ?? UNKNOWN_TERRAIN_HEIGHT_RANGE_METERS;
  const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const maximumMeshErrorMeters = resolveRasterMeshErrorMeters(
    options.maximumMeshErrorMeters
  );
  const heightMetadata = createTerrainHeightMetadataIndex(
    JSON.stringify([terrainSourceConfig, noDataHeightMeters]),
    {
      producerAssetUrl,
      onRestored: () => {
        if (disposed) return;
        selectionInputSignature = "";
        map?.triggerRepaint();
      },
    }
  );
  const payloadAwareConcurrency = createPayloadAwareRequestConcurrency();
  const root = new Group();
  root.name = `${runtimeId}-root`;
  const material = new MeshLambertMaterial({
    color: options.material?.color ?? DEFAULT_TERRAIN_COLOR,
    side: FrontSide,
    // The terrain is an open upward-wound surface, unlike closed building
    // extrusions. Cast its visible top faces directly instead of Three.js's
    // default opposite-side pass, which requires a closed volume.
    shadowSide: FrontSide,
  });
  // Decision: OFFSCREEN-CASTERS-20260910 in
  // libraries/mapping/shadow-simulation/three/TILED_SHADOW_PAGES.md.
  // Keep depth geometry resident, but never light or project basemap colour
  // onto a tile outside the observer frustum. No per-tile texture is needed.
  const casterMaterial = new MeshBasicMaterial({
    side: FrontSide,
    shadowSide: FrontSide,
    colorWrite: false,
    depthWrite: false,
  });
  let mapStyleProjectionVersion = 0;
  const sourcePromise = acquireRasterDemTerrainTileSource(terrainSourceConfig, {
    maxCacheBytes: options.maxCacheBytes,
    // Profile segment caps are not a residual guarantee. The worker now chooses
    // native/half/quarter from the same full-resolution source and a measured
    // error bound; progressive source-LOD stages still fill the screen first.
    // Only the explicit mobile ceiling opts into a coarser source grid.
    meshSegments,
    maximumMeshSegments: options.maximumMeshSegments,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  const debugCameraPosition = new Vector3();
  const debugLocalCamera = new Vector3();
  const debugInverseRoot = new Matrix4();
  const debugLocalBounds = new Box3();
  let debugViewportHeight = 1;
  let debugFovDegrees = 45;
  let debugErrorDirty = false;
  let source: RasterDemTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let latestRenderCamera: Camera | null = null;
  const observerFrustum = new Frustum();
  const observerProjection = new Matrix4();
  const nextObserverProjection = new Matrix4();
  const identityProjection = new Matrix4();
  let observerFrustumReady = false;
  let tileCameraDemand = createTileCameraDemand([]);
  let tileCameraSignature = "[]";
  let shadowView: SharedThreeSceneShadowView | null = null;
  let previousShadowFrustum: Frustum | null = null;
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let terrainLoading = true;
  let zoomSelectionEntries: readonly TerrainSelectionEntry[] = [];
  let contentChangedSinceFrame = false;
  let publishedShadowGeometry = new Map<
    string,
    { revision: string; bounds: Box3 }
  >();
  let meshUseClock = 0;
  let selectionGeneration = 0;
  let requestedSignature = "";
  // Tiles the server refused for good; they are not asked for again.
  const unavailableTileKeys = new Set<string>();
  let selectionRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let failedSelectionRounds = 0;
  const clearSelectionRetry = () => {
    if (selectionRetryTimer === null) return;
    clearTimeout(selectionRetryTimer);
    selectionRetryTimer = null;
  };
  /**
   * A selection whose tiles partly failed is asked for again after a backoff,
   * so a transient outage leaves no hole once the host recovers. Nothing
   * else re-evaluates a selection while the camera rests.
   */
  const scheduleSelectionRetry = () => {
    if (disposed || selectionRetryTimer !== null) return;
    const retryDelay = Math.min(
      SELECTION_RETRY_MAX_DELAY_MS,
      SELECTION_RETRY_BASE_DELAY_MS * 2 ** failedSelectionRounds
    );
    const delay = Math.max(
      retryDelay,
      payloadAwareConcurrency.getCooldownRemainingMs()
    );
    failedSelectionRounds += 1;
    selectionRetryTimer = setTimeout(() => {
      selectionRetryTimer = null;
      if (disposed) return;
      requestedSignature = "";
      selectionInputSignature = "";
      map?.triggerRepaint();
    }, delay * (1 + Math.random() * 0.5));
  };
  let activeViewportElevationSignature = "";
  // Avoid repeating the full selection walk for an unchanged view.
  let selectionInputSignature = "";
  let selectionRequestPending = false;
  let queuedSelectionInput: TerrainSelectionInput | null = null;
  type PrefetchSelectionView = Readonly<{
    inputSignature: string;
    shadowSignature: string;
    viewportBounds: TerrainTileBounds;
  }>;
  let latestResolvedSelectionView: PrefetchSelectionView | null = null;
  let idlePrefetchSelection:
    | (PrefetchSelectionView & {
        generation: number;
        selection: TerrainSelection;
        entries: readonly TerrainSelectionEntry[];
        /** Shadow candidates survive successful warming and resident mesh hits. */
        shadowEntries: readonly TerrainSelectionEntry[];
        attemptedKeys: Set<string>;
        /** Metadata only; prefetch never retains source/derived geometry buffers. */
        heightRanges: Map<string, readonly [number, number]>;
      })
    | null = null;
  let idlePrefetchController: AbortController | null = null;
  let idleShadowLease: TerrainIdleShadowLease | null = null;
  const invalidateIdlePrefetch = () => {
    idlePrefetchController?.abort();
    idleShadowLease?.dispose();
    idlePrefetchSelection = null;
  };
  const handleIdlePrefetchMovement = () => {
    cancelIdleStitch();
    invalidateIdlePrefetch();
    // Reconfirm even when a gesture ends at the same camera/cut.
    selectionInputSignature = "";
    if (motionErrorTargetPixels === null) return;
    mapMoving = true;
    if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
    motionSettleTimer = null;
  };

  /** The gesture ended: settle, then cut once at the configured target. */
  const handleMovementEnd = () => {
    scheduleIdleStitch();
    if (motionErrorTargetPixels === null) return;
    if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
    motionSettleTimer = setTimeout(() => {
      motionSettleTimer = null;
      if (disposed) return;
      mapMoving = false;
      selectionInputSignature = "";
      map?.triggerRepaint();
    }, MOTION_SETTLE_MS);
  };
  // Keep the latest fitted shadow view separate from the view used by an
  // in-flight selection. Otherwise every progressive terrain stage refits the
  // shadow camera and immediately supersedes the load that produced it.
  let shadowViewSignature = "";
  let selectionShadowViewSignature = "";
  const syncSelectionShadowView = () => {
    if (selectionShadowViewSignature === shadowViewSignature) return;
    selectionShadowViewSignature = shadowViewSignature;
    selectionInputSignature = "";
  };
  let resolveReady: (loaded: boolean) => void = () => undefined;
  let readySettled = false;
  const ready = new Promise<boolean>((resolve) => {
    resolveReady = resolve;
  });

  // Explicitly request durable browser retention after the first usable cut;
  // storage permission and persistence never gate terrain or shadow readiness.
  void ready.then(async (loaded) => {
    if (!loaded || disposed || typeof navigator === "undefined") return;
    try {
      const storage = navigator.storage;
      if (
        typeof storage?.persisted === "function" &&
        typeof storage.persist === "function" &&
        !(await storage.persisted())
      )
        await storage.persist();
    } catch {
      /* Browser storage remains an optional acceleration. */
    }
  });
  const settleReady = (loaded: boolean) => {
    if (readySettled) return;
    readySettled = true;
    resolveReady(loaded);
  };

  const setTerrainLoading = (loading: boolean, fraction = 0) => {
    terrainLoading = loading;
    if (map) setSharedThreeTerrainLoading(map, runtimeId, loading, fraction);
  };

  const projectToLocalWorld = (
    longitude: number,
    latitude: number,
    height: number,
    target: Vector3
  ) => {
    const coordinate = MercatorCoordinate.fromLngLat(
      [longitude, latitude],
      height
    );
    return target.set(
      (coordinate.x - origin.x) / meterScale,
      (coordinate.z - origin.z) / meterScale,
      (coordinate.y - origin.y) / meterScale
    );
  };

  const conversionAbort = new AbortController();
  const createProjectedGeometry = async (
    tile: TerrainTile,
    signal = conversionAbort.signal
  ) => {
    const result = await runTerrainWorkerTask(
      {
        kind: "project",
        tile,
        origin: { x: origin.x, y: origin.y, z: origin.z },
      },
      signal
    );
    if (result.kind !== "project")
      throw new Error("Unexpected terrain projection result");
    return restoreWorkerGeometry(result);
  };

  const restoreWorkerGeometry = (
    result: Omit<Extract<TerrainWorkerResult, { kind: "project" }>, "kind">
  ) => {
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(result.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(result.normals, 3));
    geometry.setIndex(new BufferAttribute(result.indices, 1));
    geometry.boundingBox = new Box3(
      new Vector3().fromArray(result.box.min),
      new Vector3().fromArray(result.box.max)
    );
    geometry.boundingSphere = new Sphere(
      new Vector3().fromArray(result.sphere.center),
      result.sphere.radius
    );
    return geometry;
  };

  /**
   * Per-tile load telemetry for the diagnostics overlay: what a tile cost and
   * where the time went. Bounded, and only kept for tiles the runtime still
   * holds or is still loading.
   */
  type TileLoadStats = {
    bytes: number;
    steps: { label: string; ms: number }[];
    stage: { label: string; startedAt: number } | null;
  };
  const tileStats = new Map<string, TileLoadStats>();
  /** Keys of the cut being loaded, for the diagnostics of the LOD pyramid. */
  let requestedSelectionKeys: ReadonlySet<string> = new Set<string>();
  /** Upper bound on the tiles one diagnostic snapshot reports. */
  const MAXIMUM_REPORTED_TILES = 256;
  const TILE_STATS_LIMIT = 1_024;
  const addTileStep = (key: string, label: string, ms: number) => {
    if (!(ms > 0)) return;
    const stats = tileStats.get(key) ?? { bytes: 0, steps: [], stage: null };
    stats.steps.push({ label, ms });
    tileStats.set(key, stats);
  };
  const markTileStage = (key: string, label: string | null) => {
    const stats = tileStats.get(key) ?? { bytes: 0, steps: [], stage: null };
    const now = performance.now();
    if (stats.stage)
      stats.steps.push({
        label: stats.stage.label,
        ms: now - stats.stage.startedAt,
      });
    stats.stage = label === null ? null : { label, startedAt: now };
    tileStats.set(key, stats);
    if (tileStats.size <= TILE_STATS_LIMIT) return;
    for (const stale of tileStats.keys()) {
      if (tileStats.size <= TILE_STATS_LIMIT) break;
      if (!meshes.has(stale) && !pendingMeshes.has(stale))
        tileStats.delete(stale);
    }
  };

  const loadTerrainEntry = async (
    terrainSource: RasterDemTerrainTileSource,
    entry: TerrainSelectionEntry,
    signal = conversionAbort.signal
  ) => {
    // Preserve the asynchronous dispatch boundary previously supplied by the
    // disk lookup: readiness consumers and cancellation run before caster work.
    await Promise.resolve();
    signal.throwIfAborted();
    const statsKey = terrainSelectionKey(entry);
    let tile: TerrainTile;
    markTileStage(statsKey, null);
    const requestStart = performance.now();
    try {
      const sourceSignal =
        signal === conversionAbort.signal ? undefined : signal;
      tile =
        maximumMeshErrorMeters === MAXIMUM_RASTER_MESH_ERROR_METERS
          ? await (sourceSignal
              ? terrainSource.requestTile(entry.id, sourceSignal)
              : terrainSource.requestTile(entry.id))
          : await terrainSource.requestTile(
              entry.id,
              sourceSignal,
              maximumMeshErrorMeters
            );
      payloadAwareConcurrency.observePayload(tile.byteLength);
      const stats = tileStats.get(statsKey);
      if (stats) stats.bytes = tile.payloadByteLength ?? tile.byteLength;
      // The request covers fetching, decoding and meshing; the worker reports
      // the last two, so what remains is the time on the wire and in the queue.
      const decodeMs = tile.timings?.decodeMs ?? 0;
      const meshMs = tile.timings?.meshMs ?? 0;
      addTileStep(
        statsKey,
        "Laden",
        performance.now() - requestStart - decodeMs - meshMs
      );
      addTileStep(statsKey, "Dekodieren", decodeMs);
      addTileStep(statsKey, "Vermaschen", meshMs);
    } catch (error) {
      // A zoomend/disposal abort is not evidence of saturated download capacity.
      if (!signal.aborted) payloadAwareConcurrency.observeFailure(error);
      throw error;
    }
    signal.throwIfAborted();
    heightMetadata.record(tile);
    markTileStage(statsKey, "Projizieren");
    const projectedGeometry = await createProjectedGeometry(tile, signal);
    markTileStage(statsKey, "Relief");
    const prepared = await prepareReliefGeometry(
      tile,
      projectedGeometry,
      signal
    );
    markTileStage(statsKey, null);
    if (signal.aborted) {
      prepared.projectedGeometry?.dispose();
      signal.throwIfAborted();
    }
    return prepared;
  };

  const prepareReliefGeometry = async (
    tile: TerrainTile,
    geometry: BufferGeometry,
    signal = conversionAbort.signal
  ) => {
    if (
      noDataHeightMeters === undefined ||
      terrainHeightRangeExcludesNoData(tile, noDataHeightMeters)
    )
      return {
        tile,
        projectedGeometry: geometry,
        reliefVertexMask: new Uint8Array(
          geometry.getAttribute("position").count
        ).fill(1),
      };
    try {
      const result = await runTerrainWorkerTask(
        {
          kind: "partition",
          positions: geometry.getAttribute("position").array as Float32Array,
          indices: geometry.index!.array as Uint16Array | Uint32Array,
          heights: tile.heightMeters,
          noDataHeightMeters,
        },
        signal
      );
      if (result.kind !== "partition")
        throw new Error("Unexpected terrain partition result");
      return {
        tile,
        projectedGeometry: result.geometry
          ? restoreWorkerGeometry(result.geometry)
          : null,
        reliefVertexMask: result.reliefVertexMask,
      };
    } finally {
      geometry.dispose();
    }
  };

  // A pan can supersede a selection while its tiles are still projecting.
  // Share the whole preparation (not only fetch/decode) and install each mesh
  // once, so callers never share ownership of a disposable geometry wrapper.
  const pendingMeshes = new Map<string, Promise<void>>();
  const meshJobs = new Map<
    string,
    {
      entry: TerrainSelectionEntry;
      controller: AbortController;
      adopted: boolean;
      zoomBaseLevel?: number;
    }
  >();
  let requiredPreparationKeys: ReadonlySet<string> = new Set();
  let reserveSelectionEntries: readonly TerrainSelectionEntry[] = [];
  const cancelMeshRequest = (key: string, controller: AbortController) => {
    meshJobs.delete(key);
    pendingMeshes.delete(key);
    controller.abort(new DOMException("Terrain demand changed", "AbortError"));
  };
  const reconcileMeshRequests = (selection: TerrainSelection) => {
    requiredPreparationKeys = new Set(
      [...selection.loadEntries, ...reserveSelectionEntries].map(
        terrainSelectionKey
      )
    );
    trimMeshCache(activeMeshKeys);
    for (const [key, job] of meshJobs) {
      if (requiredPreparationKeys.has(key)) {
        job.adopted = true;
        continue;
      }
      // Keep useful zoom-ahead work on the same/finer footprint. A zoom-out or
      // pan away invalidates it, unlike a harmless matrix/near-plane change.
      const zoomBaseLevel = job.zoomBaseLevel;
      if (
        zoomBaseLevel !== undefined &&
        selection.entries.some(
          (entry) =>
            entry.id.level >= zoomBaseLevel &&
            (terrainTileContains(entry.id, job.entry.id) ||
              terrainTileContains(job.entry.id, entry.id))
        )
      )
        continue;
      cancelMeshRequest(key, job.controller);
    }
  };
  const prepareMesh = (
    source: RasterDemTerrainTileSource,
    entry: TerrainSelectionEntry
  ): Promise<void> => {
    const key = terrainSelectionKey(entry);
    if (meshes.has(key)) return Promise.resolve();
    if (!requiredPreparationKeys.has(key)) return Promise.resolve();
    const pending = pendingMeshes.get(key);
    if (pending) {
      const job = meshJobs.get(key);
      if (job) job.adopted = true;
      return pending;
    }
    const controller = new AbortController();
    const job = { entry, controller, adopted: true };
    meshJobs.set(key, job);
    const work = loadTerrainEntry(
      source,
      entry,
      AbortSignal.any([controller.signal, conversionAbort.signal])
    )
      .then(({ tile, projectedGeometry, reliefVertexMask }) => {
        if (disposed || controller.signal.aborted) projectedGeometry?.dispose();
        else {
          ensureMesh(tile, entry, projectedGeometry, reliefVertexMask);
          trimMeshCache(activeMeshKeys);
        }
      })
      .finally(() => {
        if (pendingMeshes.get(key) === work) pendingMeshes.delete(key);
        if (meshJobs.get(key) === job) meshJobs.delete(key);
      });
    pendingMeshes.set(key, work);
    return work;
  };

  /** Published keys whose display stage was already closed. */
  const displayedTileKeys = new Set<string>();
  const closeDisplayStages = (
    keys: ReadonlySet<string>,
    publishStartedAt = performance.now()
  ) => {
    for (const key of keys) {
      if (displayedTileKeys.has(key)) continue;
      displayedTileKeys.add(key);
      const stats = tileStats.get(key);
      if (!stats) continue;
      // The wait splits in two: how long the built tile sat until a cut took
      // it, and how long that cut took to go on screen.
      if (stats.stage?.label === "Anzeige") {
        const now = performance.now();
        stats.steps.push({
          label: "Anzeige",
          ms: Math.max(0, publishStartedAt - stats.stage.startedAt),
        });
        stats.steps.push({
          label: "Einfugen",
          ms: Math.max(0, now - publishStartedAt),
        });
        stats.stage = null;
        continue;
      }
      markTileStage(key, null);
    }
    for (const key of displayedTileKeys)
      if (!keys.has(key) && !meshes.has(key)) displayedTileKeys.delete(key);
  };

  const ensureMesh = (
    tile: TerrainTile,
    entry: TerrainSelectionEntry,
    projectedGeometry: BufferGeometry | null,
    reliefVertexMask: Uint8Array
  ) => {
    const key = terrainSelectionKey(entry);
    // Building the Three objects is its own cost; what remains after it is the
    // wait until a cut publishes the tile.
    const buildStart = performance.now();
    if (tileStats.has(key)) markTileStage(key, null);
    const cached = meshes.get(key);
    if (cached) {
      projectedGeometry?.dispose();
      cached.lastUsed = ++meshUseClock;
      return cached.node;
    }
    const reliefGeometry = projectedGeometry;

    const node = new Group();
    node.name = `${runtimeId}-${key}`;
    let reliefMesh: Mesh | null = null;
    const debugMaterial =
      options.debugScreenError && reliefGeometry
        ? new MeshLambertMaterial({
            color: 0x000000,
            emissive: 0x38bdf8,
            toneMapped: false,
          })
        : undefined;
    if (reliefGeometry) {
      reliefMesh = new Mesh(reliefGeometry, debugMaterial ?? material);
      reliefMesh.userData.isShadowTerrainSurface = true;
      reliefMesh.name = `${node.name}-relief`;
      reliefMesh.castShadow = true;
      reliefMesh.receiveShadow = true;
      node.add(reliefMesh);
    }
    node.visible = false;
    root.add(node);
    // Publication updates the projection once for the complete ready batch.
    const filterReliefBoundary = (indices: Uint32Array | undefined) =>
      Uint32Array.from(
        [...(indices ?? [])].filter((index) => reliefVertexMask[index] === 1)
      );
    const boundaryEdges: TerrainBoundaryEdges = {
      west: filterReliefBoundary(tile.westIndices),
      south: filterReliefBoundary(tile.southIndices),
      east: filterReliefBoundary(tile.eastIndices),
      north: filterReliefBoundary(tile.northIndices),
    };
    const position = reliefGeometry?.getAttribute("position");
    const boundaryBaseHeights = Object.fromEntries(
      (Object.keys(boundaryEdges) as TerrainBoundarySide[]).map((side) => [
        side,
        Float32Array.from(boundaryEdges[side], (index) =>
          position ? position.getY(index) : 0
        ),
      ])
    ) as Record<TerrainBoundarySide, Float32Array>;
    const decodedHeightRange = getFiniteHeightRange(
      tile.heightMeters,
      noDataHeightMeters
    ) ?? [0, 0];
    const tileRangeIncludesNoData =
      noDataHeightMeters !== undefined &&
      !terrainHeightRangeExcludesNoData(tile, noDataHeightMeters);
    const minimumHeightMeters =
      !tileRangeIncludesNoData && Number.isFinite(tile.minimumHeightMeters)
        ? tile.minimumHeightMeters
        : decodedHeightRange[0];
    const maximumHeightMeters =
      !tileRangeIncludesNoData && Number.isFinite(tile.maximumHeightMeters)
        ? tile.maximumHeightMeters
        : decodedHeightRange[1];
    meshes.set(key, {
      debugMaterial,
      node,
      reliefMesh,
      stitchBase: reliefGeometry
        ? {
            positions: reliefGeometry.getAttribute("position")
              .array as Float32Array,
            normals: reliefGeometry.getAttribute("normal")
              .array as Float32Array,
            indices: reliefGeometry.index!.array as Uint16Array | Uint32Array,
          }
        : null,
      boundaryEdges,
      boundaryBaseHeights,
      sourceByteLength: tile.byteLength,
      lastUsed: ++meshUseClock,
      id: entry.id,
      heightBounds: tile.bounds ? { ...tile.bounds } : null,
      sampleHeight: reliefGeometry
        ? createTerrainTileHeightSampler(tile, noDataHeightMeters)
        : null,
      minimumHeightMeters,
      maximumHeightMeters,
    });
    if (tileStats.has(key)) {
      // Close the build and start waiting for the cut that shows the tile.
      addTileStep(key, "Aufbau", performance.now() - buildStart);
      const stats = tileStats.get(key);
      if (stats)
        stats.stage = { label: "Anzeige", startedAt: performance.now() };
    }
    return node;
  };

  const getElevation = (longitude: number, latitude: number) => {
    if (disposed) return undefined;
    const height = source?.sampleHeight(longitude, latitude);
    if (height !== undefined)
      return Number.isFinite(height) &&
        (noDataHeightMeters === undefined ||
          Math.abs(height - noDataHeightMeters) > NO_DATA_EPSILON_METERS)
        ? height
        : undefined;
    // A persistent component hit bypasses requestTile, so the source's raster
    // cache may be empty. Keep labels queryable from the existing mesh cut.
    let finest: TerrainMeshRecord | undefined;
    for (const candidate of meshes.values()) {
      const bounds = candidate.heightBounds;
      if (
        !bounds ||
        longitude < bounds.west ||
        longitude > bounds.east ||
        latitude < bounds.south ||
        latitude > bounds.north
      )
        continue;
      if (
        !finest ||
        candidate.id.level > finest.id.level ||
        (candidate.id.level === finest.id.level &&
          candidate.node.visible &&
          !finest.node.visible)
      )
        finest = candidate;
    }
    // A finer no-data tile must not reveal a coarser surface below its hole.
    return finest?.sampleHeight?.(longitude, latitude);
  };

  const prepareEqualLevelBoundaries = async (
    keys: ReadonlySet<string>,
    current: () => boolean
  ) => {
    const records = [...keys].flatMap((key) => {
      const record = meshes.get(key);
      return record?.stitchBase && record.reliefMesh ? [{ key, record }] : [];
    });
    const byId = new Set(
      records.map(({ record }) => terrainTileKey(record.id))
    );
    const adjacent = records.filter(({ record: { id } }) =>
      [-1, 0, 1].some((dx) =>
        [-1, 0, 1].some(
          (dy) =>
            (dx || dy) &&
            byId.has(terrainTileKey({ ...id, x: id.x + dx, y: id.y + dy }))
        )
      )
    );
    if (!adjacent.length) return;
    // Bound full-payload preparation in flight. Shells live with the evictable
    // mesh record and are reused by subsequent small boundary-only jobs.
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(4, adjacent.length) }, async () => {
        while (next < adjacent.length && current()) {
          const { key, record } = adjacent[next++];
          if (record.equalLevelShell) continue;
          const result = await runTerrainWorkerTask(
            {
              kind: "stitch",
              prepareEqualLevelShells: true,
              inputs: [
                {
                  key,
                  id: record.id,
                  ...record.stitchBase!,
                  boundaryEdges: record.boundaryEdges,
                  boundaryBaseHeights: record.boundaryBaseHeights,
                },
              ],
            },
            conversionAbort.signal
          );
          if (result.kind !== "stitch")
            throw new Error("Unexpected terrain shell result");
          record.equalLevelShell = result.shells?.[0];
        }
      })
    );
    if (!current()) return;
    const signatures = new Map(
      adjacent.map(({ key, record }) => [
        key,
        records
          .filter(
            (other) =>
              other.record.id.level === record.id.level &&
              Math.abs(other.record.id.x - record.id.x) <= 1 &&
              Math.abs(other.record.id.y - record.id.y) <= 1
          )
          .map((other) => other.key)
          .sort()
          .join(";"),
      ])
    );
    const dirty = adjacent.filter(
      ({ key, record }) => record.equalLevelSignature !== signatures.get(key)
    );
    if (!dirty.length) return;
    // Two tile rings contain every incident face contribution at target corners.
    // Neighbour tiles are read-only context; only changed neighbourhoods publish.
    const inputs = adjacent
      .filter(({ record }) =>
        dirty.some(
          (target) =>
            target.record.id.level === record.id.level &&
            Math.abs(target.record.id.x - record.id.x) <= 2 &&
            Math.abs(target.record.id.y - record.id.y) <= 2
        )
      )
      .flatMap(({ record }) =>
        record.equalLevelShell ? [record.equalLevelShell] : []
      );
    const result = await runTerrainWorkerTask(
      {
        kind: "stitch",
        sameLevelOnly: true,
        inputs,
        outputKeys: dirty.map((t) => t.key),
      },
      conversionAbort.signal
    );
    if (!current()) return;
    if (result.kind !== "stitch")
      throw new Error("Unexpected equal-level terrain result");
    for (const update of result.updates) {
      const record = meshes.get(update.key);
      const shell = record?.equalLevelShell,
        geometry = record?.reliefMesh?.geometry;
      if (!shell?.sourceIndices || !shell.normalTargets || !geometry) continue;
      const position = geometry.getAttribute("position") as BufferAttribute;
      const normal = geometry.getAttribute("normal") as BufferAttribute;
      // Preserve the immutable native arrays used by later cuts and mixed LOD.
      if (position.array === record.stitchBase?.positions)
        position.array = position.array.slice();
      if (normal.array === record.stitchBase?.normals)
        normal.array = normal.array.slice();
      const patch = (
        attribute: BufferAttribute,
        values: Float32Array,
        targets: Iterable<number>
      ) => {
        const sorted = [...new Set(targets)].sort(
          (a, b) => shell.sourceIndices![a] - shell.sourceIndices![b]
        );
        let start = -1,
          end = -1;
        for (const i of sorted) {
          const dst = shell.sourceIndices![i] * 3;
          attribute.array[dst] = values[i * 3];
          attribute.array[dst + 1] = values[i * 3 + 1];
          attribute.array[dst + 2] = values[i * 3 + 2];
          if (dst !== end) {
            if (start >= 0) attribute.addUpdateRange(start, end - start);
            start = dst;
          }
          end = dst + 3;
        }
        if (start >= 0) attribute.addUpdateRange(start, end - start);
        attribute.needsUpdate = true;
      };
      patch(
        position,
        update.positions,
        Object.values(shell.boundaryEdges).flatMap((edge) => [...edge])
      );
      patch(normal, update.normals, shell.normalTargets);
      geometry.boundingBox?.union(
        new Box3(
          new Vector3().fromArray(update.box.min),
          new Vector3().fromArray(update.box.max)
        )
      );
      if (geometry.boundingBox)
        geometry.boundingSphere = geometry.boundingBox.getBoundingSphere(
          new Sphere()
        );
    }
    for (const { key, record } of dirty)
      record.equalLevelSignature = signatures.get(key);
  };

  let stitchedActiveSignature = "";
  let stitchedBoundaryState: TerrainBoundaryStitchState = new Map();
  conversionAbort.signal.addEventListener(
    "abort",
    () => {
      stitchedBoundaryState = new Map();
    },
    { once: true }
  );
  let pendingStitch: {
    signature: string;
    controller: AbortController;
    result: Promise<{
      result: TerrainWorkerResult;
      state: TerrainBoundaryStitchState;
    }>;
  } | null = null;
  const smoothActiveBoundaryNormals = async (
    activeKeys: ReadonlySet<string>,
    generation: number,
    isCurrentPublication: () => boolean
  ) => {
    const signature = [...activeKeys].sort().join(";");
    if (signature === stitchedActiveSignature) {
      pendingStitch?.controller.abort();
      pendingStitch = null;
      return;
    }
    if (pendingStitch?.signature !== signature) {
      // Retain tile preparation across pans, but never queue obsolete seam passes.
      pendingStitch?.controller.abort();
      const controller = new AbortController();
      const abort = () => controller.abort();
      conversionAbort.signal.addEventListener("abort", abort, { once: true });
      const inputs = [...activeKeys].flatMap((key) => {
        const record = meshes.get(key);
        const geometry = record?.reliefMesh?.geometry;
        if (!record?.stitchBase || !geometry) return [];
        return [
          {
            key,
            id: record.id,
            ...record.stitchBase,
            boundaryEdges: record.boundaryEdges,
            boundaryBaseHeights: record.boundaryBaseHeights,
          },
        ];
      });
      pendingStitch = {
        signature,
        controller,
        result: (async () => {
          const stitched = await runBatchedTerrainBoundaryStitch(
            inputs,
            stitchedBoundaryState,
            async (batch, stitchOptions) => {
              const result = await runTerrainWorkerTask(
                {
                  kind: "stitch",
                  inputs: batch,
                  ...stitchOptions,
                },
                controller.signal
              );
              if (result.kind !== "stitch")
                throw new Error("Unexpected terrain stitching result");
              return result;
            },
            {
              signal: controller.signal,
              concurrency: getWorkerProbeLimit(
                typeof navigator === "undefined"
                  ? 4
                  : navigator.hardwareConcurrency
              ),
              // The general mixed-LOD solver also changes equal-level junction
              // normals. Publish its whole cut atomically; a subset would undo
              // equality on one side of a neighbouring same-level seam.
              forceOutput: true,
            }
          );
          return {
            result: { kind: "stitch" as const, updates: stitched.updates },
            state: stitched.state,
          };
        })().finally(() =>
          conversionAbort.signal.removeEventListener("abort", abort)
        ),
      };
    }
    const job = pendingStitch;
    let completion: Awaited<typeof job.result>;
    try {
      completion = await job.result;
    } catch (error) {
      if (job.controller.signal.aborted) return;
      throw error;
    } finally {
      if (pendingStitch === job) pendingStitch = null;
    }
    const { result } = completion;
    if (result.kind !== "stitch")
      throw new Error("Unexpected terrain stitching result");
    if (
      disposed ||
      job.controller.signal.aborted ||
      generation !== selectionGeneration ||
      !isCurrentPublication()
    )
      return;
    for (const update of result.updates) {
      const record = meshes.get(update.key);
      if (record) record.equalLevelSignature = undefined;
      const geometry = meshes.get(update.key)?.reliefMesh?.geometry;
      if (!geometry) continue;
      const position = geometry.getAttribute("position") as BufferAttribute;
      const normal = geometry.getAttribute("normal") as BufferAttribute;
      const index = geometry.getIndex();
      const sameLayout =
        position.array.length === update.positions.length &&
        normal.array.length === update.normals.length &&
        index?.array.length === update.indices.length &&
        index.array.constructor === update.indices.constructor;
      if (sameLayout) {
        // Keep Three's GPU buffer handles. Worker results own these arrays, so
        // replacing CPU storage needs no extra copy or allocation on this thread.
        position.array = update.positions;
        normal.array = update.normals;
        index.array = update.indices;
        position.clearUpdateRanges();
        normal.clearUpdateRanges();
        index.clearUpdateRanges();
        position.needsUpdate = normal.needsUpdate = index.needsUpdate = true;
      } else {
        // setAttribute alone drops the old handles without deleting their GL
        // buffers. Dispose BEFORE changing topology; Three reuploads on demand.
        geometry.dispose();
        geometry.setAttribute(
          "position",
          new BufferAttribute(update.positions, 3)
        );
        geometry.setAttribute("normal", new BufferAttribute(update.normals, 3));
        geometry.setIndex(new BufferAttribute(update.indices, 1));
      }
      geometry.boundingBox = new Box3(
        new Vector3().fromArray(update.box.min),
        new Vector3().fromArray(update.box.max)
      );
      geometry.boundingSphere = new Sphere(
        new Vector3().fromArray(update.sphere.center),
        update.sphere.radius
      );
    }

    stitchedBoundaryState = completion.state;
    stitchedActiveSignature = signature;
  };

  let idleStitchTimer: ReturnType<typeof setTimeout> | null = null;
  const cancelIdleStitch = () => {
    if (idleStitchTimer !== null) clearTimeout(idleStitchTimer);
    idleStitchTimer = null;
    pendingStitch?.controller.abort();
    pendingStitch = null;
  };
  const scheduleIdleStitch = () => {
    cancelIdleStitch();
    if (disposed) return;
    idleStitchTimer = setTimeout(() => {
      idleStitchTimer = null;
      if (disposed) return;
      if (
        terrainLoading ||
        selectionRequestPending ||
        pendingMeshes.size ||
        map?.isMoving?.()
      ) {
        scheduleIdleStitch();
        return;
      }
      const keys = activeMeshKeys;
      // Same-LOD terrain keeps its native edges; only mixed-LOD transitions
      // justify optional geometry work. Detail loading always has priority.
      const levels = new Set([...keys].map((key) => meshes.get(key)?.id.level));
      if (levels.size < 2) return;
      const generation = selectionGeneration;
      const current = () =>
        !disposed &&
        generation === selectionGeneration &&
        keys === activeMeshKeys;
      void smoothActiveBoundaryNormals(keys, generation, current)
        .then(() => {
          if (!current()) return;
          contentChangedSinceFrame = true;
          mapStyleProjectionVersion += 1;
          map?.triggerRepaint();
        })
        .catch((error) => {
          // Optional seam refinement must never revoke published coverage or
          // restart foreground downloads. A later settled cut can try again.
          if (current()) options.onError?.(error);
        });
    }, 500);
  };

  let activeMeshKeys: ReadonlySet<string> = new Set();
  let shadowDependencies: readonly { key: string; bounds: Box3 }[] = [];
  const terrainBoundsCorner = new Vector3();

  const getTerrainMeshWorldBounds = (
    record: Pick<
      TerrainMeshRecord,
      "id" | "minimumHeightMeters" | "maximumHeightMeters"
    >,
    target: Box3
  ): Box3 => {
    const geographicBounds =
      source?.getTileBounds(record.id) ?? getTileBounds(record.id);
    target.makeEmpty();
    for (const longitude of [geographicBounds.west, geographicBounds.east]) {
      for (const latitude of [geographicBounds.south, geographicBounds.north]) {
        target.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            record.minimumHeightMeters,
            terrainBoundsCorner
          )
        );
        target.expandByPoint(
          projectToLocalWorld(
            longitude,
            latitude,
            record.maximumHeightMeters,
            terrainBoundsCorner
          )
        );
      }
    }
    target.min.sub(boundsPaddingMeters);
    target.max.add(boundsPaddingMeters);
    return target.applyMatrix4(root.matrixWorld);
  };

  const rejectOffscreenMeshRequests = (input: TerrainSelectionInput) => {
    if (meshJobs.size === 0 || !observerFrustumReady) return;
    const reserveKeys = new Set(
      reserveSelectionEntries.map(terrainSelectionKey)
    );
    const sunFrustum = input.shadow
      ? new Frustum().setFromProjectionMatrix(
          new Matrix4()
            .fromArray(input.shadow.camera.projectionMatrix)
            .multiply(
              new Matrix4().fromArray(input.shadow.camera.matrixWorldInverse)
            ),
          input.shadow.camera.coordinateSystem,
          input.shadow.camera.reversedDepth
        )
      : null;
    const bounds = new Box3();
    const required = new Set(requiredPreparationKeys);
    for (const [key, job] of meshJobs) {
      if (reserveKeys.has(key)) continue;
      const geographic = source!.getTileBounds(job.entry.id);
      // Match the selector's conservative observer union. Flat map bounds may
      // retain more work, but cannot reject a steep/high tile visible in 3D.
      if (geographicBoundsIntersect(geographic, input.viewportBounds)) continue;
      const known = input.knownHeightRanges[terrainTileKey(job.entry.id)];
      getTerrainMeshWorldBounds(
        {
          id: job.entry.id,
          minimumHeightMeters: Math.min(
            known?.[0] ?? Infinity,
            input.unknownHeightRange[0]
          ),
          maximumHeightMeters: Math.max(
            known?.[1] ?? -Infinity,
            input.unknownHeightRange[1]
          ),
        },
        bounds
      );
      if (
        observerFrustum.intersectsBox(bounds) ||
        tileCameraDemand.evaluate(bounds, 0).required ||
        sunFrustum?.intersectsBox(bounds)
      )
        continue;
      required.delete(key);
      cancelMeshRequest(key, job.controller);
      // Returning to the same selected cut must restart its missing work, even
      // if no newer exact worker selection was accepted during the movement.
      requestedSignature = "";
    }
    // Existing progressive loops must not readmit work rejected by a newer
    // camera while the exact worker selection is still coalescing motion.
    requiredPreparationKeys = required;
  };

  const getViewElevationRange = (
    camera: Camera
  ): readonly [number, number] | null => {
    if (activeMeshKeys.size === 0) return null;
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const viewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const viewFrustum = new Frustum().setFromProjectionMatrix(
      viewProjection,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    const localBounds = new Box3();
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record?.node.visible) continue;
      getTerrainMeshWorldBounds(record, localBounds);
      if (!viewFrustum.intersectsBox(localBounds)) continue;
      minimum = Math.min(minimum, localBounds.min.y);
      maximum = Math.max(maximum, localBounds.max.y);
    }
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum]
      : null;
  };

  const getViewSourceHeightRange = (
    camera: Camera
  ): readonly [number, number] | null => {
    if (activeMeshKeys.size === 0) return null;
    camera.updateMatrixWorld(true);
    root.updateMatrixWorld(true);
    const viewProjection = new Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const viewFrustum = new Frustum().setFromProjectionMatrix(
      viewProjection,
      camera.coordinateSystem,
      camera.reversedDepth
    );
    const localBounds = new Box3();
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record?.node.visible) continue;
      getTerrainMeshWorldBounds(record, localBounds);
      if (!viewFrustum.intersectsBox(localBounds)) continue;
      minimum = Math.min(minimum, record.minimumHeightMeters);
      maximum = Math.max(maximum, record.maximumHeightMeters);
    }
    return Number.isFinite(minimum) && Number.isFinite(maximum)
      ? [minimum, maximum]
      : null;
  };

  /** Finished steps plus the running one, so a loading tile shows its cost. */
  const readTileStats = (key: string) => {
    const stats = tileStats.get(key);
    if (!stats) return {};
    const steps = stats.stage
      ? [
          ...stats.steps,
          {
            label: stats.stage.label,
            ms: performance.now() - stats.stage.startedAt,
            pending: true,
          },
        ]
      : stats.steps;
    return { bytes: stats.bytes || undefined, steps };
  };

  const parseMeshKeyTileId = (key: string): TerrainTileId | null => {
    const [level, x, y] = (key.split(":")[1] ?? "").split("/").map(Number);
    return [level, x, y].every(Number.isInteger) ? { level, x, y } : null;
  };

  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] => {
    if (
      activeMeshKeys.size === 0 &&
      pendingMeshes.size === 0 &&
      requestedSelectionKeys.size === 0
    )
      return [];
    root.updateMatrixWorld(true);
    const bounds = new Box3();
    const volumes: SharedThreeSceneTileVolume[] = [];
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record?.node.visible) continue;
      getTerrainMeshWorldBounds(record, bounds);
      volumes.push({
        id: `${runtimeId}:${key}`,
        kind: "terrain-tile",
        state: "loaded",
        level: record.id.level,
        loadReason: record.reliefMesh?.receiveShadow ? "viewport" : "shadow",
        minimum: [bounds.min.x, bounds.min.y, bounds.min.z],
        maximum: [bounds.max.x, bounds.max.y, bounds.max.z],
        ...readTileStats(key),
      });
    }
    // Loaded and held back: a child that cannot replace its parent until its
    // siblings cover it too, and the generations above the published cut.
    // Membership follows the observer, not the current selection, so a tile
    // does not blink out of the overlay while a new cut is being planned.
    // Everything held, not only what the observer can see: a tile the corridor
    // keeps or a parent waiting for its children says as much about coverage
    // as one in front of the camera, and hiding them made the overview look
    // like the terrain simply stopped.
    const residents = [...meshes]
      .filter(([key]) => !activeMeshKeys.has(key))
      .sort(([, a], [, b]) => b.lastUsed - a.lastUsed)
      .slice(0, Math.max(0, MAXIMUM_REPORTED_TILES - volumes.length));
    for (const [key, record] of residents) {
      getTerrainMeshWorldBounds(record, bounds);
      volumes.push({
        id: `${runtimeId}:${key}`,
        kind: "terrain-tile",
        state: "resident",
        level: record.id.level,
        minimum: [bounds.min.x, bounds.min.y, bounds.min.z],
        maximum: [bounds.max.x, bounds.max.y, bounds.max.z],
        ...readTileStats(key),
      });
    }
    // A tile still being built has no geometry, but it has the box selection
    // culled it with: its footprint over the height range known for it. The
    // 2.5D tree is drawn like a 3D Tiles one, loading tiles included.
    if (pendingMeshes.size) {
      const knownHeightRanges = heightMetadata.snapshot();
      for (const key of pendingMeshes.keys()) {
        if (meshes.has(key)) continue;
        const id = parseMeshKeyTileId(key);
        if (!id) continue;
        const box = buildTerrainTileLocalBox(
          source?.getTileBounds(id) ?? getTileBounds(id),
          knownHeightRanges[terrainTileKey(id)] ?? unknownTerrainHeightRange,
          [origin.x, origin.y, origin.z],
          meterScale,
          bounds
        ).applyMatrix4(root.matrixWorld);
        volumes.push({
          id: `${runtimeId}:${key}`,
          kind: "terrain-tile",
          state: "loading",
          level: id.level,
          minimum: [box.min.x, box.min.y, box.min.z],
          maximum: [box.max.x, box.max.y, box.max.z],
          ...readTileStats(key),
        });
      }
    }
    return volumes;
  };

  const applyMeshVisibility = () => {
    root.updateWorldMatrix(true, false);
    const bounds = new Box3();
    for (const [key, record] of meshes) {
      record.node.visible = root.visible && activeMeshKeys.has(key);
      if (!record.node.visible || !record.reliefMesh) continue;
      getTerrainMeshWorldBounds(record, bounds);
      const receiver =
        !observerFrustumReady ||
        observerFrustum.intersectsBox(bounds) ||
        tileCameraDemand.evaluate(bounds, 0).receiver;
      if (receiver && record.debugMaterial && source) {
        debugInverseRoot.copy(root.matrixWorld).invert();
        debugLocalCamera
          .copy(debugCameraPosition)
          .applyMatrix4(debugInverseRoot);
        debugLocalBounds.copy(bounds).applyMatrix4(debugInverseRoot);
        const ratio = getTerrainScreenErrorRatio(
          source.getLevelMaximumGeometricError(record.id.level),
          debugViewportHeight,
          debugFovDegrees,
          debugLocalBounds.distanceToPoint(debugLocalCamera),
          errorTargetPixels
        );
        record.debugMaterial.emissive.setHex(getTerrainScreenErrorColor(ratio));
        record.reliefMesh.userData.terrainScreenErrorRatio = ratio;
      }
      const nextMaterial = receiver
        ? record.debugMaterial ?? material
        : casterMaterial;
      if (record.reliefMesh.material !== nextMaterial) {
        record.reliefMesh.material = nextMaterial;
        mapStyleProjectionVersion += 1;
      }
      record.reliefMesh.receiveShadow = receiver;
    }
  };

  // Selection runs asynchronously and may omit still-visible old tiles while
  // dragging. The actual latest camera, not membership in that selection,
  // decides whether their last loaded surface can be discarded.
  const getRequiredMeshKeys = (): ReadonlySet<string> => {
    if (!latestRenderCamera) return activeMeshKeys;
    latestRenderCamera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, false);
    const projection = new Matrix4().multiplyMatrices(
      latestRenderCamera.projectionMatrix,
      latestRenderCamera.matrixWorldInverse
    );
    if (!projection.elements.every(Number.isFinite)) return activeMeshKeys;
    const frustum = new Frustum().setFromProjectionMatrix(
      projection,
      latestRenderCamera.coordinateSystem,
      latestRenderCamera.reversedDepth
    );
    const shadowFrustum = shadowView
      ? new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(
            shadowView.camera.projectionMatrix,
            shadowView.camera.matrixWorldInverse
          ),
          shadowView.camera.coordinateSystem,
          shadowView.camera.reversedDepth
        )
      : null;
    const bounds = new Box3();
    return new Set(
      [...activeMeshKeys].filter((key) => {
        const record = meshes.get(key);
        if (!record) return false;
        getTerrainMeshWorldBounds(record, bounds);
        return (
          frustum.intersectsBox(bounds) ||
          shadowFrustum?.intersectsBox(bounds) ||
          previousShadowFrustum?.intersectsBox(bounds) ||
          tileCameraDemand.evaluate(bounds, 0).required
        );
      })
    );
  };

  const meshBytes = (record: TerrainMeshRecord) => {
    const geometry = record.reliefMesh?.geometry;
    const arrays = new Set<ArrayBufferLike>();
    let gpuBytes = 0;
    for (const attribute of [
      ...Object.values(geometry?.attributes ?? {}),
      geometry?.index,
    ]) {
      if (!attribute || !("array" in attribute)) continue;
      arrays.add(attribute.array.buffer);
      gpuBytes += attribute.array.byteLength;
    }
    for (const array of Object.values(record.stitchBase ?? {}))
      arrays.add(array.buffer);
    if (record.equalLevelShell) {
      const shell = record.equalLevelShell;
      for (const array of [
        shell.positions,
        shell.normals,
        shell.indices,
        shell.sourceIndices,
        shell.normalTargets,
        ...Object.values(shell.boundaryEdges),
        ...Object.values(shell.boundaryBaseHeights),
      ])
        if (array) arrays.add(array.buffer);
    }
    return (
      record.sourceByteLength +
      gpuBytes +
      [...arrays].reduce((sum, buffer) => sum + buffer.byteLength, 0)
    );
  };
  const cachedMeshBytes = () =>
    [...meshes.values()].reduce((sum, record) => sum + meshBytes(record), 0);
  const trimMeshCache = (activeKeys: ReadonlySet<string>) => {
    let bytes = cachedMeshBytes();
    if (meshes.size <= maxCachedMeshes && bytes <= maxCachedMeshBytes) return;
    const candidates = [...meshes.entries()]
      .filter(
        ([key]) => !activeKeys.has(key) && !requiredPreparationKeys.has(key)
      )
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      if (meshes.size <= maxCachedMeshes && bytes <= maxCachedMeshBytes) break;
      bytes -= meshBytes(record);
      root.remove(record.node);
      record.reliefMesh?.geometry.dispose();
      record.debugMaterial?.dispose();
      meshes.delete(key);
    }
  };

  const buildSelection = (
    terrainSource: RasterDemTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelection => {
    return buildTerrainSelection(snapshotSelectionInput(terrainSource, frame), {
      getTileGridIdsForBounds: terrainSource.getTileGridIdsForBounds,
      getTileBounds: terrainSource.getTileBounds,
      getTileGeometricError: terrainSource.getLevelMaximumGeometricError,
      getTileDataAvailable: terrainSource.getTileDataAvailable,
    });
  };

  const computeSelectionInputSignature = (
    frame: SharedThreeSceneFrame
  ): string => {
    const center = map?.getCenter?.();
    const lodViewport = frame.cssViewport ?? frame.viewport;
    // Evaluate changed matrices, including free cameras and terrain-aware
    // near/far changes. Equal resolved tile cuts keep their load generation and
    // overlapping requests; matrix jitter must not restart their preparation.
    const viewSignature = center
      ? [
          quantize(center.lng, 0.0000001),
          quantize(center.lat, 0.0000001),
          quantize(map?.getZoom?.() ?? 0, 0.0001),
          quantize(map?.getBearing?.() ?? 0, 0.001),
          quantize(map?.getPitch?.() ?? 0, 0.001),
        ]
      : [
          quantize(frame.lodCamera.position.x, 5),
          quantize(frame.lodCamera.position.y, 5),
          quantize(frame.lodCamera.position.z, 5),
          quantize(frame.lodCamera.quaternion.x, 0.005),
          quantize(frame.lodCamera.quaternion.y, 0.005),
          quantize(frame.lodCamera.quaternion.z, 0.005),
          quantize(frame.lodCamera.quaternion.w, 0.005),
        ];
    return [
      ...viewSignature,
      errorTargetPixels,
      ...frame.renderCamera.projectionMatrix.elements,
      ...frame.renderCamera.matrixWorld.elements,
      ...frame.lodCamera.projectionMatrix.elements,
      ...frame.lodCamera.position.toArray(),
      `${lodViewport.x}x${lodViewport.y}`,
      selectionShadowViewSignature,
      tileCameraSignature,
    ].join(";");
  };

  const snapshotSelectionInput = (
    terrainSource: RasterDemTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelectionInput => {
    const lodViewport = frame.cssViewport ?? frame.viewport;
    frame.renderCamera.updateMatrixWorld(true);
    root.updateWorldMatrix(true, false);
    shadowView?.camera.updateMatrixWorld(true);
    const snapshotCamera = (camera: Camera) => ({
      projectionMatrix: [...camera.projectionMatrix.elements],
      matrixWorldInverse: [...camera.matrixWorldInverse.elements],
      matrixWorld: [...camera.matrixWorld.elements],
      coordinateSystem: camera.coordinateSystem,
      reversedDepth: camera.reversedDepth,
      isOrthographicCamera:
        (camera as Camera & { isOrthographicCamera?: boolean })
          .isOrthographicCamera ?? false,
      position: [camera.position.x, camera.position.y, camera.position.z] as [
        number,
        number,
        number
      ],
      fov: (camera as Camera & { fov?: number }).fov ?? 0,
    });
    const bounds = getViewportBounds(frame.map);
    const shadowBounds = shadowView
      ? cameraFrustumBounds(shadowView.camera, root, origin, meterScale)
      : null;
    const knownHeightRanges: Record<string, readonly [number, number]> =
      heightMetadata.snapshot();
    for (const [key, record] of meshes) {
      if (key.startsWith("source:")) {
        const tileKey = terrainTileKey(record.id);
        const known = knownHeightRanges[tileKey];
        knownHeightRanges[tileKey] = [
          Math.min(known?.[0] ?? Infinity, record.minimumHeightMeters),
          Math.max(known?.[1] ?? -Infinity, record.maximumHeightMeters),
        ];
      }
    }
    return {
      viewportBounds: bounds,
      viewport: [lodViewport.x, lodViewport.y],
      viewportFocusNdc: [
        -frame.lodCamera.projectionMatrix.elements[8],
        -frame.lodCamera.projectionMatrix.elements[9],
      ],
      // Projection/frustum comes from the render camera; screen-space error
      // uses the separate perspective LOD camera, just like the inline walk.
      renderCamera: {
        ...snapshotCamera(frame.renderCamera),
        fov: frame.lodCamera.fov,
      },
      lodCameraPosition: [
        frame.lodCamera.position.x,
        frame.lodCamera.position.y,
        frame.lodCamera.position.z,
      ],
      rootMatrixWorld: [...root.matrixWorld.elements],
      origin: [origin.x, origin.y, origin.z],
      meterScale,
      boundsPaddingMeters: [
        boundsPaddingMeters.x,
        boundsPaddingMeters.y,
        boundsPaddingMeters.z,
      ],
      cameraViews: (frame.tileCameraViews ?? []).flatMap((view) => {
        const bounds = cameraFrustumBounds(view, root, origin, meterScale);
        return bounds ? [{ ...view, bounds }] : [];
      }),
      shadow:
        shadowView && shadowBounds
          ? {
              camera: snapshotCamera(shadowView.camera),
              casterAngularRadiusRadians: shadowView.casterAngularRadiusRadians,
              shadowMapSize: [
                shadowView.shadowMapSize.width,
                shadowView.shadowMapSize.height,
              ],
              bounds: shadowBounds,
            }
          : undefined,
      source: {
        bounds: {
          west: terrainSourceConfig.bounds[0],
          south: terrainSourceConfig.bounds[1],
          east: terrainSourceConfig.bounds[2],
          north: terrainSourceConfig.bounds[3],
        },
        minzoom: terrainSourceConfig.minzoom,
        maxzoom: terrainSourceConfig.maxzoom,
        meshSegments,
      },
      knownHeightRanges,
      unknownHeightRange: unknownTerrainHeightRange,
      errorTargetPixels: effectiveErrorTargetPixels(),
      shadowLevelOffset,
      minimumLevel,
      maximumLevel,
      maxSelectionTiles,
      initialErrorTargetPixels: INITIAL_ERROR_TARGET_PIXELS,
    };
  };

  const loadSelection = (
    terrainSource: RasterDemTerrainTileSource,
    selection: TerrainSelection,
    prefetchView: PrefetchSelectionView
  ) => {
    latestResolvedSelectionView = prefetchView;
    cancelIdleStitch();
    invalidateIdlePrefetch();
    setTerrainLoading(true);
    const generation = ++selectionGeneration;
    let finishedLoading = false;
    let publicationRequested = false;
    let publicationJob: Promise<void> | null = null;
    const current = () => !disposed && generation === selectionGeneration;
    const toFrontier = (entries: readonly TerrainSelectionEntry[]) =>
      entries.map((entry) => ({
        key: terrainSelectionKey(entry),
        id: entry.id,
      }));
    const requested = toFrontier(selection.entries);
    requestedSelectionKeys = new Set(requested.map(({ key }) => key));
    zoomSelectionEntries = selection.entries;
    // Historical offscreen surfaces stay published until a ready coarse tile
    // covers them. Prepare this reserve after the foreground stages, not ahead
    // of visible/foveated work. No current requested region is coarsened here.
    const coarseReserve = new Map<string, TerrainSelectionEntry>();
    const requiredNow = getRequiredMeshKeys();
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record || requiredNow.has(key)) continue;
      let id = record.id;
      while (id.level > terrainSourceConfig.minzoom) {
        const parent = {
          level: id.level - 1,
          x: Math.floor(id.x / 2),
          y: Math.floor(id.y / 2),
        };
        if (
          selection.entries.some(
            (entry) =>
              terrainTileContains(parent, entry.id) ||
              terrainTileContains(entry.id, parent)
          ) ||
          !terrainSource.getTileDataAvailable(parent)
        )
          break;
        id = parent;
      }
      if (id.level < record.id.level)
        coarseReserve.set(terrainTileKey(id), { id, kind: "source" });
    }
    const reserveEntries = [...coarseReserve.values()].filter(
      (entry) =>
        ![...coarseReserve.values()].some(
          (other) =>
            other.id.level < entry.id.level &&
            terrainTileContains(other.id, entry.id)
        )
    );
    reserveSelectionEntries = reserveEntries;
    reconcileMeshRequests(selection);
    // Cache footprints at selection time, not for every sun-disc sample. Extend
    // vertically because an unloaded tile's actual elevation is not yet known.
    root.updateMatrixWorld(true);
    shadowDependencies = requested.map(({ key, id }) => ({
      key,
      bounds: getTerrainMeshWorldBounds(
        { id, minimumHeightMeters: -1000000, maximumHeightMeters: 1000000 },
        new Box3()
      ),
    }));
    const hasReadySurface = (key: string) =>
      Boolean(meshes.get(key)?.reliefMesh);
    const publish = async () => {
      const publishStartedAt = performance.now();
      let frontier = [...activeMeshKeys].flatMap((key) => {
        const record = meshes.get(key);
        return record ? [{ key, id: record.id }] : [];
      });
      // Fill newly uncovered areas on pans as well as cold starts. A preview
      // must never replace detailed coverage already visible in that area.
      if (!finishedLoading) {
        for (const stage of selection.viewportStages) {
          const candidates = toFrontier(stage).filter(
            (candidate) =>
              !frontier.some(
                (tile) =>
                  tile.id.level > candidate.id.level &&
                  terrainTileContains(candidate.id, tile.id)
              )
          );
          frontier = advanceTerrainTileFrontier(
            frontier,
            candidates,
            hasReadySurface
          );
        }
      }
      frontier = advanceTerrainTileFrontier(
        frontier,
        [...requested, ...toFrontier(reserveEntries)],
        hasReadySurface
      );
      const activeKeys = new Set(frontier.map(({ key }) => key));
      const signature = [...activeKeys].sort().join(";");
      if (signature === [...activeMeshKeys].sort().join(";")) return;
      if (!current()) return;
      // The camera can move during worker stitching. Replan before publishing
      // if a formerly offscreen tile has become visible without any replacement.
      const newlyUncovered = () =>
        [...getRequiredMeshKeys()].some((key) => {
          if (activeKeys.has(key)) return false;
          const previous = meshes.get(key);
          return (
            previous &&
            !frontier.some(
              ({ id }) =>
                terrainTileContains(id, previous.id) ||
                terrainTileContains(previous.id, id)
            )
          );
        });
      if (newlyUncovered()) {
        publicationRequested = true;
        return;
      }
      cancelIdleStitch();
      // Keep the complete previous cut while the new border bands are prepared.
      // Commit shared vertices and normals in one turn before retiring parents.
      await prepareEqualLevelBoundaries(
        activeKeys,
        () => current() && !newlyUncovered()
      );
      if (!current()) return;
      if (newlyUncovered()) {
        publicationRequested = true;
        return;
      }
      activeMeshKeys = activeKeys;
      trimMeshCache(activeMeshKeys);
      closeDisplayStages(activeKeys, publishStartedAt);
      applyMeshVisibility();
      if (activeKeys.size > 0) settleReady(true);
      // Transferred geometry is temporary coverage, not a second source cache.
      // Release it immediately once its replacement cut has been published.
      for (const [key, record] of meshes) {
        if (!key.startsWith("fallback:") || activeKeys.has(key)) continue;
        root.remove(record.node);
        record.reliefMesh?.geometry.dispose();
        record.debugMaterial?.dispose();
        meshes.delete(key);
      }
      mapStyleProjectionVersion += 1;
      contentChangedSinceFrame = true;
      map?.triggerRepaint();
      scheduleIdleStitch();
    };
    const requestPublication = (): Promise<void> => {
      publicationRequested = true;
      if (publicationJob) return publicationJob;
      // Coalesce arrivals into complete coverage cuts. Seam refinement runs
      // separately after foreground loading and interaction have settled.
      publicationJob = (async () => {
        while (publicationRequested && current()) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, PUBLICATION_BATCH_DELAY_MS)
          );
          publicationRequested = false;
          if (current()) await publish();
        }
      })().finally(() => {
        publicationJob = null;
      });
      return publicationJob;
    };
    const publishInBackground = () => {
      void requestPublication().catch((error) => {
        if (current()) options.onError?.(error);
      });
    };
    const finalKeys = new Set(requested.map(({ key }) => key));
    // A published parent is only replaced once its children cover it whole. The
    // cut is clipped to the view and the corridor, so a parent on the edge of
    // the view has quadrants nobody asks for, and the children that did load
    // can never take its place: they sit built and unpublished for as long as
    // the camera stays. Completing that parent's footprint is coverage, not
    // excess, so the missing siblings are requested behind everything else.
    const completion: TerrainSelectionEntry[] = [];
    if (source) {
      const wanted = new Set(requested.map(({ key }) => key));
      const published = [...activeMeshKeys].flatMap((key) => {
        const record = meshes.get(key);
        return record ? [record.id] : [];
      });
      for (const entry of selection.entries) {
        const parent = published.find(
          (id) =>
            id.level === entry.id.level - 1 && terrainTileContains(id, entry.id)
        );
        if (!parent) continue;
        for (const x of [parent.x * 2, parent.x * 2 + 1])
          for (const y of [parent.y * 2, parent.y * 2 + 1]) {
            const child = { level: parent.level + 1, x, y };
            const key = terrainSelectionKey({ id: child, kind: "source" });
            if (
              wanted.has(key) ||
              meshes.has(key) ||
              unavailableTileKeys.has(terrainTileKey(child))
            )
              continue;
            wanted.add(key);
            completion.push({
              id: child,
              kind: "source",
              priority: TILE_CAMERA_PRIORITY.SECONDARY,
            });
          }
      }
    }
    const sourceStages = [
      ...selection.viewportStages,
      selection.entries,
      ...(completion.length ? [completion] : []),
    ];
    const { stages: loadStages, scheduledKeys } = planTileLoadStages(
      sourceStages,
      {
        key: terrainSelectionKey,
        priority: (entry) => entry.priority ?? TILE_CAMERA_PRIORITY.PRIMARY,
        eligible: (entry, key) => {
          if (
            meshes.has(key) ||
            unavailableTileKeys.has(terrainTileKey(entry.id))
          )
            return false;
          return (
            finalKeys.has(key) ||
            coarseReserve.has(terrainTileKey(entry.id)) ||
            ![...activeMeshKeys].some((activeKey) => {
              const active = meshes.get(activeKey);
              return (
                active &&
                active.id.level > entry.id.level &&
                terrainTileContains(entry.id, active.id)
              );
            })
          );
        },
      }
    );
    const highestPendingPriority = loadStages
      .flat()
      .reduce(
        (priority, entry) =>
          Math.max(priority, entry.priority ?? TILE_CAMERA_PRIORITY.PRIMARY),
        Number.NEGATIVE_INFINITY
      );
    const nextPriorities = new Map(
      selection.loadEntries.map((entry) => [
        terrainSelectionKey(entry),
        entry.priority ?? TILE_CAMERA_PRIORITY.PRIMARY,
      ])
    );
    for (const [key, job] of meshJobs) {
      if (
        (nextPriorities.get(key) ?? Number.NEGATIVE_INFINITY) <
        highestPendingPriority
      )
        cancelMeshRequest(key, job.controller);
    }
    let completedEntries = 0;
    publishInBackground();
    void (async () => {
      const failures: ConcurrentLoadFailure<TerrainSelectionEntry>[] = [];
      for (const stage of loadStages) {
        if (!current()) break;
        if (stage.length === 0) continue;
        const loaded = await loadWithConcurrency(
          stage,
          Math.max(
            1,
            payloadAwareConcurrency.getConcurrency(requestConcurrency)
          ),
          async (entry) => {
            if (!current()) throw new Error("Stale terrain selection");
            try {
              return await prepareMesh(terrainSource, entry);
            } finally {
              // Reserve one unit for the final stitched/publication pass.
              if (current())
                setTerrainLoading(
                  true,
                  ++completedEntries / (scheduledKeys.size + 1)
                );
            }
          },
          () => {
            if (current()) publishInBackground();
          }
        );
        failures.push(
          ...loaded.failures.filter(
            ({ error }) =>
              !(error instanceof Error && error.name === "AbortError")
          )
        );
        // Publish first coverage before finer work, yielding to input/painting.
        // This waits only for the cut, never for optional seam refinement.
        if (current()) await requestPublication();
      }
      return { failures };
    })()
      .then(async ({ failures }) => {
        if (!current()) return;
        let transientFailure: unknown = null;
        for (const { value, error } of failures) {
          if (isConfirmedTerrainServerError(error)) {
            unavailableTileKeys.add(terrainTileKey(value.id));
          } else {
            transientFailure ??= error;
          }
        }
        if (transientFailure !== null) {
          options.onError?.(transientFailure);
          scheduleSelectionRetry();
        } else {
          failedSelectionRounds = 0;
        }
        finishedLoading = true;
        await requestPublication();
        if (!current()) return;
        if (
          prefetchView.shadowSignature === shadowViewSignature &&
          failures.length === 0
        )
          previousShadowFrustum = null;
        terrainSource.trimCache(
          new Set(selection.entries.map((entry) => terrainTileKey(entry.id)))
        );
        trimMeshCache(activeMeshKeys);
        setTerrainLoading(false);
        scheduleIdleStitch();
        syncSelectionShadowView();
        if (failures.length === 0)
          recordIdlePrefetchSelection(
            selection,
            latestResolvedSelectionView ?? prefetchView
          );
        if (activeMeshKeys.size === 0) settleReady(failures.length === 0);
        if (
          map &&
          selection.viewportElevationSignature !==
            activeViewportElevationSignature
        ) {
          activeViewportElevationSignature =
            selection.viewportElevationSignature;
          notifySharedThreeTerrainChanged(map);
        }
        map?.triggerRepaint();
        // Reserve failure must not hold foreground readiness or trigger its
        // retries. Retain the old cut and retry on a later selection instead.
        void (async () => {
          for (const entry of reserveEntries) {
            if (!current() || terrainLoading) break;
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
            if (!current() || terrainLoading) break;
            await prepareMesh(terrainSource, entry);
            if (!current()) break;
            await requestPublication();
            trimMeshCache(activeMeshKeys);
          }
        })().catch(() => {
          /* Last published coverage remains intact. */
        });
      })
      .catch((error) => {
        if (!current()) return;
        setTerrainLoading(false);
        syncSelectionShadowView();
        // Stitch/publication can fail after successful downloads. Retry the
        // same view too; its signatures otherwise suppress all future work.
        scheduleSelectionRetry();
        options.onError?.(error);
        settleReady(false);
      });
  };
  void sourcePromise
    .then(async (terrainSource) => {
      await heightMetadata.ready;
      if (disposed) {
        terrainSource.release();
        return;
      }
      source = terrainSource;
      if (map) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          map,
          runtimeId,
          getElevation
        );
        map.triggerRepaint();
      }
    })
    .catch((error) => {
      if (disposed) return;
      setTerrainLoading(false);
      options.onError?.(error);
      settleReady(false);
    });

  takePresentations.set(root, () => {
    const transferred: TerrainMeshRecord[] = [];
    // Cancel old publications before moving their records: late workers must
    // never overwrite geometry now owned by the replacement source runtime.
    invalidateIdlePrefetch();
    selectionGeneration += 1;
    pendingStitch?.controller.abort();
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record) continue;
      meshes.delete(key);
      transferred.push(record);
    }
    activeMeshKeys = new Set();
    return transferred;
  });

  const runSelection = (input: TerrainSelectionInput) => {
    const prefetchView: PrefetchSelectionView = {
      inputSignature: selectionInputSignature,
      shadowSignature: selectionShadowViewSignature,
      viewportBounds: input.viewportBounds,
    };
    selectionRequestPending = true;
    void runTerrainWorkerTask({ kind: "select", input }, conversionAbort.signal)
      .then((result) => {
        // Coalesce camera motion into one latest selection, not stale loads.
        if (disposed || queuedSelectionInput || result.kind !== "select")
          return;
        if (result.selection.signature !== requestedSignature) {
          requestedSignature = result.selection.signature;
          loadSelection(source!, result.selection, prefetchView);
        } else {
          latestResolvedSelectionView = prefetchView;
          reconcileMeshRequests(result.selection);
          if (!terrainLoading)
            recordIdlePrefetchSelection(result.selection, prefetchView);
        }
      })
      .catch((error) => {
        if (disposed || queuedSelectionInput) return;
        options.onError?.(error);
        scheduleSelectionRetry();
      })
      .finally(() => {
        selectionRequestPending = false;
        const queued = queuedSelectionInput;
        queuedSelectionInput = null;
        if (!disposed && queued) runSelection(queued);
        else if (!disposed) map?.triggerRepaint();
      });
  };

  const recordIdlePrefetchSelection = (
    selection: TerrainSelection,
    view: PrefetchSelectionView
  ) => {
    if (
      disposed ||
      terrainLoading ||
      selectionRetryTimer !== null ||
      selectionInputSignature !== view.inputSignature ||
      shadowViewSignature !== view.shadowSignature ||
      selectionShadowViewSignature !== view.shadowSignature ||
      !selection.entries.every((entry) =>
        activeMeshKeys.has(terrainSelectionKey(entry))
      )
    )
      return;
    const cachedTileKeys = new Set(
      [...meshes.values()].map(({ id }) => terrainTileKey(id))
    );
    for (const key of unavailableTileKeys) cachedTileKeys.add(key);
    const visibleEntries = selection.viewportStages.at(-1) ?? [];
    let entries: readonly TerrainSelectionEntry[];
    let shadowEntries: readonly TerrainSelectionEntry[];
    try {
      const input = {
        visibleEntries,
        requiredEntries: selection.entries,
        source: {
          bounds: {
            west: terrainSourceConfig.bounds[0],
            south: terrainSourceConfig.bounds[1],
            east: terrainSourceConfig.bounds[2],
            north: terrainSourceConfig.bounds[3],
          },
          minzoom: terrainSourceConfig.minzoom,
          maxzoom: terrainSourceConfig.maxzoom,
        },
        viewportBounds: view.viewportBounds,
      };
      entries = planTerrainIdlePrefetch({ ...input, cachedTileKeys });
      shadowEntries = planTerrainIdlePrefetch({
        ...input,
        cachedTileKeys: unavailableTileKeys,
      });
    } catch {
      // Optional speculation must not fail foreground publication, including
      // unnormalised world-copy bounds outside this planner's geographic API.
      return;
    }
    idlePrefetchSelection = {
      ...view,
      generation: selectionGeneration,
      selection,
      attemptedKeys: new Set(),
      heightRanges: new Map([
        ...[...meshes.values()].flatMap((record) =>
          shadowEntries.some(
            ({ id }) => terrainTileKey(id) === terrainTileKey(record.id)
          )
            ? [
                [
                  terrainTileKey(record.id),
                  [
                    record.minimumHeightMeters,
                    record.maximumHeightMeters,
                  ] as const,
                ] as const,
              ]
            : []
        ),
        // Full native-raster observations take precedence over resident
        // variants and remain available after the geometry was evicted.
        ...Object.entries(heightMetadata.snapshot()),
      ]),
      entries,
      shadowEntries,
    };
  };

  const isIdlePrefetchCurrent = (
    snapshot: NonNullable<typeof idlePrefetchSelection>
  ) =>
    !disposed &&
    root.visible &&
    !terrainLoading &&
    !selectionRequestPending &&
    queuedSelectionInput === null &&
    selectionRetryTimer === null &&
    idlePrefetchSelection === snapshot &&
    snapshot.generation === selectionGeneration &&
    snapshot.selection.signature === requestedSignature &&
    snapshot.inputSignature === selectionInputSignature &&
    snapshot.shadowSignature === shadowViewSignature &&
    snapshot.shadowSignature === selectionShadowViewSignature;

  const getIdlePrefetchAvailability = () => {
    const snapshot = idlePrefetchSelection;
    const ready =
      source !== null &&
      snapshot !== null &&
      isIdlePrefetchCurrent(snapshot) &&
      payloadAwareConcurrency.getCooldownRemainingMs() === 0;
    return {
      ready: ready && idlePrefetchController === null,
      remaining: ready
        ? snapshot.entries.filter(
            ({ id }) => !snapshot.attemptedKeys.has(terrainTileKey(id))
          ).length
        : 0,
    };
  };

  const prefetchIdleTerrain = async (signal?: AbortSignal) => {
    const availability = getIdlePrefetchAvailability();
    const snapshot = idlePrefetchSelection;
    if (!availability.ready || !snapshot || !source || signal?.aborted)
      return {
        prepared: 0,
        failed: 0,
        remaining: availability.remaining,
        aborted: signal?.aborted ?? false,
      };
    const controller = new AbortController();
    idlePrefetchController = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    let prepared = 0;
    let failed = 0;
    try {
      for (const entry of snapshot.entries) {
        if (controller.signal.aborted || !isIdlePrefetchCurrent(snapshot))
          break;
        const key = terrainTileKey(entry.id);
        if (snapshot.attemptedKeys.has(key)) continue;
        // Even cache hits yield to input/paint; never chain sixteen conversions
        // through one microtask turn. Only one speculative tile is in flight.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        if (controller.signal.aborted || !isIdlePrefetchCurrent(snapshot))
          break;
        if (payloadAwareConcurrency.getCooldownRemainingMs() > 0) break;
        try {
          // A shared source request can be adopted by foreground work. Its
          // first caller owns cancellation, so abort only our subsequent CPU
          // work, never that shared fetch. Cache offers retain their own budget.
          const result = await loadTerrainEntry(
            source,
            entry,
            controller.signal
          );
          result.projectedGeometry?.dispose();
          if (controller.signal.aborted || !isIdlePrefetchCurrent(snapshot))
            break;
          if (
            Number.isFinite(result.tile.minimumHeightMeters) &&
            Number.isFinite(result.tile.maximumHeightMeters) &&
            result.tile.minimumHeightMeters <= result.tile.maximumHeightMeters
          )
            snapshot.heightRanges.set(key, [
              result.tile.minimumHeightMeters,
              result.tile.maximumHeightMeters,
            ]);
          snapshot.attemptedKeys.add(key);
          prepared += 1;
        } catch {
          if (controller.signal.aborted || !isIdlePrefetchCurrent(snapshot))
            break;
          snapshot.attemptedKeys.add(key);
          failed += 1;
          // Speculative failures do not change foreground availability or
          // loading UI, and do not spin their own retry loop.
          break;
        }
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      if (idlePrefetchController === controller) idlePrefetchController = null;
    }
    return {
      prepared,
      failed,
      remaining: getIdlePrefetchAvailability().remaining,
      aborted: controller.signal.aborted || !isIdlePrefetchCurrent(snapshot),
    };
  };

  const prefetchZoom: NonNullable<
    SharedThreeSceneRuntime["prefetchZoom"]
  > = async (request, signal) => {
    const terrainSource = source;
    if (!terrainSource || terrainLoading || signal.aborted) return;
    const [lng, lat] = request.lngLat;
    const focused = zoomSelectionEntries.filter(({ id }) => {
      const bounds = getTileBounds(id);
      return (
        lng >= bounds.west &&
        lng <= bounds.east &&
        lat >= bounds.south &&
        lat <= bounds.north
      );
    });
    if (!focused.length) return;
    const baseLevel = Math.max(...focused.map((entry) => entry.id.level));
    const generation = selectionGeneration;
    const canPrefetch = () =>
      !signal.aborted &&
      !disposed &&
      !terrainLoading &&
      generation === selectionGeneration &&
      !selectionRequestPending &&
      !queuedSelectionInput &&
      !pendingMeshes.size &&
      meshes.size < maxCachedMeshes &&
      cachedMeshBytes() < maxCachedMeshBytes &&
      payloadAwareConcurrency.getCooldownRemainingMs() === 0;
    for (let offset = 1; offset <= request.levels; offset++) {
      if (!canPrefetch()) break;
      const level = baseLevel + offset;
      if (level > maximumLevel) break;
      const id = {
        level,
        x: Math.floor(longitudeToTileX(lng, level)),
        y: Math.floor(latitudeToTileY(lat, level)),
      };
      if (!terrainSource.getTileDataAvailable(id)) break;
      const entry = { id, kind: "source" } as const;
      if (meshes.has(terrainSelectionKey(entry))) continue;
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (!canPrefetch()) break;
      const key = terrainSelectionKey(entry);
      const controller = new AbortController();
      const job = {
        entry,
        controller,
        adopted: false,
        zoomBaseLevel: baseLevel,
      };
      const abort = () => {
        if (!job.adopted) {
          if (meshJobs.get(key) === job) {
            meshJobs.delete(key);
            pendingMeshes.delete(key);
          }
          controller.abort();
        }
      };
      signal.addEventListener("abort", abort, { once: true });
      meshJobs.set(key, job);
      const work = loadTerrainEntry(
        terrainSource,
        entry,
        AbortSignal.any([controller.signal, conversionAbort.signal])
      ).then((result) => {
        if (disposed || controller.signal.aborted)
          result.projectedGeometry?.dispose();
        else {
          ensureMesh(
            result.tile,
            entry,
            result.projectedGeometry,
            result.reliefVertexMask
          );
          trimMeshCache(activeMeshKeys);
        }
      });
      pendingMeshes.set(key, work);
      try {
        await work;
      } finally {
        signal.removeEventListener("abort", abort);
        if (meshJobs.get(key) === job) meshJobs.delete(key);
        if (pendingMeshes.get(key) === work) pendingMeshes.delete(key);
      }
      // Prepared geometry stays in the normal pool, never a partial published
      // quartet. The ordinary selection adopts it without another conversion.
    }
  };

  const getIdleShadowRegions = (): readonly TerrainIdleShadowRegion[] => {
    const snapshot = idlePrefetchSelection;
    if (!source || !snapshot || !isIdlePrefetchCurrent(snapshot)) return [];
    root.updateMatrixWorld(true);
    return snapshot.shadowEntries.map(({ id }) => {
      const key = terrainTileKey(id);
      const bounds = getTileBounds(id);
      const heights =
        snapshot.heightRanges.get(key) ?? unknownTerrainHeightRange;
      const receiverBounds = new Box3();
      const corner = new Vector3();
      for (const longitude of [bounds.west, bounds.east]) {
        for (const latitude of [bounds.south, bounds.north]) {
          for (const height of heights) {
            receiverBounds.expandByPoint(
              projectToLocalWorld(longitude, latitude, height, corner)
            );
          }
        }
      }
      receiverBounds.applyMatrix4(root.matrixWorld);
      return { id: key, terrainLevel: id.level, receiverBounds };
    });
  };

  const prepareIdleShadowRegion: RasterDemTerrainRuntime["prepareIdleShadowRegion"] =
    async (region, signal) => {
      const reject = (
        reason: TerrainIdleShadowReason
      ): TerrainIdleShadowLease => ({
        covered: false,
        group: null,
        dependencyBounds: [],
        reason,
        isCurrent: () => false,
        dispose: () => undefined,
      });
      const snapshot = idlePrefetchSelection;
      const terrainSource = source;
      if (signal?.aborted) return reject(TERRAIN_IDLE_SHADOW_REASON.aborted);
      if (!snapshot || !terrainSource || !getIdlePrefetchAvailability().ready)
        return reject(TERRAIN_IDLE_SHADOW_REASON.unavailable);
      const finiteBox = (bounds: Box3) =>
        !bounds.isEmpty() &&
        [...bounds.min.toArray(), ...bounds.max.toArray()].every(
          Number.isFinite
        );
      if (
        !finiteBox(region.receiverBounds) ||
        !finiteBox(region.casterBounds) ||
        !region.casterBounds.containsBox(region.receiverBounds) ||
        !getIdleShadowRegions().some(
          (candidate) =>
            candidate.terrainLevel === region.terrainLevel &&
            candidate.receiverBounds.intersectsBox(region.receiverBounds)
        )
      )
        return reject(TERRAIN_IDLE_SHADOW_REASON.unavailable);

      root.updateMatrixWorld(true);
      const rootWorld = root.matrixWorld.clone();
      const localFromWorld = rootWorld.clone().invert();
      const localBounds = region.casterBounds
        .clone()
        .applyMatrix4(localFromWorld);
      const southwest = new MercatorCoordinate(
        origin.x + localBounds.min.x * meterScale,
        origin.y + localBounds.max.z * meterScale
      ).toLngLat();
      const northeast = new MercatorCoordinate(
        origin.x + localBounds.max.x * meterScale,
        origin.y + localBounds.min.z * meterScale
      ).toLngLat();
      const activeTiles = [...activeMeshKeys].flatMap((key) => {
        const record = meshes.get(key);
        return record?.node.visible
          ? [
              {
                id: record.id,
                complete:
                  record.reliefMesh !== null &&
                  Number.isFinite(record.minimumHeightMeters) &&
                  Number.isFinite(record.maximumHeightMeters) &&
                  (noDataHeightMeters === undefined ||
                    terrainHeightRangeExcludesNoData(
                      record,
                      noDataHeightMeters
                    )),
              },
            ]
          : [];
      });
      const plan = planTerrainIdleShadowRegion({
        casterBounds: {
          west: southwest.lng,
          south: southwest.lat,
          east: northeast.lng,
          north: northeast.lat,
        },
        terrainLevel: region.terrainLevel,
        source: {
          bounds: {
            west: terrainSourceConfig.bounds[0],
            south: terrainSourceConfig.bounds[1],
            east: terrainSourceConfig.bounds[2],
            north: terrainSourceConfig.bounds[3],
          },
          minzoom: terrainSourceConfig.minzoom,
          maxzoom: terrainSourceConfig.maxzoom,
        },
        activeTiles,
        isAvailable: (id) =>
          !unavailableTileKeys.has(terrainTileKey(id)) &&
          terrainSource.getTileDataAvailable(id),
      });
      if (plan.reason) return reject(plan.reason);

      const controller = new AbortController();
      idlePrefetchController = controller;
      const group = new Group();
      group.name = `${runtimeId}-idle-shadow-terrain`;
      group.matrixAutoUpdate = false;
      // The host attaches this world-space group only during its depth pass.
      group.matrix.copy(rootWorld);
      const geometries = new Set<BufferGeometry>();
      const buffers = new Set<ArrayBufferLike>();
      let geometryBytes = 0;
      let preparing = true;
      let leaseDisposed = false;
      let complete = false;
      let reason: TerrainIdleShadowReason | undefined;
      const isCurrent = () => {
        root.updateMatrixWorld(true);
        return (
          !leaseDisposed &&
          !controller.signal.aborted &&
          source === terrainSource &&
          isIdlePrefetchCurrent(snapshot) &&
          root.matrixWorld.equals(rootWorld)
        );
      };
      const releaseSlot = () => {
        signal?.removeEventListener("abort", abort);
        controller.signal.removeEventListener("abort", disposeLease);
        if (idlePrefetchController === controller)
          idlePrefetchController = null;
        if (idleShadowLease === lease) idleShadowLease = null;
      };
      const disposeLease = () => {
        if (!leaseDisposed) {
          leaseDisposed = true;
          group.removeFromParent();
          group.clear();
          for (const geometry of geometries) geometry.dispose();
          geometries.clear();
          buffers.clear();
        }
        // A shared source fetch may still be in flight. Keep its slot occupied
        // until it resolves rather than starting a second speculative job.
        if (!preparing) releaseSlot();
      };
      const abort = () => controller.abort();
      const lease: TerrainIdleShadowLease = {
        get covered() {
          return complete && isCurrent();
        },
        get group() {
          return leaseDisposed ? null : group;
        },
        dependencyBounds: [region.casterBounds.clone()],
        get reason() {
          return controller.signal.aborted
            ? TERRAIN_IDLE_SHADOW_REASON.aborted
            : reason;
        },
        isCurrent,
        dispose: disposeLease,
      };
      idleShadowLease = lease;
      signal?.addEventListener("abort", abort, { once: true });
      controller.signal.addEventListener("abort", disposeLease, { once: true });
      if (signal?.aborted) controller.abort();
      try {
        for (const entry of plan.entries) {
          await new Promise<void>((resolve) => setTimeout(resolve, 0));
          if (!isCurrent()) {
            reason = TERRAIN_IDLE_SHADOW_REASON.aborted;
            break;
          }
          if (payloadAwareConcurrency.getCooldownRemainingMs() > 0) {
            reason = TERRAIN_IDLE_SHADOW_REASON.unavailable;
            break;
          }
          const result = await loadTerrainEntry(
            terrainSource,
            entry,
            controller.signal
          );
          const geometry = result.projectedGeometry;
          if (geometry) geometries.add(geometry);
          if (!isCurrent()) {
            reason = TERRAIN_IDLE_SHADOW_REASON.aborted;
            break;
          }
          // Native source tiles cover their whole grid. Partitioned no-data
          // relief does not; never cache a depth page that assumes those holes
          // are known empty space. This validation runs only in the idle task.
          if (
            !geometry?.index?.count ||
            geometry.index.count !== result.tile.indices.length ||
            geometry.getAttribute("position").count !==
              result.tile.heightMeters.length ||
            !geometry.boundingBox ||
            !finiteBox(geometry.boundingBox) ||
            terrainTileKey(result.tile.id) !== terrainTileKey(entry.id) ||
            result.tile.heightMeters.length === 0 ||
            result.reliefVertexMask.length !== result.tile.heightMeters.length
          ) {
            reason = TERRAIN_IDLE_SHADOW_REASON.missing;
            break;
          }
          // Typed-binary cache attributes can be views of one larger record.
          // Count unique retained backing buffers, not only attribute slices.
          for (const attribute of [
            ...Object.values(geometry.attributes),
            geometry.index,
          ]) {
            const buffer = attribute.array.buffer;
            if (buffers.has(buffer)) continue;
            buffers.add(buffer);
            geometryBytes += buffer.byteLength;
          }
          if (geometryBytes > MAXIMUM_IDLE_SHADOW_GEOMETRY_BYTES) {
            reason = TERRAIN_IDLE_SHADOW_REASON.budget;
            break;
          }
          const heights = result.tile.heightMeters;
          for (
            let offset = 0;
            offset < heights.length;
            offset += IDLE_SHADOW_VALIDATION_CHUNK_VERTICES
          ) {
            const end = Math.min(
              heights.length,
              offset + IDLE_SHADOW_VALIDATION_CHUNK_VERTICES
            );
            for (let index = offset; index < end; index += 1) {
              const height = heights[index];
              if (
                result.reliefVertexMask[index] !== 1 ||
                !Number.isFinite(height) ||
                (noDataHeightMeters !== undefined &&
                  Math.abs(height - noDataHeightMeters) <=
                    NO_DATA_EPSILON_METERS)
              ) {
                reason = TERRAIN_IDLE_SHADOW_REASON.missing;
                break;
              }
            }
            if (reason) break;
            if (end < heights.length) {
              // Even validation of a restored native grid remains interruptible.
              await new Promise<void>((resolve) => setTimeout(resolve, 0));
              if (!isCurrent()) {
                reason = TERRAIN_IDLE_SHADOW_REASON.aborted;
                break;
              }
            }
          }
          if (reason) break;
          const mesh = new Mesh(geometry, material);
          mesh.name = `${group.name}-${terrainTileKey(entry.id)}`;
          mesh.userData.isShadowTerrainSurface = true;
          mesh.castShadow = true;
          mesh.receiveShadow = false;
          group.add(mesh);
        }
        complete = reason === undefined && isCurrent();
      } catch {
        reason =
          controller.signal.aborted || !isCurrent()
            ? TERRAIN_IDLE_SHADOW_REASON.aborted
            : TERRAIN_IDLE_SHADOW_REASON.missing;
      } finally {
        preparing = false;
        if (!complete) disposeLease();
      }
      return lease;
    };

  return {
    id: runtimeId,
    originLngLat,
    root,
    providesTerrain: true,
    receivesMapStyleTexture:
      options.receivesMapStyleTexture === true
        ? (candidate) => candidate === material
        : false,
    mapStyleProjectionVersion: () => mapStyleProjectionVersion,
    updatePriority: TERRAIN_UPDATE_PRIORITY,
    ready,
    setErrorTarget(value: number) {
      if (!Number.isFinite(value) || value <= 0)
        throw new RangeError(
          "Terrain error target must be positive and finite"
        );
      if (disposed || value === errorTargetPixels) return;
      errorTargetPixels = value;
      debugErrorDirty = true;
      selectionInputSignature = "";
      map?.triggerRepaint();
    },
    getIdlePrefetchAvailability,
    prefetchIdleTerrain,
    prefetchZoom,
    getRequestDemand: () =>
      Number(terrainLoading) +
      Number(selectionRequestPending) +
      pendingMeshes.size +
      Number(queuedSelectionInput !== null),
    isBaseViewReady: () => activeMeshKeys.size > 0,
    getIdleShadowRegions,
    prepareIdleShadowRegion,
    adoptPresentation(previous) {
      if (disposed || previous === this) return;
      if (selectionGeneration !== 0 || activeMeshKeys.size > 0)
        throw new Error(
          "Terrain presentation can only be adopted before selection starts"
        );
      if (
        previous.originLngLat[0] !== originLngLat[0] ||
        previous.originLngLat[1] !== originLngLat[1]
      )
        throw new Error("Terrain presentation requires the same local origin");
      const records = takePresentations.get(previous.root)?.() ?? [];
      const keys = new Set<string>();
      for (const record of records) {
        const key = `fallback:${terrainTileKey(record.id)}`;
        record.debugMaterial?.dispose();
        record.debugMaterial =
          options.debugScreenError && record.reliefMesh
            ? new MeshLambertMaterial({
                color: 0x000000,
                emissive: 0x38bdf8,
                toneMapped: false,
              })
            : undefined;
        if (record.reliefMesh) record.reliefMesh.material = material;
        record.lastUsed = ++meshUseClock;
        meshes.set(key, record);
        root.add(record.node);
        keys.add(key);
      }
      activeMeshKeys = keys;
      closeDisplayStages(keys);
      mapStyleProjectionVersion += 1;
      contentChangedSinceFrame = true;
      applyMeshVisibility();
      if (keys.size > 0) settleReady(true);
      map?.triggerRepaint();
    },
    onAdd(mapInstance) {
      map = mapInstance;
      map.on?.(MAPLIBRE_EVENT.MOVE_START, handleIdlePrefetchMovement);
      map.on?.(MAPLIBRE_EVENT.MOVE_END, handleMovementEnd);
      setSharedThreeTerrainLoading(mapInstance, runtimeId, terrainLoading);

      if (source && !unregisterSampler) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          mapInstance,
          runtimeId,
          getElevation
        );
      }
      map.triggerRepaint();
    },
    update(frame) {
      latestRenderCamera = frame.renderCamera;
      if (options.debugScreenError) {
        debugCameraPosition.copy(frame.lodCamera.position);
        debugViewportHeight = (frame.cssViewport ?? frame.viewport).y;
        debugFovDegrees = frame.lodCamera.fov;
      }
      if (disposed || !root.visible) return;
      if (!source) return;
      const nextCameraSignature = tileCameraViewsSignature(
        frame.tileCameraViews ?? []
      );
      const tileCamerasChanged = nextCameraSignature !== tileCameraSignature;
      if (tileCamerasChanged) {
        tileCameraSignature = nextCameraSignature;
        tileCameraDemand = createTileCameraDemand(frame.tileCameraViews ?? []);
      }
      latestRenderCamera.updateMatrixWorld(true);
      nextObserverProjection.multiplyMatrices(
        latestRenderCamera.projectionMatrix,
        latestRenderCamera.matrixWorldInverse
      );
      if (
        !observerProjection.equals(nextObserverProjection) ||
        contentChangedSinceFrame ||
        tileCamerasChanged ||
        debugErrorDirty
      ) {
        observerProjection.copy(nextObserverProjection);
        // Solar samples do not change observer roles. Only camera/content
        // events require another terrain-bounds walk.
        observerFrustumReady =
          observerProjection.elements.every(Number.isFinite) &&
          !latestRenderCamera.projectionMatrix.equals(identityProjection);
        if (observerFrustumReady)
          observerFrustum.setFromProjectionMatrix(
            observerProjection,
            latestRenderCamera.coordinateSystem,
            latestRenderCamera.reversedDepth
          );
        applyMeshVisibility();
        debugErrorDirty = false;
      }
      if (contentChangedSinceFrame) {
        contentChangedSinceFrame = false;
        // Compare only at publication, never per camera frame. A same-bounds
        // stitch/normal update still changes the receiver and must invalidate it.
        root.updateMatrixWorld(true);
        const nextGeometry = new Map<
          string,
          { revision: string; bounds: Box3 }
        >();
        const changedBounds: Box3[] = [];
        for (const key of activeMeshKeys) {
          const record = meshes.get(key);
          const geometry = record?.reliefMesh?.geometry;
          if (!record?.node.visible || !geometry) continue;
          const revision = [
            geometry.id,
            (geometry.getAttribute("position") as BufferAttribute).version,
            (geometry.getAttribute("normal") as BufferAttribute).version,
            geometry.index?.version,
            ...record.reliefMesh!.matrixWorld.elements,
          ].join(",");
          const bounds = new Box3();
          getTerrainMeshWorldBounds(record, bounds);
          const previous = publishedShadowGeometry.get(key);
          nextGeometry.set(key, { revision, bounds });
          if (
            !previous ||
            previous.revision !== revision ||
            !previous.bounds.equals(bounds)
          ) {
            changedBounds.push(
              previous ? bounds.clone().union(previous.bounds) : bounds.clone()
            );
          }
        }
        for (const [key, previous] of publishedShadowGeometry) {
          if (!nextGeometry.has(key)) changedBounds.push(previous.bounds);
        }
        publishedShadowGeometry = nextGeometry;
        options.onContentChanged?.(changedBounds);
      }
      if (selectionGeneration === 0) syncSelectionShadowView();
      const inputSignature = computeSelectionInputSignature(frame);
      if (inputSignature === selectionInputSignature) return;
      invalidateIdlePrefetch();
      selectionInputSignature = inputSignature;

      if (typeof Worker === "undefined") {
        const selection = buildSelection(source, frame);
        const prefetchView = {
          inputSignature,
          shadowSignature: selectionShadowViewSignature,
          viewportBounds: getViewportBounds(frame.map),
        };
        if (selection.signature !== requestedSignature) {
          requestedSignature = selection.signature;
          loadSelection(source, selection, prefetchView);
        } else {
          latestResolvedSelectionView = prefetchView;
          reconcileMeshRequests(selection);
          if (!terrainLoading)
            recordIdlePrefetchSelection(selection, prefetchView);
        }
        return;
      }
      const input = snapshotSelectionInput(source, frame);
      // Selection can remain superseded throughout continuous movement. This
      // bounded pending-only pass cancels proven offscreen work on every change;
      // exact LOD/corridor refinement stays in the worker, never in this loop.
      rejectOffscreenMeshRequests(input);
      if (selectionRequestPending) queuedSelectionInput = input;
      else runSelection(input);
    },
    setShadowView(view) {
      if (shadowView && !previousShadowFrustum) {
        previousShadowFrustum = new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(
            shadowView.camera.projectionMatrix,
            shadowView.camera.matrixWorldInverse
          ),
          shadowView.camera.coordinateSystem,
          shadowView.camera.reversedDepth
        );
      }
      // Controller cameras are mutable. Freeze the selection epoch rather than
      // letting a later refit silently change the active caster-retention volume.
      view?.camera.updateMatrixWorld(true);
      shadowView = view
        ? {
            camera: view.camera.clone(),
            shadowMapSize: normalizeShadowMapSize(view.shadowMapSize),
          }
        : null;
      if (!view) previousShadowFrustum = null;
      const nextSignature = getSharedThreeShadowViewSignature(shadowView);
      if (nextSignature !== shadowViewSignature) {
        invalidateIdlePrefetch();
        shadowViewSignature = nextSignature;
        if (!terrainLoading) syncSelectionShadowView();
      }
    },
    setMaterialColor(color) {
      material.color.set(color);
      map?.triggerRepaint();
    },
    getElevation,
    getViewElevationRange,
    getViewSourceHeightRange,
    getActiveTileVolumes,
    isShadowRegionReady: (bounds) => {
      if (
        disposed ||
        selectionRequestPending ||
        queuedSelectionInput ||
        shadowDependencies.length === 0
      )
        return false;
      const dependencies = shadowDependencies.filter((tile) =>
        tile.bounds.intersectsBox(bounds)
      );
      return (
        dependencies.length > 0 &&
        dependencies.every(
          ({ key }) =>
            activeMeshKeys.has(key) && Boolean(meshes.get(key)?.reliefMesh)
        )
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelIdleStitch();
      if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
      motionSettleTimer = null;
      heightMetadata.dispose();
      invalidateIdlePrefetch();
      map?.off?.(MAPLIBRE_EVENT.MOVE_START, handleIdlePrefetchMovement);
      map?.off?.(MAPLIBRE_EVENT.MOVE_END, handleMovementEnd);
      takePresentations.delete(root);
      conversionAbort.abort();
      source?.release();
      source = null;
      clearSelectionRetry();
      selectionGeneration += 1;
      unregisterSampler?.();
      unregisterSampler = null;
      if (map) setSharedThreeTerrainLoading(map, runtimeId, false, 0, false);
      for (const record of meshes.values()) {
        record.reliefMesh?.geometry.dispose();
        record.debugMaterial?.dispose();
      }
      meshes.clear();
      publishedShadowGeometry.clear();
      material.dispose();
      casterMaterial.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};

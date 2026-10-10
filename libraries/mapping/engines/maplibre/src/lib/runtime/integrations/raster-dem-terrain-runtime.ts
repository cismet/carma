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
} from "three";

import type { RasterDemTerrainResource } from "@carma-commons/resources";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import {
  geographicBoundsIntersect,
  intersectUnwrappedGeographicBounds,
} from "@carma-geo/helpers";

import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import { meshBaseMemoryBudget } from "../../core/mesh-error-policy";
import {
  resolveTilesCacheCeiling,
  resolveTilesCacheMaximum,
  TILE_MEMORY_ALLOCATION_ERROR,
} from "../../core/tile-cache-policy";
import { readTileDeviceProfile } from "./tile-device-profile";
import {
  CACHE_CEILING_FAILURE_FRACTION,
  CACHE_CEILING_REASON,
  getCacheCeilingStorage,
  learnCacheCeiling,
  readCacheCeilingMemory,
  writeCacheCeilingMemory,
} from "./three-tiles-cache-ceiling-memory";
import { planTerrainBaseStages } from "../../core/terrain-base-coverage";
import { createRasterDemTerrainBaseCache } from "./raster-dem-terrain-base-coverage";
import { createProjectedTerrainGeometryCache } from "./projected-terrain-geometry-cache";
import { createPersistentTileUsageQueue } from "./persistent-tile-usage";
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
import type { TerrainBoundarySide } from "../../core/terrain-boundary-key";
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
import { buildTerrainSelection } from "../../core/terrain-selection";
import { createTerrainGeodeticProjection } from "../../core/terrain-geometry-projection";
import { createTerrainEcefPresentation } from "./terrain-ecef-presentation";
import { createTerrainRuntimeFrame } from "./terrain-runtime-frame";
import {
  TERRAIN_SELECTION_KIND,
  type TerrainSelection,
  type TerrainSelectionEntry,
  type TerrainSelectionInput,
} from "../../core/terrain-selection-types";
import { createTerrainTileHeightSampler } from "../../core/terrain-tile-height-sampler";
import { TERRAIN_WORKER_TASK_KIND } from "../../core/terrain-worker-protocol";
import {
  createTileCameraDemand,
  TILE_CAMERA_PRIORITY,
  tileCameraViewsSignature,
} from "../../core/tile-camera-demand";
import { planTileLoadStages } from "../../core/tile-load-plan";
import {
  createTerrainMemoryAdmission,
  planTerrainAdmissionFamilies,
  TerrainMemoryDeferredError,
} from "../../core/terrain-memory-admission";
import {
  TILE_VOLUME_KIND,
  TILE_VOLUME_LOAD_REASON,
  TILE_VOLUME_STATE,
} from "../../core/tile-volume";
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
import type { TerrainStitchInput } from "./terrain-boundary-stitch";
import { createTerrainHeightMetadataIndex } from "./terrain-height-metadata-index";
import { prepareEqualLevelTerrainBoundaries } from "./raster-dem-terrain-equal-level-seams";
import { createRasterDemTerrainSeamCoordinator } from "./raster-dem-terrain-seam-coordinator";
import { loadRasterDemTerrainStages } from "./raster-dem-terrain-stage-loading";
import {
  computeRasterDemSelectionInputSignature,
  getViewportBounds,
  snapshotRasterDemTerrainSelectionInput,
} from "./raster-dem-terrain-selection-snapshot";
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
  /** Preserve authored raster colors without scene lighting or shadows. */
  unlit?: boolean;
}>;

export type RasterDemTerrainRuntimeOptions = Readonly<{
  /** Physical ECEF surface or the explicit native planar presentation. */
  geometryProjection?: "ecef" | "mercator";
  /** Optional source datum correction; applied only to the ECEF display. */
  heightOffsetMeters?: (longitude: number, latitude: number) => number;
  /** Conservative range of that correction, used by curved selection bounds. */
  heightOffsetRangeMeters?: readonly [minimum: number, maximum: number];
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
  /** Prepare complete source-wide fallback cuts, lowest priority after convergence. */
  persistBaseTiles?: boolean;
  /** Effective longest input-raster edge; stages are built coarse to fine. */
  baseRasterEdgePixels?: number;
  /** Same 5–15% resident reserve policy as terrain-providing 3D Tiles. */
  baseCoverageMemoryShare?: number;
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
  /** Keep height sampling resident while disabling terrain drawing and shadows. */
  groundVisible?: boolean;
  /** Project MapLibre ground styling onto this terrain before lighting. */
  receivesMapStyleTexture?: boolean;
  /** Published old-union-new bounds, including stitched normals/topology changes. */
  onContentChanged?: (changedBounds: readonly Box3[]) => void;
  onError?: (error: unknown) => void;
}>;

export interface RasterDemTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
  getTerrainCacheStats: () => {
    cachedMeshes: number;
    cachedMeshBytes: number;
    reservedMeshBytes: number;
    memoryDeferred: boolean;
    cacheCeilingBytes: number;
    baseline: ReturnType<
      ReturnType<typeof createRasterDemTerrainBaseCache>["snapshot"]
    >;
  };
  /** Published cut only; borrowed meshes remain owned by this runtime. */
  getPublishedTerrainTiles: () => readonly Readonly<{
    tile: TerrainTile;
    mesh: Mesh;
    bounds: Box3;
  }>[];
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
  setGroundVisible: (visible: boolean) => void;
  /** Freeze viewport tile demand while retaining the published cut and samplers. */
  setTileDemandPaused: (paused: boolean) => void;
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
  sourceTile: TerrainTile;
  sourceGeometryBounds: Box3 | null;
  sourceGeometrySphere: Sphere | null;
  reliefVertexMask: Uint8Array;
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
   * Coarser demand for new tiles while moving; published visible detail stays.
   * Resume the configured selection once the map holds still.
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
  const deviceProfile = readTileDeviceProfile();
  const cacheCeilingStorage = getCacheCeilingStorage();
  let learnedCacheCeiling =
    readCacheCeilingMemory(cacheCeilingStorage).learnedBytes;
  const maximumDeviceCacheBytes = resolveTilesCacheMaximum(deviceProfile);
  const initialMaxCachedMeshBytes = Math.min(
    maximumDeviceCacheBytes,
    learnedCacheCeiling ?? Infinity,
    clampInteger(
      options.maxCachedMeshBytes,
      resolveTilesCacheCeiling(deviceProfile, undefined, learnedCacheCeiling),
      1
    )
  );
  let maxCachedMeshBytes = initialMaxCachedMeshBytes;
  let lastAllocationLessonAt = -Infinity;
  const reportTerrainError = (error: unknown) => {
    const now = performance.now();
    if (
      TILE_MEMORY_ALLOCATION_ERROR.test(String(error)) &&
      now - lastAllocationLessonAt >= 30_000
    ) {
      lastAllocationLessonAt = now;
      const resident = cachedMeshBytes();
      const lesson = learnCacheCeiling(
        readCacheCeilingMemory(cacheCeilingStorage),
        Math.min(maxCachedMeshBytes, resident || maxCachedMeshBytes) *
          CACHE_CEILING_FAILURE_FRACTION,
        CACHE_CEILING_REASON.ALLOCATION
      );
      learnedCacheCeiling = lesson.learnedBytes;
      writeCacheCeilingMemory(cacheCeilingStorage, lesson);
      maxCachedMeshBytes = Math.min(maxCachedMeshBytes, learnedCacheCeiling!);
      invalidateIdlePrefetch();
      baseCoverage.setMemoryBudget(
        meshBaseMemoryBudget(
          maxCachedMeshBytes,
          options.baseCoverageMemoryShare
        )
      );
      // Keep live receivers, their casters and the complete resident baseline.
      // Only unused cached records make room for a bounded retry.
      trimMeshCache(activeMeshKeys);
      map?.triggerRepaint();
    }
    options.onError?.(error);
  };
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
  const heightOffsetRange = options.heightOffsetRangeMeters ?? [0, 0];
  if (
    options.geometryProjection === "ecef" &&
    ((options.heightOffsetMeters && !options.heightOffsetRangeMeters) ||
      !heightOffsetRange.every(Number.isFinite) ||
      heightOffsetRange[0] > heightOffsetRange[1])
  )
    throw new RangeError(
      "ECEF terrain height correction needs a finite ordered range"
    );
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
  const geodeticOrigin =
    options.geometryProjection === "ecef" ? originLngLat : undefined;
  const geodetic = geodeticOrigin
    ? createTerrainGeodeticProjection(geodeticOrigin)
    : null;
  const terrainCacheSource = JSON.stringify([
    terrainSourceConfig.url,
    terrainSourceConfig.revision ?? null,
    terrainSourceConfig.verticalDatum,
    terrainSourceConfig.format,
    terrainSourceConfig.encoding,
    terrainSourceConfig.tileSize,
    terrainSourceConfig.bounds,
    terrainSourceConfig.minzoom,
    terrainSourceConfig.maxzoom,
    meshSegments,
    options.maximumMeshSegments,
    maximumMeshErrorMeters,
    noDataHeightMeters,
  ]);
  const ecefPresentation = geodeticOrigin
    ? createTerrainEcefPresentation(
        geodeticOrigin,
        options.heightOffsetMeters,
        // Geoportal persists the selected presentation with its seam inputs in
        // one prepared record; the standalone ECEF cache is not a second copy.
        undefined,
        () => {
          if (disposed) return;
          contentChangedSinceFrame = true;
          mapStyleProjectionVersion += 1;
          map?.triggerRepaint();
        },
        reportTerrainError,
        (bytes) => canRetainTerrainBytes(bytes)
      )
    : null;
  const preparedGeometryCache = createProjectedTerrainGeometryCache(
    terrainCacheSource,
    originLngLat,
    noDataHeightMeters,
    options.persistBaseTiles &&
      !(ecefPresentation && options.heightOffsetMeters)
      ? producerAssetUrl
      : undefined,
    {
      presentationMode: ecefPresentation ? "ecef" : "native",
      minimumSourceLevel: terrainSourceConfig.minzoom,
      sourceRevision: terrainSourceConfig.revision,
    }
  );
  const persistentTileUsage = createPersistentTileUsageQueue({
    key: terrainTileKey,
    write: async (ids) => {
      await preparedGeometryCache.markUsed(ids);
    },
  });
  // Only an ECEF runtime owns this extra group. Never parent root to itself.
  const contentRoot = ecefPresentation ? ecefPresentation.root : root;
  if (ecefPresentation) root.add(ecefPresentation.root);
  const terrainFrame = geodeticOrigin ? createTerrainRuntimeFrame() : null;
  let groundVisible = options.groundVisible !== false;
  let tileDemandPaused = false;
  let tileDemandGeneration = 0;
  // Foreground network lease: unlike tileDemandPaused it keeps the demand
  // epoch. Admitted entries wait before their source request (zero new
  // downloads) and continue the same selection on release.
  let loadingPaused = false;
  const loadingResumers = new Set<() => void>();
  const whenLoadingResumed = (signal: AbortSignal): Promise<void> => {
    if (!loadingPaused) return Promise.resolve();
    if (signal.aborted) return Promise.reject(signal.reason);
    return new Promise<void>((resolve, reject) => {
      const resume = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      };
      const abort = () => {
        loadingResumers.delete(resume);
        reject(signal.reason);
      };
      loadingResumers.add(resume);
      signal.addEventListener("abort", abort, { once: true });
    });
  };
  const GroundMaterial = options.material?.unlit
    ? MeshBasicMaterial
    : MeshLambertMaterial;
  const material = new GroundMaterial({
    color: options.material?.color ?? DEFAULT_TERRAIN_COLOR,
    colorWrite: groundVisible,
    depthTest: true,
    depthWrite: groundVisible,
    transparent: !groundVisible,
    // No ground is visible before the projection shader has been installed.
    opacity: groundVisible ? 1 : 0,
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
  let previousShadowView: SharedThreeSceneShadowView | null = null;
  const worldShadowView = (view: SharedThreeSceneShadowView | null) =>
    view && terrainFrame
      ? { ...view, camera: terrainFrame.toWorldCamera(view.camera) }
      : view;
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
    if (disposed || tileDemandPaused || selectionRetryTimer !== null) return;
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
      if (disposed || tileDemandPaused) return;
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
    mapMoving = true;
    if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
    motionSettleTimer = null;
  };

  /** The gesture ended: settle, then cut once at the configured target. */
  const handleMovementEnd = () => {
    if (tileDemandPaused) {
      if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
      motionSettleTimer = null;
      mapMoving = false;
      return;
    }
    scheduleIdleStitch();
    if (!mapMoving) return;
    if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
    motionSettleTimer = setTimeout(() => {
      motionSettleTimer = null;
      if (disposed) return;
      mapMoving = false;
      selectionInputSignature = "";
      // The requested cut may already be loaded but held behind visible detail.
      // Re-publish it now even if selection resolves to the same tile IDs.
      requestedSignature = "";
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
        kind: TERRAIN_WORKER_TASK_KIND.PROJECT,
        tile,
        origin: { x: origin.x, y: origin.y, z: origin.z },
      },
      signal
    );
    if (result.kind !== TERRAIN_WORKER_TASK_KIND.PROJECT)
      throw new Error("Unexpected terrain projection result");
    return restoreWorkerGeometry({
      ...result,
      indices: result.indicesUnchanged ? tile.indices : result.indices,
    });
  };

  const restoreWorkerGeometry = (
    result: Omit<
      Extract<
        TerrainWorkerResult,
        { kind: typeof TERRAIN_WORKER_TASK_KIND.PROJECT }
      >,
      "kind" | "indicesUnchanged"
    >
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
    const restored = await preparedGeometryCache.get(
      entry.id,
      maximumMeshErrorMeters
    );
    if (signal.aborted) {
      restored?.geometry?.dispose();
      restored?.cachedEcefGeometry?.dispose();
    }
    signal.throwIfAborted();
    if (restored) {
      heightMetadata.record(restored.tile);
      try {
        const cachedEcefGeometry = restored.geometry
          ? await ecefPresentation?.prepare(
              restored.geometry,
              restored.tile,
              signal,
              restored.cachedEcefGeometry
            )
          : null;
        return {
          tile: restored.tile,
          projectedGeometry: restored.geometry,
          reliefVertexMask: restored.reliefVertexMask,
          cachedEcefGeometry: cachedEcefGeometry ?? null,
        };
      } catch (error) {
        restored.geometry?.dispose();
        throw error;
      }
    }
    do {
      await whenLoadingResumed(signal);
      signal.throwIfAborted();
    } while (loadingPaused);
    const statsKey = terrainSelectionKey(entry);
    let tile: TerrainTile;
    markTileStage(statsKey, null);
    const requestStart = performance.now();
    try {
      // A disk-cache lookup may have yielded just before the preview froze
      // demand. Already admitted source requests can finish into the cache.
      if (tileDemandPaused)
        throw new DOMException("Terrain tile demand is paused", "AbortError");
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
    try {
      const cachedEcefGeometry = prepared.projectedGeometry
        ? await ecefPresentation?.prepare(
            prepared.projectedGeometry,
            tile,
            signal
          )
        : null;
      return { ...prepared, cachedEcefGeometry: cachedEcefGeometry ?? null };
    } catch (error) {
      prepared.projectedGeometry?.dispose();
      throw error;
    }
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
          kind: TERRAIN_WORKER_TASK_KIND.PARTITION,
          positions: geometry.getAttribute("position").array as Float32Array,
          indices: geometry.index!.array as Uint16Array | Uint32Array,
          heights: tile.heightMeters,
          noDataHeightMeters,
        },
        signal
      );
      if (result.kind !== TERRAIN_WORKER_TASK_KIND.PARTITION)
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
  let terrainMemoryDeferred = false;
  let deferredResidentBytes = Infinity;
  let reserveSelectionEntries: readonly TerrainSelectionEntry[] = [];
  let siblingCompletionEntries: readonly TerrainSelectionEntry[] = [];
  const cancelMeshRequest = (key: string, controller: AbortController) => {
    if (meshJobs.get(key)?.controller !== controller) return;
    terrainMemoryAdmission.release(key);
    meshJobs.delete(key);
    pendingMeshes.delete(key);
    controller.abort(new DOMException("Terrain demand changed", "AbortError"));
  };
  const reconcileMeshRequests = (selection: TerrainSelection) => {
    siblingCompletionEntries = siblingCompletionEntries.filter(({ id }) => {
      const parent = {
        level: id.level - 1,
        x: Math.floor(id.x / 2),
        y: Math.floor(id.y / 2),
      };
      return selection.entries.some(
        (entry) =>
          entry.id.level >= id.level && terrainTileContains(parent, entry.id)
      );
    });
    requiredPreparationKeys = new Set(
      [
        ...selection.loadEntries,
        ...reserveSelectionEntries,
        ...siblingCompletionEntries,
      ].map(terrainSelectionKey)
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
    terrainMemoryAdmission.reconcile(
      new Set([...requiredPreparationKeys, ...meshJobs.keys()])
    );
  };
  const prepareMesh = (
    source: RasterDemTerrainTileSource,
    entry: TerrainSelectionEntry
  ): Promise<void> => {
    const key = terrainSelectionKey(entry);
    if (tileDemandPaused) return Promise.resolve();
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
      .then((result) => {
        const {
          tile,
          projectedGeometry,
          reliefVertexMask,
          cachedEcefGeometry,
        } = result;
        if (disposed || controller.signal.aborted) {
          projectedGeometry?.dispose();
          cachedEcefGeometry?.dispose();
        } else {
          ensureMesh(
            tile,
            entry,
            projectedGeometry,
            reliefVertexMask,
            cachedEcefGeometry
          );
          trimMeshCache(activeMeshKeys);
        }
      })
      .catch((error) => {
        if (error instanceof TerrainMemoryDeferredError) {
          rejectTerrainMemoryFamily(key);
        }
        throw error;
      })
      .finally(() => {
        if (pendingMeshes.get(key) === work) {
          terrainMemoryAdmission.release(key);
          pendingMeshes.delete(key);
        }
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
    reliefVertexMask: Uint8Array,
    cachedEcefGeometry: BufferGeometry | null = null
  ) => {
    const key = terrainSelectionKey(entry);
    // Building the Three objects is its own cost; what remains after it is the
    // wait until a cut publishes the tile.
    const buildStart = performance.now();
    if (tileStats.has(key)) markTileStage(key, null);
    const cached = meshes.get(key);
    if (cached) {
      projectedGeometry?.dispose();
      cachedEcefGeometry?.dispose();
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
      reliefMesh.visible = groundVisible;
      reliefMesh.userData.isShadowTerrainSurface = true;
      reliefMesh.name = `${node.name}-relief`;
      reliefMesh.castShadow = groundVisible;
      reliefMesh.receiveShadow = groundVisible;
      node.add(reliefMesh);
    }
    node.visible = false;
    try {
      if (reliefMesh)
        ecefPresentation?.mount(
          reliefMesh,
          tile,
          cachedEcefGeometry ?? undefined
        );
    } catch (error) {
      // A failed optional projection must not attach an untracked scene node.
      debugMaterial?.dispose();
      throw error;
    }
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
    const tileRangeIncludesNoData =
      noDataHeightMeters !== undefined &&
      !terrainHeightRangeExcludesNoData(tile, noDataHeightMeters);
    const decodedHeightRange =
      !tileRangeIncludesNoData &&
      Number.isFinite(tile.minimumHeightMeters) &&
      Number.isFinite(tile.maximumHeightMeters)
        ? [tile.minimumHeightMeters, tile.maximumHeightMeters]
        : getFiniteHeightRange(tile.heightMeters, noDataHeightMeters) ?? [0, 0];
    const minimumHeightMeters =
      !tileRangeIncludesNoData && Number.isFinite(tile.minimumHeightMeters)
        ? tile.minimumHeightMeters
        : decodedHeightRange[0];
    const maximumHeightMeters =
      !tileRangeIncludesNoData && Number.isFinite(tile.maximumHeightMeters)
        ? tile.maximumHeightMeters
        : decodedHeightRange[1];
    const record: TerrainMeshRecord = {
      sourceTile: tile,
      sourceGeometryBounds: reliefGeometry?.boundingBox?.clone() ?? null,
      sourceGeometrySphere: reliefGeometry?.boundingSphere?.clone() ?? null,
      reliefVertexMask,
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
    };
    const bytes = meshBytes(record);
    if (!terrainMemoryAdmission.canInstall(key, bytes)) {
      disposeMeshRecord(record);
      throw new TerrainMemoryDeferredError(bytes);
    }
    contentRoot.add(node);
    meshes.set(key, record);
    terrainMemoryAdmission.installed(key, bytes);
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

  Object.assign(getElevation, {
    sampleHeights(coordinates: Float64Array, output?: Float64Array) {
      if (
        coordinates.length % 2 ||
        (output && output.length !== coordinates.length / 2)
      )
        throw new RangeError("Terrain batch buffers have incompatible lengths");
      const heights = output ?? new Float64Array(coordinates.length / 2);
      if (source?.sampleHeights) source.sampleHeights(coordinates, heights);
      else heights.fill(NaN);
      for (let index = 0; index < heights.length; index++) {
        const longitude = coordinates[2 * index],
          latitude = coordinates[2 * index + 1];
        if (!Number.isFinite(longitude) || !Number.isFinite(latitude))
          heights[index] = NaN;
        else if (Number.isFinite(heights[index])) {
          if (
            noDataHeightMeters !== undefined &&
            Math.abs(heights[index] - noDataHeightMeters) <=
              NO_DATA_EPSILON_METERS
          )
            heights[index] = NaN;
        } else heights[index] = getElevation(longitude, latitude) ?? NaN;
      }
      return heights;
    },
  });

  let activeMeshKeys: ReadonlySet<string> = new Set();
  const {
    cancelIdleStitch,
    scheduleIdleStitch,
    abortPendingStitch,
    getRetainedBytes: getSeamRetainedBytes,
  } = createRasterDemTerrainSeamCoordinator({
    meshes,
    signal: conversionAbort.signal,
    getActiveMeshKeys: () => activeMeshKeys,
    getSelectionGeneration: () => selectionGeneration,
    isDisposed: () => disposed,
    isLoading: () => terrainLoading,
    isSelectionPending: () => selectionRequestPending,
    hasPendingMeshes: () => pendingMeshes.size > 0,
    isMapMoving: () => map?.isMoving?.(),
    onChanged: () => {
      contentChangedSinceFrame = true;
      mapStyleProjectionVersion += 1;
      map?.triggerRepaint();
    },
    onError: reportTerrainError,
    admitRetainedBytes: (bytes) => canRetainTerrainBytes(bytes),
  });
  let shadowDependencies: readonly {
    key: string;
    id: TerrainTileId;
    bounds: Box3;
  }[] = [];
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
    if (geodetic) {
      geodetic.bounds(
        geographicBounds,
        [
          record.minimumHeightMeters + heightOffsetRange[0],
          record.maximumHeightMeters + heightOffsetRange[1],
        ],
        target
      );
      target.min.sub(boundsPaddingMeters);
      target.max.add(boundsPaddingMeters);
      return target.applyMatrix4(contentRoot.matrixWorld);
    }
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
      terrainFrame?.toReferenceBounds(localBounds);
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
      terrainFrame?.toReferenceBounds(bounds);
      volumes.push({
        id: `${runtimeId}:${key}`,
        kind: TILE_VOLUME_KIND.TERRAIN_TILE,
        state: TILE_VOLUME_STATE.LOADED,
        level: record.id.level,
        loadReason: record.reliefMesh?.receiveShadow
          ? TILE_VOLUME_LOAD_REASON.VIEWPORT
          : TILE_VOLUME_LOAD_REASON.SHADOW,
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
      terrainFrame?.toReferenceBounds(bounds);
      volumes.push({
        id: `${runtimeId}:${key}`,
        kind: TILE_VOLUME_KIND.TERRAIN_TILE,
        state: TILE_VOLUME_STATE.RESIDENT,
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
        const heights =
          knownHeightRanges[terrainTileKey(id)] ?? unknownTerrainHeightRange;
        const box = getTerrainMeshWorldBounds(
          {
            id,
            minimumHeightMeters: heights[0],
            maximumHeightMeters: heights[1],
          },
          bounds
        );
        terrainFrame?.toReferenceBounds(box);
        volumes.push({
          id: `${runtimeId}:${key}`,
          kind: TILE_VOLUME_KIND.TERRAIN_TILE,
          state: TILE_VOLUME_STATE.LOADING,
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
      if (!record.reliefMesh) continue;
      // Hidden terrain remains a CPU height source, never a transparent GPU
      // receiver. Projection shaders can emit markings despite material opacity.
      record.reliefMesh.visible = groundVisible;
      record.reliefMesh.castShadow = groundVisible;
      const presentedMesh = ecefPresentation?.mesh(record.reliefMesh);
      if (presentedMesh) presentedMesh.visible = groundVisible;
      if (!record.node.visible || !groundVisible) {
        record.reliefMesh.receiveShadow = false;
        ecefPresentation?.sync(record.reliefMesh);
        continue;
      }
      ecefPresentation?.sync(record.reliefMesh);
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
      ecefPresentation?.sync(record.reliefMesh);
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
    const shadowFrustumFor = (view: SharedThreeSceneShadowView | null) => {
      const current = worldShadowView(view);
      return current
        ? new Frustum().setFromProjectionMatrix(
            new Matrix4().multiplyMatrices(
              current.camera.projectionMatrix,
              current.camera.matrixWorldInverse
            ),
            current.camera.coordinateSystem,
            current.camera.reversedDepth
          )
        : null;
    };
    const shadowFrustum = shadowFrustumFor(shadowView);
    const previousShadowFrustum = shadowFrustumFor(previousShadowView);
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
      if (!ecefPresentation) gpuBytes += attribute.array.byteLength;
    }
    if (ecefPresentation)
      for (const value of Object.values(record.sourceTile))
        if (ArrayBuffer.isView(value)) arrays.add(value.buffer);
    for (const array of Object.values(record.stitchBase ?? {}))
      arrays.add(array.buffer);
    for (const array of Object.values(record.boundaryEdges))
      arrays.add(array.buffer);
    for (const array of Object.values(record.boundaryBaseHeights))
      arrays.add(array.buffer);
    arrays.add(record.reliefVertexMask.buffer);
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
      (ecefPresentation
        ? record.reliefMesh
          ? ecefPresentation.bytes(record.reliefMesh, arrays)
          : 0
        : record.sourceByteLength) +
      gpuBytes +
      (record.sampleHeight?.byteLength ?? 0) +
      [...arrays].reduce((sum, buffer) => sum + buffer.byteLength, 0)
    );
  };
  const cachedMeshBytes = () =>
    getSeamRetainedBytes() +
    [...meshes.values()].reduce((sum, record) => sum + meshBytes(record), 0);
  const rasterEdge = terrainSourceConfig.tileSize + 2;
  const nativeVertices = rasterEdge ** 2;
  const nativeIndices = 6 * (rasterEdge - 1) ** 2;
  const terrainMemoryAdmission = createTerrainMemoryAdmission({
    residentBytes: cachedMeshBytes,
    resident: (key) => meshes.has(key),
    grantBytes: () => maxCachedMeshBytes,
    // Source arrays, native/ECEF attributes, GPU copies and sampler/edge data.
    // Prepared results are checked exactly; decoded PNG sizes are not trusted.
    initialEstimateBytes:
      (ecefPresentation ? 89 : 65) * nativeVertices +
      (ecefPresentation ? 16 : 12) * nativeIndices +
      80 * rasterEdge,
  });
  const disposeMeshRecord = (record: TerrainMeshRecord) => {
    if (record.reliefMesh) {
      ecefPresentation?.disposeTile(record.reliefMesh);
      record.reliefMesh.geometry.dispose();
    }
    record.node.removeFromParent();
    record.debugMaterial?.dispose();
  };
  const canRetainTerrainBytes = (bytes: number) => {
    if (terrainMemoryAdmission.canInstall("", Math.max(0, bytes))) return true;
    terrainMemoryDeferred = true;
    deferredResidentBytes = cachedMeshBytes();
    return false;
  };
  const rejectTerrainMemoryFamily = (key: string) => {
    for (const member of terrainMemoryAdmission.rejectFamily(key)) {
      const job = meshJobs.get(member);
      if (job) cancelMeshRequest(member, job.controller);
      const record = meshes.get(member);
      // A resource refusal may roll back a prepared family, never a live cut
      // or a confirmed baseline used as the immediate pan fallback.
      if (
        !record ||
        activeMeshKeys.has(member) ||
        baseCoverage.pinned.has(terrainTileKey(record.id))
      )
        continue;
      disposeMeshRecord(record);
      meshes.delete(member);
    }
  };
  const trimMeshCache = (
    activeKeys: ReadonlySet<string>,
    requestedHeadroom = 0
  ) => {
    let bytes = cachedMeshBytes();
    const retainedLimit = Math.max(0, maxCachedMeshBytes - requestedHeadroom);
    if (meshes.size <= maxCachedMeshes && bytes <= retainedLimit) return;
    const candidates = [...meshes.entries()]
      .filter(
        ([key, record]) =>
          !activeKeys.has(key) &&
          (!requiredPreparationKeys.has(key) ||
            [...activeKeys].some((activeKey) => {
              const active = meshes.get(activeKey);
              return (
                active &&
                active.id.level > record.id.level &&
                terrainTileContains(record.id, active.id)
              );
            })) &&
          !terrainMemoryAdmission.hasReservation(key) &&
          !meshJobs.has(key) &&
          !baseCoverage.pinned.has(terrainTileKey(record.id))
      )
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      if (meshes.size <= maxCachedMeshes && bytes <= retainedLimit) break;
      bytes -= meshBytes(record);
      disposeMeshRecord(record);
      meshes.delete(key);
    }
  };

  const baseCoverage = createRasterDemTerrainBaseCache({
    stages: options.persistBaseTiles
      ? planTerrainBaseStages(
          terrainSourceConfig,
          options.baseRasterEdgePixels ?? 8192
        )
      : [],
    memoryBudgetBytes: meshBaseMemoryBudget(
      maxCachedMeshBytes,
      options.baseCoverageMemoryShare
    ),
    bytes: (id) => {
      const record = meshes.get(
        terrainSelectionKey({ id, kind: TERRAIN_SELECTION_KIND.SOURCE })
      );
      return record ? meshBytes(record) : null;
    },
    load: async (id, signal) => {
      if (!source) throw new Error("Terrain source is not ready");
      const entry = { id, kind: TERRAIN_SELECTION_KIND.SOURCE };
      const key = terrainSelectionKey(entry);
      // Visible demand owns any outstanding preparation. Never queue behind it
      // as an idle dependency; retry this baseline entry on a later idle turn.
      if (pendingMeshes.has(key))
        throw new DOMException(
          "Foreground preparation owns tile",
          "AbortError"
        );
      signal.throwIfAborted();
      const resident = meshes.get(key);
      if (resident) {
        // Borrow foreground's pristine buffers. This disposable wrapper owns
        // no GPU allocation and never changes the live, stitched surface.
        const geometry = resident.stitchBase && new BufferGeometry();
        if (geometry && resident.stitchBase) {
          geometry.setAttribute(
            "position",
            new BufferAttribute(resident.stitchBase.positions, 3)
          );
          geometry.setAttribute(
            "normal",
            new BufferAttribute(resident.stitchBase.normals, 3)
          );
          geometry.setIndex(
            new BufferAttribute(resident.stitchBase.indices, 1)
          );
          geometry.boundingBox = resident.sourceGeometryBounds?.clone() ?? null;
          geometry.boundingSphere =
            resident.sourceGeometrySphere?.clone() ?? null;
        }
        try {
          const cachedEcefGeometry = geometry
            ? await ecefPresentation?.prepare(
                geometry,
                resident.sourceTile,
                signal
              )
            : null;
          return {
            tile: resident.sourceTile,
            projectedGeometry: geometry,
            reliefVertexMask: resident.reliefVertexMask,
            cachedEcefGeometry: cachedEcefGeometry ?? null,
          };
        } catch (error) {
          geometry?.dispose();
          throw error;
        }
      }
      return loadTerrainEntry(source, entry, signal);
    },
    persistPrepared: (result, signal) =>
      preparedGeometryCache.set(
        result.tile,
        result.projectedGeometry,
        result.reliefVertexMask,
        undefined,
        signal,
        result.cachedEcefGeometry
      ),
    install: (result, id) => {
      ensureMesh(
        result.tile,
        { id, kind: TERRAIN_SELECTION_KIND.SOURCE },
        result.projectedGeometry,
        result.reliefVertexMask,
        result.cachedEcefGeometry
      );
    },
    confirmPersistedStage: async (ids, signal) => {
      signal.throwIfAborted();
      return preparedGeometryCache.protectBaseline(ids);
    },
    isDisposed: () => disposed,
    isUnavailable: isConfirmedTerrainServerError,
    release: (id) => {
      const key = terrainSelectionKey({
        id,
        kind: TERRAIN_SELECTION_KIND.SOURCE,
      });
      const record = meshes.get(key);
      if (
        !record ||
        activeMeshKeys.has(key) ||
        requiredPreparationKeys.has(key)
      )
        return;
      disposeMeshRecord(record);
      meshes.delete(key);
    },
    trim: () => trimMeshCache(activeMeshKeys),
  });

  const snapshotSelectionInput = (frame: SharedThreeSceneFrame) => {
    const snapshot = snapshotRasterDemTerrainSelectionInput(frame, {
      terrainSourceConfig,
      root: contentRoot,
      geodeticOrigin,
      shadowView: worldShadowView(shadowView),
      origin,
      meterScale,
      snapshotKnownHeightRanges: heightMetadata.snapshot,
      meshes,
      boundsPaddingMeters,
      unknownTerrainHeightRange,
      errorTargetPixels: effectiveErrorTargetPixels(),
      shadowLevelOffset,
      minimumLevel,
      maximumLevel,
      maxSelectionTiles,
      meshSegments,
    });
    const baseLevel = baseCoverage.snapshot().residentLevel;
    const input = baseLevel === null ? snapshot : { ...snapshot, baseLevel };
    if (!geodetic) return input;
    const correctedRange = (range: readonly [number, number]) =>
      [
        range[0] + heightOffsetRange[0],
        range[1] + heightOffsetRange[1],
      ] as const;
    return {
      ...input,
      knownHeightRanges: Object.fromEntries(
        Object.entries(input.knownHeightRanges).map(([key, range]) => [
          key,
          correctedRange(range),
        ])
      ),
      unknownHeightRange: correctedRange(input.unknownHeightRange),
    };
  };

  const buildSelection = (
    terrainSource: RasterDemTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelection => {
    return buildTerrainSelection(snapshotSelectionInput(frame), {
      getTileGridIdsForBounds: terrainSource.getTileGridIdsForBounds,
      getTileBounds: terrainSource.getTileBounds,
      getTileGeometricError: terrainSource.getLevelMaximumGeometricError,
      getTileDataAvailable: terrainSource.getTileDataAvailable,
    });
  };

  const loadSelection = (
    terrainSource: RasterDemTerrainTileSource,
    selection: TerrainSelection,
    prefetchView: PrefetchSelectionView
  ) => {
    if (tileDemandPaused) return;
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
      while (
        id.level >
        (baseCoverage.snapshot().residentLevel ?? terrainSourceConfig.minzoom)
      ) {
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
        coarseReserve.set(terrainTileKey(id), {
          id,
          kind: TERRAIN_SELECTION_KIND.SOURCE,
        });
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
    // Cache volumes at selection time, not for every sun-disc sample. Use the
    // same certified height envelope as traversal until native data is known.
    root.updateMatrixWorld(true);
    const dependencyHeightRanges = heightMetadata.snapshot();
    shadowDependencies = requested.map(({ key, id }) => {
      const heights =
        dependencyHeightRanges[terrainTileKey(id)] ?? unknownTerrainHeightRange;
      const bounds = getTerrainMeshWorldBounds(
        {
          id,
          minimumHeightMeters: heights[0],
          maximumHeightMeters: heights[1],
        },
        new Box3()
      );
      terrainFrame?.toReferenceBounds(bounds);
      return { key, id, bounds };
    });
    // A loaded all-no-data payload is a ready empty quadrant, not an unfinished
    // sibling. This certifies only this payload; descendants still traverse.
    const hasReadySurface = (key: string) => meshes.has(key);
    const hasSourceSurface = (id: TerrainTileId) =>
      !unavailableTileKeys.has(terrainTileKey(id)) &&
      intersectUnwrappedGeographicBounds(getTileBounds(id), {
        west: terrainSourceConfig.bounds[0],
        south: terrainSourceConfig.bounds[1],
        east: terrainSourceConfig.bounds[2],
        north: terrainSourceConfig.bounds[3],
      }) !== null;
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
            hasReadySurface,
            undefined,
            hasSourceSurface
          );
        }
      }
      // Decision: TILES_COVERAGE.md#motion-preserves-visible-detail
      const retainedDetailKeys = mapMoving ? getRequiredMeshKeys() : null;
      frontier = advanceTerrainTileFrontier(
        frontier,
        [
          ...requested,
          ...toFrontier(completion),
          ...toFrontier(reserveEntries),
        ],
        hasReadySurface,
        (key) => !retainedDetailKeys?.has(key),
        hasSourceSurface
      );
      const activeKeys = new Set(frontier.map(({ key }) => key));
      const notePublishedUse = () =>
        persistentTileUsage.note(
          [...getRequiredMeshKeys()].flatMap((key) => {
            const record = activeMeshKeys.has(key) ? meshes.get(key) : null;
            return record ? [record.id] : [];
          })
        );
      const signature = [...activeKeys].sort().join(";");
      if (signature === [...activeMeshKeys].sort().join(";")) {
        notePublishedUse();
        return;
      }
      if (!current()) return;
      // Worker boundary preparation may outlive a camera move. Replan if its
      // proposal would now remove or coarsen a visible tile during motion.
      const needsCoverageReplan = () =>
        [...getRequiredMeshKeys()].some((key) => {
          if (activeKeys.has(key)) return false;
          const previous = meshes.get(key);
          return (
            previous &&
            (!frontier.some(
              ({ id }) =>
                terrainTileContains(id, previous.id) ||
                terrainTileContains(previous.id, id)
            ) ||
              (mapMoving &&
                frontier.some(
                  ({ id }) =>
                    id.level < previous.id.level &&
                    terrainTileContains(id, previous.id)
                )))
          );
        });
      if (needsCoverageReplan()) {
        publicationRequested = true;
        return;
      }
      cancelIdleStitch();
      // Keep the complete previous cut while the new border bands are prepared.
      // Commit shared vertices and normals in one turn before retiring parents.
      try {
        await prepareEqualLevelTerrainBoundaries(
          meshes,
          activeKeys,
          () => current() && !needsCoverageReplan(),
          conversionAbort.signal,
          canRetainTerrainBytes
        );
      } catch (error) {
        if (!(error instanceof TerrainMemoryDeferredError)) throw error;
        // Mandatory shared borders must stay atomic with publication. Keep the
        // previous complete surface; retry only after a resource/demand change.
        for (const key of activeKeys)
          if (!activeMeshKeys.has(key)) rejectTerrainMemoryFamily(key);
        terrainMemoryDeferred = true;
        deferredResidentBytes = cachedMeshBytes();
        return;
      }
      if (!current()) return;
      if (needsCoverageReplan()) {
        publicationRequested = true;
        return;
      }
      // Retired preview ancestors no longer own preparation space once the
      // replacement cut is published. Keep target, completion, reserve and
      // outstanding job ownership; built unpublished siblings must stay ready.
      const retainedPreparationKeys = new Set([
        ...finalKeys,
        ...completion.map(terrainSelectionKey),
        ...reserveEntries.map(terrainSelectionKey),
        ...meshJobs.keys(),
      ]);
      const retiredPreviewKeys = new Set(
        [...activeMeshKeys].filter(
          (key) => !activeKeys.has(key) && !retainedPreparationKeys.has(key)
        )
      );
      if (retiredPreviewKeys.size)
        requiredPreparationKeys = new Set(
          [...requiredPreparationKeys].filter(
            (key) => !retiredPreviewKeys.has(key)
          )
        );
      activeMeshKeys = activeKeys;
      trimMeshCache(activeMeshKeys);
      closeDisplayStages(activeKeys, publishStartedAt);
      applyMeshVisibility();
      if (activeKeys.size > 0) settleReady(true);
      // Transferred geometry is temporary coverage, not a second source cache.
      // Release it immediately once its replacement cut has been published.
      for (const [key, record] of meshes) {
        if (!key.startsWith("fallback:") || activeKeys.has(key)) continue;
        disposeMeshRecord(record);
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
        if (current()) reportTerrainError(error);
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
            const key = terrainSelectionKey({
              id: child,
              kind: TERRAIN_SELECTION_KIND.SOURCE,
            });
            if (
              wanted.has(key) ||
              meshes.has(key) ||
              unavailableTileKeys.has(terrainTileKey(child))
            )
              continue;
            wanted.add(key);
            completion.push({
              id: child,
              kind: TERRAIN_SELECTION_KIND.SOURCE,
              priority: TILE_CAMERA_PRIORITY.SECONDARY,
            });
          }
      }
    }
    siblingCompletionEntries = completion;
    const sourceStages = [
      ...selection.viewportStages,
      selection.entries,
      ...(completion.length ? [completion] : []),
    ];
    // Completion siblings are real preparation demand, even though traversal
    // did not include their offscreen quadrants in its initial selection.
    requiredPreparationKeys = new Set([
      ...requiredPreparationKeys,
      ...completion.map(terrainSelectionKey),
    ]);
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
    const admissionFamilies = planTerrainAdmissionFamilies(
      loadStages,
      terrainSelectionKey,
      ({ id }) =>
        id.level > 0
          ? terrainTileKey({
              level: id.level - 1,
              x: Math.floor(id.x / 2),
              y: Math.floor(id.y / 2),
            })
          : `root:${terrainTileKey(id)}`,
      [...meshes.values()].map(({ id }) => ({
        id,
        kind: TERRAIN_SELECTION_KIND.SOURCE,
      }))
    );
    terrainMemoryAdmission.reconcile(
      new Set([...requiredPreparationKeys, ...meshJobs.keys()])
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
    void loadRasterDemTerrainStages({
      stages: loadStages,
      scheduledCount: scheduledKeys.size,
      current,
      concurrency: () =>
        Math.max(1, payloadAwareConcurrency.getConcurrency(requestConcurrency)),
      admitEntry: (entry) => {
        const key = terrainSelectionKey(entry);
        const family = admissionFamilies.get(key) ?? [key];
        const firstCoverage = activeMeshKeys.size === 0;
        trimMeshCache(
          activeMeshKeys,
          terrainMemoryAdmission.reservedBytes() +
            terrainMemoryAdmission.forecastFamilyBytes(family, firstCoverage)
        );
        const admitted = terrainMemoryAdmission.reserveFamily(
          family,
          firstCoverage
        );
        if (!admitted)
          for (const member of family) rejectTerrainMemoryFamily(member);
        return admitted;
      },
      hasEntryReservation: (entry) =>
        terrainMemoryAdmission.hasReservation(terrainSelectionKey(entry)),
      prepareEntry: (entry) => prepareMesh(terrainSource, entry),
      setProgress: (fraction) => setTerrainLoading(true, fraction),
      publishInBackground,
      requestPublication,
    })
      .then(async ({ failures, memoryDeferred }) => {
        if (!current()) return;
        terrainMemoryDeferred ||= memoryDeferred;
        let transientFailure: unknown = null;
        for (const { value, error } of failures) {
          if (isConfirmedTerrainServerError(error)) {
            unavailableTileKeys.add(terrainTileKey(value.id));
          } else {
            transientFailure ??= error;
          }
        }
        if (transientFailure !== null) {
          reportTerrainError(transientFailure);
          scheduleSelectionRetry();
        } else {
          failedSelectionRounds = 0;
        }
        finishedLoading = true;
        await requestPublication();
        if (!current()) return;
        // Preview ancestors stop owning cache space only after their published
        // replacements are ready. Active surfaces and pinned baseline records
        // remain protected independently; failures and pending work can retry.
        requiredPreparationKeys = new Set([
          ...[...selection.entries, ...completion, ...reserveEntries].map(
            terrainSelectionKey
          ),
          ...failures.map(({ value }) => terrainSelectionKey(value)),
          ...meshJobs.keys(),
        ]);
        if (
          prefetchView.shadowSignature === shadowViewSignature &&
          failures.length === 0 &&
          !terrainMemoryDeferred
        )
          previousShadowView = null;
        terrainSource.trimCache(
          new Set(selection.entries.map((entry) => terrainTileKey(entry.id)))
        );
        trimMeshCache(activeMeshKeys);
        deferredResidentBytes = cachedMeshBytes();
        setTerrainLoading(false);
        scheduleIdleStitch();
        syncSelectionShadowView();
        if (failures.length === 0 && !terrainMemoryDeferred)
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
        reportTerrainError(error);
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
      reportTerrainError(error);
      settleReady(false);
    });

  takePresentations.set(root, () => {
    const transferred: TerrainMeshRecord[] = [];
    // Cancel old publications before moving their records: late workers must
    // never overwrite geometry now owned by the replacement source runtime.
    invalidateIdlePrefetch();
    selectionGeneration += 1;
    abortPendingStitch();
    for (const key of activeMeshKeys) {
      const record = meshes.get(key);
      if (!record) continue;
      if (record.reliefMesh) ecefPresentation?.detach(record.reliefMesh);
      meshes.delete(key);
      transferred.push(record);
    }
    activeMeshKeys = new Set();
    return transferred;
  });

  const runSelection = (input: TerrainSelectionInput) => {
    if (tileDemandPaused) return;
    const demandGeneration = tileDemandGeneration;
    const prefetchView: PrefetchSelectionView = {
      inputSignature: selectionInputSignature,
      shadowSignature: selectionShadowViewSignature,
      viewportBounds: input.viewportBounds,
    };
    selectionRequestPending = true;
    void runTerrainWorkerTask(
      { kind: TERRAIN_WORKER_TASK_KIND.SELECT, input },
      conversionAbort.signal
    )
      .then((result) => {
        // Coalesce camera motion into one latest selection, not stale loads.
        if (
          disposed ||
          tileDemandPaused ||
          demandGeneration !== tileDemandGeneration ||
          queuedSelectionInput ||
          result.kind !== TERRAIN_WORKER_TASK_KIND.SELECT
        )
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
        if (
          disposed ||
          tileDemandPaused ||
          demandGeneration !== tileDemandGeneration ||
          queuedSelectionInput
        )
          return;
        reportTerrainError(error);
        scheduleSelectionRetry();
      })
      .finally(() => {
        selectionRequestPending = false;
        const queued = queuedSelectionInput;
        queuedSelectionInput = null;
        if (!disposed && !tileDemandPaused && queued) runSelection(queued);
        else if (!disposed) map?.triggerRepaint();
      });
  };

  const recordIdlePrefetchSelection = (
    selection: TerrainSelection,
    view: PrefetchSelectionView
  ) => {
    if (
      disposed ||
      tileDemandPaused ||
      terrainLoading ||
      selectionRetryTimer !== null ||
      selectionInputSignature !== view.inputSignature ||
      shadowViewSignature !== view.shadowSignature ||
      selectionShadowViewSignature !== view.shadowSignature ||
      !selection.entries.every(
        (entry) =>
          activeMeshKeys.has(terrainSelectionKey(entry)) ||
          unavailableTileKeys.has(terrainTileKey(entry.id))
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
    !tileDemandPaused &&
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
        ? baseCoverage.snapshot().remaining +
          snapshot.entries.filter(
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
      const previousBaseLevel = baseCoverage.snapshot().residentLevel;
      prepared += await baseCoverage.run(controller.signal, () =>
        isIdlePrefetchCurrent(snapshot)
      );
      if (isIdlePrefetchCurrent(snapshot)) await persistentTileUsage.flush();
      if (previousBaseLevel !== baseCoverage.snapshot().residentLevel) {
        selectionInputSignature = "";
        map?.triggerRepaint();
      }
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
          result.cachedEcefGeometry?.dispose();
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
    if (!terrainSource || tileDemandPaused || terrainLoading || signal.aborted)
      return;
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
      !tileDemandPaused &&
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
      const entry = { id, kind: TERRAIN_SELECTION_KIND.SOURCE } as const;
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
        if (disposed || controller.signal.aborted) {
          result.projectedGeometry?.dispose();
          result.cachedEcefGeometry?.dispose();
        } else {
          ensureMesh(
            result.tile,
            entry,
            result.projectedGeometry,
            result.reliefVertexMask,
            result.cachedEcefGeometry
          );
          trimMeshCache(activeMeshKeys);
        }
      });
      pendingMeshes.set(key, work);
      try {
        await work;
      } catch (error) {
        if (!(error instanceof TerrainMemoryDeferredError)) throw error;
        rejectTerrainMemoryFamily(key);
        break;
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
    // Optional page preparation currently uses a planar geographic envelope.
    // Foreground ECEF casters remain active; never prepare incorrect flat pages.
    if (tileDemandPaused || ecefPresentation) return [];
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
      if (ecefPresentation)
        return reject(TERRAIN_IDLE_SHADOW_REASON.unavailable);
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
    mountsOnLocalFrame: ecefPresentation !== null,
    get providesTerrain() {
      return groundVisible;
    },
    hasRenderableContent: () => {
      if (disposed || !groundVisible || !root.visible) return false;
      for (const key of activeMeshKeys) {
        const record = meshes.get(key);
        if (record?.node.visible && record.reliefMesh?.visible) return true;
      }
      return false;
    },
    receivesMapStyleTexture:
      options.receivesMapStyleTexture === true
        ? (candidate) => groundVisible && candidate === material
        : false,
    mapStyleProjectionBlend: "replace",
    mapStyleProjectionVersion: () => mapStyleProjectionVersion,
    updatePriority: TERRAIN_UPDATE_PRIORITY,
    ready,
    getTerrainCacheStats: () => ({
      cachedMeshes: meshes.size,
      cachedMeshBytes: cachedMeshBytes(),
      reservedMeshBytes: terrainMemoryAdmission.reservedBytes(),
      memoryDeferred: terrainMemoryDeferred,
      cacheCeilingBytes: maxCachedMeshBytes,
      baseline: baseCoverage.snapshot(),
    }),
    setCacheBudget(bytes?: number) {
      const next =
        bytes !== undefined && Number.isFinite(bytes) && bytes > 0
          ? Math.min(
              maximumDeviceCacheBytes,
              learnedCacheCeiling ?? Infinity,
              Math.floor(bytes)
            )
          : Math.min(
              initialMaxCachedMeshBytes,
              learnedCacheCeiling ?? Infinity
            );
      if (next === maxCachedMeshBytes) return;
      invalidateIdlePrefetch();
      maxCachedMeshBytes = next;
      terrainMemoryAdmission.resetDeferred();
      terrainMemoryDeferred = false;
      requestedSignature = "";
      baseCoverage.setMemoryBudget(
        meshBaseMemoryBudget(next, options.baseCoverageMemoryShare)
      );
      trimMeshCache(activeMeshKeys);
      selectionInputSignature = "";
      map?.triggerRepaint();
    },
    getPublishedTerrainTiles: () =>
      [...activeMeshKeys].flatMap((key) => {
        const record = meshes.get(key);
        return record?.node.visible && record.reliefMesh
          ? [
              {
                tile: record.sourceTile,
                mesh:
                  ecefPresentation?.mesh(record.reliefMesh) ??
                  record.reliefMesh,
                bounds: getTerrainMeshWorldBounds(record, new Box3()),
              },
            ]
          : [];
      }),
    setErrorTarget(value: number) {
      if (!Number.isFinite(value) || value <= 0)
        throw new RangeError(
          "Terrain error target must be positive and finite"
        );
      if (disposed || value === errorTargetPixels) return;
      errorTargetPixels = value;
      terrainMemoryAdmission.resetDeferred();
      terrainMemoryDeferred = false;
      requestedSignature = "";
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
        contentRoot.add(record.node);
        if (record.reliefMesh)
          ecefPresentation?.mount(record.reliefMesh, record.sourceTile);
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
      if (ecefPresentation && terrainFrame) {
        terrainFrame.update(frame.localFrame);
        ecefPresentation.refit(frame.localFrame.referenceLngLat);
      }
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
          const geometry = record?.reliefMesh
            ? (ecefPresentation?.mesh(record.reliefMesh) ?? record.reliefMesh)
                .geometry
            : undefined;
          if (!record?.node.visible || !geometry) continue;
          const revision = [
            geometry.id,
            (geometry.getAttribute("position") as BufferAttribute).version,
            (geometry.getAttribute("normal") as BufferAttribute).version,
            geometry.index?.version,
            ...(
              ecefPresentation?.mesh(record.reliefMesh!) ?? record.reliefMesh!
            ).matrixWorld.elements,
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
        if (terrainFrame)
          for (const bounds of changedBounds)
            terrainFrame.toReferenceBounds(bounds);
        options.onContentChanged?.(changedBounds);
      }
      // Image-plane zoom still updates the shared camera and scene placement;
      // it must not turn into another DEM traversal or tile admission.
      if (tileDemandPaused) return;
      if (selectionGeneration === 0) syncSelectionShadowView();
      const inputSignature = computeRasterDemSelectionInputSignature(
        frame,
        map,
        errorTargetPixels,
        selectionShadowViewSignature,
        tileCameraSignature
      );
      const releasedMemory =
        terrainMemoryDeferred && cachedMeshBytes() < deferredResidentBytes;
      if (inputSignature === selectionInputSignature && !releasedMemory) return;
      if (terrainMemoryDeferred) {
        terrainMemoryAdmission.resetDeferred();
        terrainMemoryDeferred = false;
        requestedSignature = "";
      }
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
      const input = snapshotSelectionInput(frame);
      // Selection can remain superseded throughout continuous movement. This
      // bounded pending-only pass cancels proven offscreen work on every change;
      // exact LOD/corridor refinement stays in the worker, never in this loop.
      rejectOffscreenMeshRequests(input);
      if (selectionRequestPending) queuedSelectionInput = input;
      else runSelection(input);
    },
    setShadowView(view) {
      if (shadowView && !previousShadowView) previousShadowView = shadowView;
      // Three's light camera is world-space. The controller runs before this
      // runtime, so read the already-refitted mount rather than last frame's fit.
      if (terrainFrame && root.parent)
        terrainFrame.updateMount(root.parent.matrixWorld);
      // Keep its snapshot in reference space; queries carry it through later
      // refits exactly once, alongside the terrain geometry.
      view?.camera.updateMatrixWorld(true);
      shadowView = view
        ? {
            ...view,
            camera:
              terrainFrame?.toReferenceCamera(view.camera) ??
              view.camera.clone(),
            shadowMapSize: normalizeShadowMapSize(view.shadowMapSize),
          }
        : null;
      if (!view) previousShadowView = null;
      const nextSignature = getSharedThreeShadowViewSignature(shadowView);
      if (nextSignature !== shadowViewSignature) {
        invalidateIdlePrefetch();
        shadowViewSignature = nextSignature;
        if (!terrainLoading) syncSelectionShadowView();
      }
    },
    setGroundVisible(visible) {
      if (disposed || groundVisible === visible) return;
      groundVisible = visible;
      material.colorWrite = visible;
      material.depthWrite = visible;
      material.transparent = !visible;
      material.opacity = visible ? 1 : 0;
      material.needsUpdate = true;
      applyMeshVisibility();
      mapStyleProjectionVersion += 1;
      map?.triggerRepaint();
    },
    setLoadingPaused(paused) {
      if (disposed || loadingPaused === paused) return;
      loadingPaused = paused;
      if (paused) return;
      const resumers = [...loadingResumers];
      loadingResumers.clear();
      for (const resume of resumers) resume();
      map?.triggerRepaint();
    },
    setTileDemandPaused(paused) {
      if (disposed || tileDemandPaused === paused) return;
      tileDemandPaused = paused;
      tileDemandGeneration += 1;
      // Late selector results and progressive stages belong to the previous
      // demand epoch. Keep their already-started tile work and all resident
      // data, but never publish a stale cut or admit its remaining requests.
      selectionGeneration += 1;
      queuedSelectionInput = null;
      selectionInputSignature = "";
      requestedSignature = "";
      clearSelectionRetry();
      if (motionSettleTimer !== null) clearTimeout(motionSettleTimer);
      motionSettleTimer = null;
      invalidateIdlePrefetch();
      cancelIdleStitch();
      abortPendingStitch();
      if (paused) setTerrainLoading(false);
      else {
        syncSelectionShadowView();
        map?.triggerRepaint();
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
          ({ key, id }) =>
            unavailableTileKeys.has(terrainTileKey(id)) ||
            (activeMeshKeys.has(key) && meshes.has(key))
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
      persistentTileUsage.close();
      preparedGeometryCache.close();
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
        disposeMeshRecord(record);
      }
      ecefPresentation?.dispose();
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

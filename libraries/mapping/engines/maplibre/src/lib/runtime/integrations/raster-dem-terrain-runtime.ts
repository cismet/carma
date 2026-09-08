import { MercatorCoordinate } from "maplibre-gl";
import type { Map as MaplibreMap } from "maplibre-gl";
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  Camera,
  FrontSide,
  Frustum,
  Group,
  Matrix4,
  Mesh,
  MeshLambertMaterial,
  Sphere,
  Vector3,
  type ColorRepresentation,
} from "three";

import { quantize } from "@carma-commons/math";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";
import type { RasterDemTerrainResource } from "@carma-commons/resources";
import {
  acquireRasterDemTerrainTileSource,
  isConfirmedTerrainServerError,
  terrainTileKey,
  type RasterDemTerrainTileSource,
  type TerrainTile,
  type TerrainTileBounds,
  type TerrainTileId,
} from "./raster-dem-terrain-tile-source";

import {
  notifySharedThreeTerrainChanged,
  registerSharedThreeTerrainSampler,
  setSharedThreeTerrainLoading,
} from "./shared-three-terrain-registry";
import { createProjectedTerrainGeometryCache } from "./projected-terrain-geometry-cache";
import { createTerrainHeightMetadataIndex } from "./terrain-height-metadata-index";
import { MAPLIBRE_EVENT } from "../../../constants/mapEvents";
import {
  planTerrainIdlePrefetch,
  planTerrainIdleShadowRegion,
  TERRAIN_IDLE_SHADOW_REASON,
  type TerrainIdleShadowReason,
} from "../../core/terrain-idle-prefetch";
import {
  prepareTerrainBoundaryStitch,
  type TerrainBoundaryStitchState,
} from "./terrain-boundary-stitch";
import { runTerrainWorkerTask } from "./terrain-worker-client";
import type { TerrainWorkerResult } from "./terrain-worker-task";
import {
  buildTerrainSelection,
  type TerrainSelection,
  type TerrainSelectionEntry,
  type TerrainSelectionInput,
} from "../../core/terrain-selection";
import {
  NO_DATA_EPSILON_METERS,
  terrainHeightRangeExcludesNoData,
} from "../../core/terrain-no-data";
import { getTileBounds } from "../../core/raster-dem-tile";
import {
  MAXIMUM_RASTER_MESH_ERROR_METERS,
  resolveRasterMeshErrorMeters,
} from "../../core/raster-mesh-error";
import { createTerrainTileHeightSampler } from "../../core/terrain-tile-height-sampler";
import {
  advanceTerrainTileFrontier,
  terrainTileContains,
} from "./terrain-tile-frontier";
import {
  createPayloadAwareRequestConcurrency,
  DEFAULT_MAXIMUM_REQUEST_CONCURRENCY,
} from "./payload-aware-request-concurrency";
import type {
  SharedThreeSceneFrame,
  SharedThreeSceneTileVolume,
  SharedThreeSceneRuntime,
  SharedThreeSceneShadowView,
} from "./shared-three-scene-layer";
import { getSharedThreeShadowViewSignature } from "./shared-three-scene-layer";

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
  errorTargetPixels?: number;
  shadowLevelOffset?: number;
  minimumLevel?: number;
  maximumLevel?: number;
  maxSelectionTiles?: number;
  requestConcurrency?: number;
  maxCacheBytes?: number;
  maxCachedMeshes?: number;
  /** Number of height-grid segments per tile used by the Three.js terrain. */
  meshSegments?: number;
  /** Additional reconstruction residual; source-LOD pixel spacing is separate. */
  maximumMeshErrorMeters?: number;
  /** Source-specific height that denotes missing terrain coverage. */
  noDataHeightMeters?: number;
  /** Conservative elevation range used until a tile or ancestor is loaded. */
  heightRangeMeters?: readonly [minimum: number, maximum: number];
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
  getActiveTileVolumes: () => readonly SharedThreeSceneTileVolume[];
}

type TerrainMeshRecord = {
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
  heights: ArrayLike<number>
): readonly [minimum: number, maximum: number] | null => {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < heights.length; index += 1) {
    const height = heights[index];
    if (!Number.isFinite(height)) continue;
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
  camera: Camera,
  root: Group,
  origin: MercatorCoordinate,
  meterScale: number
): TerrainTileBounds | null => {
  camera.updateMatrixWorld(true);
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  root.updateMatrixWorld(true);
  const localFromWorld = new Matrix4().copy(root.matrixWorld).invert();
  let west = Number.POSITIVE_INFINITY;
  let south = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  for (const x of [-1, 1]) {
    for (const y of [-1, 1]) {
      for (const z of [-1, 1]) {
        const local = new Vector3(x, y, z)
          .unproject(camera)
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
  const errorTargetPixels = Math.max(
    0.1,
    options.errorTargetPixels ?? DEFAULT_ERROR_TARGET_PIXELS
  );
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
  const noDataHeightMeters = options.noDataHeightMeters;
  const unknownTerrainHeightRange =
    options.heightRangeMeters ?? UNKNOWN_TERRAIN_HEIGHT_RANGE_METERS;
  const origin = MercatorCoordinate.fromLngLat(originLngLat, 0);
  const meterScale = origin.meterInMercatorCoordinateUnits();
  const maximumMeshErrorMeters = resolveRasterMeshErrorMeters(
    options.maximumMeshErrorMeters
  );
  const projectedGeometryCache = createProjectedTerrainGeometryCache(
    JSON.stringify([terrainSourceConfig, maximumMeshErrorMeters]),
    originLngLat,
    noDataHeightMeters,
    producerAssetUrl
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
  let mapStyleProjectionVersion = 0;
  const sourcePromise = acquireRasterDemTerrainTileSource(terrainSourceConfig, {
    maxCacheBytes: options.maxCacheBytes,
    // Profile segment caps are not a residual guarantee. The worker now chooses
    // native/half/quarter from the same full-resolution source and a measured
    // error bound; progressive source-LOD stages still fill the screen first.
    meshSegments: terrainSourceConfig.tileSize,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  let source: RasterDemTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let latestRenderCamera: Camera | null = null;
  let shadowView: SharedThreeSceneShadowView | null = null;
  let previousShadowFrustum: Frustum | null = null;
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let terrainLoading = true;
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
    invalidateIdlePrefetch();
    // Reconfirm even when a gesture ends at the same camera/cut.
    selectionInputSignature = "";
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

  const loadTerrainEntry = async (
    terrainSource: RasterDemTerrainTileSource,
    entry: TerrainSelectionEntry,
    signal = conversionAbort.signal
  ) => {
    signal.throwIfAborted();
    const cached = await projectedGeometryCache.get(
      entry.id,
      maximumMeshErrorMeters
    );
    if (signal.aborted) {
      cached?.geometry?.dispose();
      signal.throwIfAborted();
    }
    if (cached) {
      heightMetadata.record(cached.tile);
      return {
        tile: cached.tile,
        projectedGeometry: cached.geometry,
        reliefVertexMask: cached.reliefVertexMask,
      };
    }
    let tile: TerrainTile;
    try {
      tile =
        maximumMeshErrorMeters === MAXIMUM_RASTER_MESH_ERROR_METERS
          ? await terrainSource.requestTile(entry.id)
          : await terrainSource.requestTile(
              entry.id,
              undefined,
              maximumMeshErrorMeters
            );
      payloadAwareConcurrency.observePayload(tile.byteLength);
    } catch (error) {
      payloadAwareConcurrency.observeFailure(error);
      throw error;
    }
    signal.throwIfAborted();
    heightMetadata.record(tile);
    // Exclude download and source-cache lookup: persistent derived geometry
    // must compete with the locally available source, not a slow network.
    const computeStart = performance.now();
    const projectedGeometry = await createProjectedGeometry(tile, signal);
    const prepared = await prepareReliefGeometry(
      tile,
      projectedGeometry,
      signal
    );
    if (signal.aborted) {
      prepared.projectedGeometry?.dispose();
      signal.throwIfAborted();
    }
    projectedGeometryCache.set(
      tile,
      prepared.projectedGeometry,
      prepared.reliefVertexMask,
      performance.now() - computeStart
    );
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
  const prepareMesh = (
    source: RasterDemTerrainTileSource,
    entry: TerrainSelectionEntry
  ): Promise<void> => {
    const key = terrainSelectionKey(entry);
    if (meshes.has(key)) return Promise.resolve();
    const pending = pendingMeshes.get(key);
    if (pending) return pending;
    const work = loadTerrainEntry(source, entry)
      .then(({ tile, projectedGeometry, reliefVertexMask }) => {
        if (disposed) projectedGeometry?.dispose();
        else ensureMesh(tile, entry, projectedGeometry, reliefVertexMask);
      })
      .finally(() => pendingMeshes.delete(key));
    pendingMeshes.set(key, work);
    return work;
  };

  const ensureMesh = (
    tile: TerrainTile,
    entry: TerrainSelectionEntry,
    projectedGeometry: BufferGeometry | null,
    reliefVertexMask: Uint8Array
  ) => {
    const key = terrainSelectionKey(entry);
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
    if (reliefGeometry) {
      reliefMesh = new Mesh(reliefGeometry, material);
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
    const decodedHeightRange = getFiniteHeightRange(tile.heightMeters) ?? [
      0, 0,
    ];
    const minimumHeightMeters = Number.isFinite(tile.minimumHeightMeters)
      ? tile.minimumHeightMeters
      : decodedHeightRange[0];
    const maximumHeightMeters = Number.isFinite(tile.maximumHeightMeters)
      ? tile.maximumHeightMeters
      : decodedHeightRange[1];
    meshes.set(key, {
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
      lastUsed: ++meshUseClock,
      id: entry.id,
      heightBounds: tile.bounds ? { ...tile.bounds } : null,
      sampleHeight: reliefGeometry
        ? createTerrainTileHeightSampler(tile, noDataHeightMeters)
        : null,
      minimumHeightMeters,
      maximumHeightMeters,
    });
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
      const plan = prepareTerrainBoundaryStitch(inputs, stitchedBoundaryState);
      pendingStitch = {
        signature,
        controller,
        result: (async () => {
          const probe = await runTerrainWorkerTask(
            {
              kind: "stitch",
              inputs: plan.probeInputs,
              captureBoundaryState: true,
              prepareShellKeys: plan.prepareShellKeys,
              probeOnly: !plan.allNew,
            },
            controller.signal
          );
          if (probe.kind !== "stitch")
            throw new Error("Unexpected terrain boundary probe");
          const work = plan.resolve(probe.updates, probe.shells);
          const result = plan.allNew
            ? probe
            : work.outputKeys.length
            ? await runTerrainWorkerTask(
                {
                  kind: "stitch",
                  inputs: work.inputs,
                  outputKeys: work.outputKeys,
                },
                controller.signal
              )
            : { kind: "stitch" as const, updates: [] };
          return { result, state: work.state };
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
      generation !== selectionGeneration ||
      !isCurrentPublication()
    )
      return;
    for (const update of result.updates) {
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

  let activeMeshKeys: ReadonlySet<string> = new Set();
  let shadowDependencies: readonly { key: string; bounds: Box3 }[] = [];
  const terrainBoundsCorner = new Vector3();

  const getTerrainMeshWorldBounds = (
    record: Pick<TerrainMeshRecord, "id" | "minimumHeightMeters" | "maximumHeightMeters">,
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
    return target.applyMatrix4(root.matrixWorld);
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

  const getActiveTileVolumes = (): readonly SharedThreeSceneTileVolume[] => {
    if (activeMeshKeys.size === 0) return [];
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
        minimum: [bounds.min.x, bounds.min.y, bounds.min.z],
        maximum: [bounds.max.x, bounds.max.y, bounds.max.z],
      });
    }
    return volumes;
  };

  const applyMeshVisibility = () => {
    for (const [key, record] of meshes) {
      record.node.visible = root.visible && activeMeshKeys.has(key);
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
    const shadowFrustum = shadowView ? new Frustum().setFromProjectionMatrix(
      new Matrix4().multiplyMatrices(shadowView.camera.projectionMatrix, shadowView.camera.matrixWorldInverse),
      shadowView.camera.coordinateSystem,
      shadowView.camera.reversedDepth
    ) : null;
    const bounds = new Box3();
    return new Set(
      [...activeMeshKeys].filter((key) => {
        const record = meshes.get(key);
        if (!record) return false;
        getTerrainMeshWorldBounds(record, bounds);
        return frustum.intersectsBox(bounds) || shadowFrustum?.intersectsBox(bounds) || previousShadowFrustum?.intersectsBox(bounds);
      })
    );
  };

  const trimMeshCache = (activeKeys: ReadonlySet<string>) => {
    let excess = meshes.size - maxCachedMeshes;
    if (excess <= 0) return;
    const candidates = [...meshes.entries()]
      .filter(([key]) => !activeKeys.has(key))
      .sort(([, left], [, right]) => left.lastUsed - right.lastUsed);
    for (const [key, record] of candidates) {
      if (excess <= 0) break;
      root.remove(record.node);
      record.reliefMesh?.geometry.dispose();
      meshes.delete(key);
      excess -= 1;
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
    // MapLibre adjusts its terrain-aware render matrices while DEM tiles
    // settle even when the user-facing view is stationary. Using those
    // matrices as the invalidation key creates a load -> camera -> load loop.
    // The public map view is the authoritative terrain-selection input; the
    // current LoD camera is still used below when a real view change occurs.
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
      `${frame.viewport.x}x${frame.viewport.y}`,
      selectionShadowViewSignature,
    ].join(";");
  };

  const snapshotSelectionInput = (
    terrainSource: RasterDemTerrainTileSource,
    frame: SharedThreeSceneFrame
  ): TerrainSelectionInput => {
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
      viewport: [frame.viewport.x, frame.viewport.y],
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
        meshSegments: terrainSourceConfig.tileSize,
      },
      knownHeightRanges,
      unknownHeightRange: unknownTerrainHeightRange,
      errorTargetPixels,
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
    // Cache footprints at selection time, not for every sun-disc sample. Extend
    // vertically because an unloaded tile's actual elevation is not yet known.
    root.updateMatrixWorld(true);
    shadowDependencies = requested.map(({ key, id }) => ({
      key,
      bounds: getTerrainMeshWorldBounds({ id, minimumHeightMeters: -1000000, maximumHeightMeters: 1000000 }, new Box3()),
    }));
    const hasReadySurface = (key: string) =>
      Boolean(meshes.get(key)?.reliefMesh);
    const publish = async () => {
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
        requested,
        hasReadySurface,
        finishedLoading,
        getRequiredMeshKeys()
      );
      const activeKeys = new Set(frontier.map(({ key }) => key));
      const signature = [...activeKeys].sort().join(";");
      if (signature === stitchedActiveSignature) return;
      await smoothActiveBoundaryNormals(activeKeys, generation, current);
      if (!current()) return;
      // The camera can move during worker stitching. Replan before publishing
      // if a formerly offscreen tile has become visible without any replacement.
      const newlyUncovered = [...getRequiredMeshKeys()].some((key) => {
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
      if (newlyUncovered) {
        publicationRequested = true;
        return;
      }
      activeMeshKeys = activeKeys;
      applyMeshVisibility();
      if (activeKeys.size > 0) settleReady(true);
      // Transferred geometry is temporary coverage, not a second source cache.
      // Release it immediately once its replacement cut has been published.
      for (const [key, record] of meshes) {
        if (!key.startsWith("fallback:") || activeKeys.has(key)) continue;
        root.remove(record.node);
        record.reliefMesh?.geometry.dispose();
        meshes.delete(key);
      }
      mapStyleProjectionVersion += 1;
      contentChangedSinceFrame = true;
      map?.triggerRepaint();
    };
    const requestPublication = (): Promise<void> => {
      publicationRequested = true;
      if (publicationJob) return publicationJob;
      // One in-flight stitch, with arrivals coalesced into the next cut. Do not
      // cancel and clone the whole visible geometry again for every loaded tile.
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
    const scheduledKeys = new Set<string>();
    const finalKeys = new Set(requested.map(({ key }) => key));
    const loadStages = [...selection.viewportStages, selection.entries].map(
      (stage) =>
        stage.filter((entry) => {
          const key = terrainSelectionKey(entry);
          if (
            scheduledKeys.has(key) ||
            meshes.has(key) ||
            unavailableTileKeys.has(terrainTileKey(entry.id))
          )
            return false;
          if (
            !finalKeys.has(key) &&
            [...activeMeshKeys].some((activeKey) => {
              const active = meshes.get(activeKey);
              return (
                active &&
                active.id.level > entry.id.level &&
                terrainTileContains(entry.id, active.id)
              );
            })
          )
            return false;
          scheduledKeys.add(key);
          return true;
        })
    );
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
        failures.push(...loaded.failures);
        // Do not let detailed or offscreen-caster work overtake first coverage
        // while its geometry is still being stitched. This also yields to input
        // and painting between stages, including memory-cache-only loads.
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
        if (prefetchView.shadowSignature === shadowViewSignature && failures.length === 0) previousShadowFrustum = null;
        terrainSource.trimCache(
          new Set(selection.entries.map((entry) => terrainTileKey(entry.id)))
        );
        trimMeshCache(activeMeshKeys);
        setTerrainLoading(false);
        syncSelectionShadowView();
        if (failures.length === 0)
          recordIdlePrefetchSelection(selection, prefetchView);
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
      })
      .catch((error) => {
        if (!current()) return;
        setTerrainLoading(false);
        syncSelectionShadowView();
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
        if (disposed || result.kind !== "select") return;
        if (result.selection.signature !== requestedSignature) {
          requestedSignature = result.selection.signature;
          loadSelection(source!, result.selection, prefetchView);
        } else if (!terrainLoading) {
          recordIdlePrefetchSelection(result.selection, prefetchView);
        }
      })
      .catch((error) => {
        if (disposed) return;
        options.onError?.(error);
        scheduleSelectionRetry();
      })
      .finally(() => {
        selectionRequestPending = false;
        const queued = queuedSelectionInput;
        queuedSelectionInput = null;
        if (!disposed && queued) runSelection(queued);
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
      // Last priority, after the visible shadow and bounded neighbour terrain
      // have settled. One client-local format profile at most, no render work.
      if (!controller.signal.aborted && isIdlePrefetchCurrent(snapshot)) {
        await runTerrainWorkerTask(
          { kind: "calibrate-cache", producerAssetUrl },
          controller.signal
        ).catch(() => {});
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
    receivesMapStyleTexture: options.receivesMapStyleTexture === true,
    mapStyleProjectionVersion: () => mapStyleProjectionVersion,
    updatePriority: TERRAIN_UPDATE_PRIORITY,
    ready,
    getIdlePrefetchAvailability,
    prefetchIdleTerrain,
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
        if (record.reliefMesh) record.reliefMesh.material = material;
        record.lastUsed = ++meshUseClock;
        meshes.set(key, record);
        root.add(record.node);
        keys.add(key);
      }
      activeMeshKeys = keys;
      mapStyleProjectionVersion += 1;
      contentChangedSinceFrame = true;
      applyMeshVisibility();
      if (keys.size > 0) settleReady(true);
      map?.triggerRepaint();
    },
    onAdd(mapInstance) {
      map = mapInstance;
      map.on?.(MAPLIBRE_EVENT.MOVE_START, handleIdlePrefetchMovement);
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
      if (disposed || !root.visible) return;
      if (!source) return;
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
        } else if (!terrainLoading)
          recordIdlePrefetchSelection(selection, prefetchView);
        return;
      }
      const input = snapshotSelectionInput(source, frame);
      if (selectionRequestPending) queuedSelectionInput = input;
      else runSelection(input);
    },
    setShadowView(view) {
      if (shadowView && !previousShadowFrustum) {
        previousShadowFrustum = new Frustum().setFromProjectionMatrix(
          new Matrix4().multiplyMatrices(shadowView.camera.projectionMatrix, shadowView.camera.matrixWorldInverse),
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
    getActiveTileVolumes,
    isShadowRegionReady: (bounds) => {
      if (disposed || selectionRequestPending || queuedSelectionInput || shadowDependencies.length === 0) return false;
      const dependencies = shadowDependencies.filter(tile => tile.bounds.intersectsBox(bounds));
      return dependencies.length > 0 && dependencies.every(({ key }) =>
        activeMeshKeys.has(key) && Boolean(meshes.get(key)?.reliefMesh)
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      heightMetadata.dispose();
      invalidateIdlePrefetch();
      map?.off?.(MAPLIBRE_EVENT.MOVE_START, handleIdlePrefetchMovement);
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
      }
      meshes.clear();
      publishedShadowGeometry.clear();
      material.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};

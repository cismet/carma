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
} from "./terrain-no-data";
import { getTileBounds } from "./raster-dem-tile";
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

const DEFAULT_TERRAIN_COLOR = 0xd8d1c4;
const DEFAULT_ERROR_TARGET_PIXELS = 2.5;
// Same screen-space raster-spacing metric as final selection, not a certified
// vertical DEM error bound. Never fetch coarser startup ancestors above 16 px.
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
  /** Source-specific height that denotes missing terrain coverage. */
  noDataHeightMeters?: number;
  /** Conservative elevation range used until a tile or ancestor is loaded. */
  heightRangeMeters?: readonly [minimum: number, maximum: number];
  material?: RasterDemTerrainMaterialOptions;
  /** Project MapLibre ground styling onto this terrain before lighting. */
  receivesMapStyleTexture?: boolean;
  /** Called after the active terrain meshes or their normals changed. */
  onContentChanged?: () => void;
  onError?: (error: unknown) => void;
}>;

export interface RasterDemTerrainRuntime extends SharedThreeSceneRuntime {
  ready: Promise<boolean>;
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
  const projectedGeometryCache = createProjectedTerrainGeometryCache(
    JSON.stringify([terrainSourceConfig, options.meshSegments]),
    originLngLat,
    noDataHeightMeters
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
    meshSegments: options.meshSegments,
  });
  const meshes = new Map<string, TerrainMeshRecord>();
  let source: RasterDemTerrainTileSource | null = null;
  let map: MaplibreMap | null = null;
  let shadowView: SharedThreeSceneShadowView | null = null;
  let unregisterSampler: (() => void) | null = null;
  let disposed = false;
  let terrainLoading = true;
  let contentChangedSinceFrame = false;
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
  const createProjectedGeometry = async (tile: TerrainTile) => {
    const result = await runTerrainWorkerTask(
      {
        kind: "project",
        tile,
        origin: { x: origin.x, y: origin.y, z: origin.z },
      },
      conversionAbort.signal
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
    entry: TerrainSelectionEntry
  ) => {
    const cached = await projectedGeometryCache.get(entry.id);
    if (cached)
      return {
        tile: cached.tile,
        projectedGeometry: cached.geometry,
        reliefVertexMask: cached.reliefVertexMask,
      };
    let tile: TerrainTile;
    try {
      tile = await terrainSource.requestTile(entry.id);
      payloadAwareConcurrency.observePayload(tile.byteLength);
    } catch (error) {
      payloadAwareConcurrency.observeFailure(error);
      throw error;
    }
    const projectedGeometry = await createProjectedGeometry(tile);
    const prepared = await prepareReliefGeometry(tile, projectedGeometry);
    projectedGeometryCache.set(
      tile,
      prepared.projectedGeometry,
      prepared.reliefVertexMask
    );
    return prepared;
  };

  const prepareReliefGeometry = async (
    tile: TerrainTile,
    geometry: BufferGeometry
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
        conversionAbort.signal
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
      minimumHeightMeters,
      maximumHeightMeters,
    });
    return node;
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
  const terrainBoundsCorner = new Vector3();

  const getTerrainMeshWorldBounds = (
    record: TerrainMeshRecord,
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
    const knownHeightRanges: Record<string, readonly [number, number]> = {};
    for (const [key, record] of meshes) {
      if (key.startsWith("source:"))
        knownHeightRanges[terrainTileKey(record.id)] = [
          record.minimumHeightMeters,
          record.maximumHeightMeters,
        ];
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
        meshSegments: Math.max(
          2,
          Math.min(
            terrainSourceConfig.tileSize,
            Math.floor(options.meshSegments ?? terrainSourceConfig.tileSize)
          )
        ),
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
    selection: TerrainSelection
  ) => {
    setTerrainLoading(true);
    const generation = ++selectionGeneration;
    const startedWithoutCoverage = activeMeshKeys.size === 0;
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
    const publish = async () => {
      let frontier = [...activeMeshKeys].flatMap((key) => {
        const record = meshes.get(key);
        return record ? [{ key, id: record.id }] : [];
      });
      // Preview ancestors are only useful on a cold start, never as a lower
      // quality replacement for a detailed surface already on screen.
      if (startedWithoutCoverage && !finishedLoading) {
        for (const stage of selection.viewportStages) {
          const candidates = toFrontier(stage).filter(
            (candidate) =>
              !frontier.some(
                (tile) =>
                  tile.id.level > candidate.id.level &&
                  terrainTileContains(candidate.id, tile.id)
              )
          );
          frontier = advanceTerrainTileFrontier(frontier, candidates, (key) =>
            meshes.has(key)
          );
        }
      }
      frontier = advanceTerrainTileFrontier(
        frontier,
        requested,
        (key) => meshes.has(key),
        finishedLoading
      );
      const activeKeys = new Set(frontier.map(({ key }) => key));
      const signature = [...activeKeys].sort().join(";");
      if (signature === stitchedActiveSignature) return;
      await smoothActiveBoundaryNormals(activeKeys, generation, current);
      if (!current()) return;
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
    const entriesToLoad = selection.loadEntries.filter(
      (entry) =>
        !meshes.has(terrainSelectionKey(entry)) &&
        !unavailableTileKeys.has(terrainTileKey(entry.id))
    );
    let completedEntries = 0;
    publishInBackground();
    void loadWithConcurrency(
      entriesToLoad,
      Math.max(1, payloadAwareConcurrency.getConcurrency(requestConcurrency)),
      async (entry) => {
        if (!current()) throw new Error("Stale terrain selection");
        try {
          return await prepareMesh(terrainSource, entry);
        } finally {
          // Reserve one work unit for the final stitched/publication pass.
          // Cancelled generations must never advance the current selection.
          if (current())
            setTerrainLoading(
              true,
              ++completedEntries / (entriesToLoad.length + 1)
            );
        }
      },
      () => {
        if (current()) publishInBackground();
      }
    )
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
        terrainSource.trimCache(
          new Set(selection.entries.map((entry) => terrainTileKey(entry.id)))
        );
        trimMeshCache(activeMeshKeys);
        setTerrainLoading(false);
        syncSelectionShadowView();
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
    .then((terrainSource) => {
      if (disposed) return;
      source = terrainSource;
      if (map) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          map,
          runtimeId,
          terrainSource.sampleHeight
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
    selectionRequestPending = true;
    void runTerrainWorkerTask({ kind: "select", input }, conversionAbort.signal)
      .then((result) => {
        if (disposed || result.kind !== "select") return;
        if (result.selection.signature !== requestedSignature) {
          requestedSignature = result.selection.signature;
          loadSelection(source!, result.selection);
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

  return {
    id: runtimeId,
    originLngLat,
    root,
    providesTerrain: true,
    receivesMapStyleTexture: options.receivesMapStyleTexture === true,
    mapStyleProjectionVersion: () => mapStyleProjectionVersion,
    updatePriority: TERRAIN_UPDATE_PRIORITY,
    ready,
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
      setSharedThreeTerrainLoading(mapInstance, runtimeId, terrainLoading);
      if (source && !unregisterSampler) {
        unregisterSampler = registerSharedThreeTerrainSampler(
          mapInstance,
          runtimeId,
          source.sampleHeight
        );
      }
      map.triggerRepaint();
    },
    update(frame) {
      if (disposed || !root.visible) return;
      if (!source) return;
      if (contentChangedSinceFrame) {
        contentChangedSinceFrame = false;
        options.onContentChanged?.();
      }
      if (selectionGeneration === 0) syncSelectionShadowView();
      const inputSignature = computeSelectionInputSignature(frame);
      if (inputSignature === selectionInputSignature) return;
      selectionInputSignature = inputSignature;
      if (typeof Worker === "undefined") {
        const selection = buildSelection(source, frame);
        if (selection.signature !== requestedSignature) {
          requestedSignature = selection.signature;
          loadSelection(source, selection);
        }
        return;
      }
      const input = snapshotSelectionInput(source, frame);
      if (selectionRequestPending) queuedSelectionInput = input;
      else runSelection(input);
    },
    setShadowView(view) {
      shadowView = view
        ? {
            camera: view.camera,
            shadowMapSize: normalizeShadowMapSize(view.shadowMapSize),
          }
        : null;
      const nextSignature = getSharedThreeShadowViewSignature(shadowView);
      if (nextSignature !== shadowViewSignature) {
        shadowViewSignature = nextSignature;
        if (!terrainLoading) syncSelectionShadowView();
      }
    },
    setMaterialColor(color) {
      material.color.set(color);
      map?.triggerRepaint();
    },
    getElevation(longitude, latitude) {
      const height = source?.sampleHeight(longitude, latitude);
      return height !== undefined &&
        noDataHeightMeters !== undefined &&
        Math.abs(height - noDataHeightMeters) <= NO_DATA_EPSILON_METERS
        ? undefined
        : height;
    },
    getViewElevationRange,
    getActiveTileVolumes,
    dispose() {
      if (disposed) return;
      disposed = true;
      takePresentations.delete(root);
      conversionAbort.abort();
      clearSelectionRetry();
      selectionGeneration += 1;
      unregisterSampler?.();
      unregisterSampler = null;
      if (map) setSharedThreeTerrainLoading(map, runtimeId, false, 0, false);
      for (const record of meshes.values()) {
        record.reliefMesh?.geometry.dispose();
      }
      meshes.clear();
      material.dispose();
      root.clear();
      map = null;
      settleReady(false);
    },
  };
};

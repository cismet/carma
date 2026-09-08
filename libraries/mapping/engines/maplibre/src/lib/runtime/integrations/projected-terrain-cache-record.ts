import {
  createDerivedBufferCache,
  resolveDerivedCacheAssetEpoch,
} from "@carma-commons/utils";
import {
  mergeTerrainHeightMetadata,
  TERRAIN_HEIGHT_METADATA_VERSION,
} from "../../core/terrain-height-metadata";
import type { TerrainTile } from "../../core/raster-dem-tile";
import { createProjectedTerrainCacheStrategy } from "./projected-terrain-cache-strategy";
import { cleanupLegacyProjectedTerrainCache } from "./projected-terrain-cache-maintenance";

export const PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION =
  "prepared-raster-dem-error-bounded-grid-v7";

const TERRAIN_CACHE_NAMESPACE = "terrain-projected";
// DBC-06: use the ENTRY worker identity, not this module's potentially split
// codec chunk. Vite hashes the worker and its imported dependency graph (also
// the inline normals WASM). An unchanged schema constant alone is insufficient.
// Unbundled HMR has no immutable graph identity: persistence fails closed there.
const workerAssetUrl = resolveDerivedCacheAssetEpoch({
  production: import.meta.env.PROD,
  assetUrl:
    typeof document === "undefined" && typeof location !== "undefined"
      ? location.href
      : "",
});

export type CachedProjectedTerrainGeometry = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  bounds: number[];
  sphere: number[];
}>;

export type CachedProjectedTerrainTile = Readonly<{
  tile: TerrainTile;
  geometry: CachedProjectedTerrainGeometry | null;
  reliefVertexMask: Uint8Array;
}>;

const isTypedArray = <T extends Float32Array | Uint32Array>(
  value: unknown,
  constructor: { new (array: ArrayLike<number>): T }
): value is T => value instanceof constructor;

const isCachedTile = (value: unknown): value is TerrainTile => {
  if (!value || typeof value !== "object") return false;
  const tile = value as Partial<TerrainTile>;
  const id = tile.id;
  const bounds = tile.bounds;
  return Boolean(
    id &&
      [id.level, id.x, id.y].every(Number.isInteger) &&
      bounds &&
      [bounds.west, bounds.south, bounds.east, bounds.north].every(
        Number.isFinite
      ) &&
      isTypedArray(tile.u, Float32Array) &&
      isTypedArray(tile.v, Float32Array) &&
      isTypedArray(tile.heightMeters, Float32Array) &&
      tile.u.length === tile.v.length &&
      tile.u.length === tile.heightMeters.length &&
      isTypedArray(tile.indices, Uint32Array) &&
      isTypedArray(tile.westIndices, Uint32Array) &&
      isTypedArray(tile.southIndices, Uint32Array) &&
      isTypedArray(tile.eastIndices, Uint32Array) &&
      isTypedArray(tile.northIndices, Uint32Array) &&
      Number.isFinite(tile.minimumHeightMeters) &&
      Number.isFinite(tile.maximumHeightMeters) &&
      Number.isFinite(tile.geometricErrorMeters) &&
      Number.isFinite(tile.byteLength) &&
      (tile.maximumMeshErrorMeters === undefined ||
        (Number.isFinite(tile.maximumMeshErrorMeters) &&
          tile.maximumMeshErrorMeters >= 0 &&
          tile.maximumMeshErrorMeters <= 0.01 &&
          Number.isFinite(tile.reconstructionErrorMeters) &&
          tile.reconstructionErrorMeters! >= 0 &&
          tile.reconstructionErrorMeters! <= tile.maximumMeshErrorMeters &&
          [1, 2, 4].includes(tile.rasterStride!)))
  );
};

const isCachedGeometry = (
  value: unknown
): value is CachedProjectedTerrainGeometry => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedProjectedTerrainGeometry>;
  if (
    !Array.isArray(record.bounds) ||
    record.bounds.length !== 6 ||
    !record.bounds.every(Number.isFinite) ||
    !Array.isArray(record.sphere) ||
    record.sphere.length !== 4 ||
    !record.sphere.every(Number.isFinite) ||
    record.sphere[3] < 0 ||
    !(record.positions instanceof Float32Array) ||
    !(record.normals instanceof Float32Array) ||
    !(record.indices instanceof Uint32Array) ||
    record.positions.length === 0 ||
    record.positions.length % 3 !== 0 ||
    record.normals.length !== record.positions.length ||
    record.indices.length === 0 ||
    record.indices.length % 3 !== 0
  ) {
    return false;
  }
  const vertexCount = record.positions.length / 3;
  for (const index of record.indices) {
    if (index >= vertexCount) return false;
  }
  return true;
};

export const isCachedProjectedTerrainTile = (
  value: unknown
): value is CachedProjectedTerrainTile => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CachedProjectedTerrainTile>;
  return Boolean(
    isCachedTile(entry.tile) &&
      (entry.geometry === null || isCachedGeometry(entry.geometry)) &&
      entry.reliefVertexMask instanceof Uint8Array &&
      entry.reliefVertexMask.length === entry.tile!.u.length
  );
};

const createPipelineCache = (producerEpoch: string) => {
  // DBC-06: preparation orchestration lives in the main runtime, while kernels,
  // codecs and inline WASM live in the worker. Both immutable graphs own the
  // same epoch, including format profiles/probes and their cleanup leases.
  const manager = createDerivedBufferCache({
    capacityBytes: 256 * 1024 ** 2,
    producerEpoch,
  });
  return {
    manager,
    heightMetadata: manager.register("terrain-height-metadata", TERRAIN_HEIGHT_METADATA_VERSION),
    records: manager.register(
      TERRAIN_CACHE_NAMESPACE,
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION
    ),
    strategy: createProjectedTerrainCacheStrategy(
      manager,
      TERRAIN_CACHE_NAMESPACE,
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
      isCachedProjectedTerrainTile
    ),
    activeJobs: 0,
  };
};
const pipelineCaches = new Map<
  string,
  ReturnType<typeof createPipelineCache>
>();
const MAX_PIPELINE_CACHES = 4;
let legacyCleanupAttempted = false;
const withPipelineCache = async <T>(
  producerAssetUrl: string | undefined,
  missing: T,
  use: (cache: ReturnType<typeof createPipelineCache>) => Promise<T>
): Promise<T> => {
  const mainAssetUrl = resolveDerivedCacheAssetEpoch({
    production: import.meta.env.PROD,
    assetUrl: producerAssetUrl ?? "",
  });
  if (!mainAssetUrl || !workerAssetUrl) return missing;
  const epoch = JSON.stringify([mainAssetUrl, workerAssetUrl]);
  let cache = pipelineCaches.get(epoch);
  if (!cache) {
    if (pipelineCaches.size >= MAX_PIPELINE_CACHES) {
      const oldest = [...pipelineCaches].find(
        ([, candidate]) => candidate.activeJobs === 0
      );
      // Normal worker jobs are serialized. Concurrent direct callers still
      // must not close an in-flight pipeline to admit a fifth identity.
      if (!oldest) return missing;
      oldest[1].strategy.dispose();
      oldest[1].manager.close();
      pipelineCaches.delete(oldest[0]);
    }
    cache = createPipelineCache(epoch);
  }
  pipelineCaches.delete(epoch);
  pipelineCaches.set(epoch, cache);
  cache.activeJobs += 1;
  try {
    return await use(cache);
  } finally {
    cache.activeJobs -= 1;
  }
};

export const calibrateProjectedTerrainCache = (
  producerAssetUrl?: string,
  signal?: AbortSignal
) =>
  signal?.aborted
    ? Promise.resolve(false)
    : withPipelineCache(
        producerAssetUrl,
        false,
        async ({ manager, strategy }) => {
          // Idle-only: current/live pipelines retain leases, not chronological ranks.
          await manager.cleanupObsoleteEpochs();
          if (!legacyCleanupAttempted && !signal?.aborted) {
            legacyCleanupAttempted = true;
            // This old localforage store has no compatible readers in the new app.
            // Clear its derived payload only, with a bounded native transaction.
            await cleanupLegacyProjectedTerrainCache();
          }
          return signal?.aborted ? false : strategy.calibrate(signal);
        }
      );

/** IndexedDB deserialization and full index validation run in the terrain worker. */
export const readProjectedTerrainCacheRecord = (
  key: string,
  producerAssetUrl?: string
): Promise<CachedProjectedTerrainTile | null> =>
  withPipelineCache<CachedProjectedTerrainTile | null>(
    producerAssetUrl,
    null,
    async ({ records, strategy }) =>
      strategy.decode((await records.get<unknown>(key))?.value)
  );

export const readTerrainHeightMetadata = (
  key: string,
  producerAssetUrl?: string
) =>
  withPipelineCache<Float64Array | null>(
    producerAssetUrl,
    null,
    async ({ heightMetadata }) =>
      (await heightMetadata.get<Float64Array>(key))?.value ?? null
  );

export const writeTerrainHeightMetadata = (
  key: string,
  update: Float64Array,
  producerAssetUrl?: string
) =>
  withPipelineCache(producerAssetUrl, false, async ({ heightMetadata }) => {
    // A separate source-scoped lock protects read/merge/write across workers
    // and tabs. Without Web Locks retain RAM metadata; losing an observation
    // is not a reason to risk publishing a narrower concurrent extent.
    if (typeof navigator === "undefined" || !navigator.locks?.request)
      return false;
    return navigator.locks.request(
      `terrain-height-metadata:${producerAssetUrl}:${key}`,
      async () => {
        const previous = (await heightMetadata.get<Float64Array>(key))?.value;
        const merged = mergeTerrainHeightMetadata(previous, update);
        return heightMetadata.put(key, merged, { bytes: merged.byteLength });
      }
    );
  });

export const writeProjectedTerrainCacheRecord = (
  key: string,
  entry: CachedProjectedTerrainTile,
  bytes: number,
  recomputeMs?: number,
  producerAssetUrl?: string
) =>
  withPipelineCache(producerAssetUrl, false, async ({ records, strategy }) => {
    if (!strategy.canWrite(key)) return false;
    const encoded = await strategy.encode(entry, bytes);
    if (!encoded) return false;
    return records.put(key, encoded.payload, {
      bytes: encoded.bytes,
      recomputeMs,
    });
  });

export const updateProjectedTerrainReadCost = (
  key: string,
  restoreMs: number,
  producerAssetUrl?: string
) =>
  withPipelineCache(producerAssetUrl, false, ({ strategy }) =>
    strategy.updateCosts(key, restoreMs)
  );

/** Small, read-only format audit; never loads terrain payloads or adds hits. */
export const inspectProjectedTerrainCacheProfiles = (
  producerAssetUrl?: string
) =>
  withPipelineCache<Awaited<
    ReturnType<
      ReturnType<typeof createProjectedTerrainCacheStrategy>["inspectProfiles"]
    >
  > | null>(producerAssetUrl, null, ({ strategy }) =>
    strategy.inspectProfiles()
  );

import md5 from "md5";
import { BufferGeometry, BufferAttribute, Box3, Sphere, Vector3 } from "three";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";

import { runTerrainWorkerTask } from "./terrain-worker-client";
import type { TerrainWorkerTask } from "./terrain-worker-task";
import { resolveRasterMeshErrorMeters } from "../../core/raster-mesh-error";
import {
  PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
  type CachedProjectedTerrainGeometry,
  type CachedProjectedTerrainTile,
} from "./projected-terrain-cache-record";

import {
  terrainTileKey,
  type TerrainTile,
  type TerrainTileId,
} from "./raster-dem-terrain-tile-source";

export { PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION } from "./projected-terrain-cache-record";
const MAX_PENDING_WRITE_BYTES = 32 * 1024 ** 2;
// This optional shortcut must not postpone source terrain behind a hung IDB
// transaction. The total budget includes queued work and a same-key write.
const CACHE_READ_DEADLINE_MS = 50;
export type ProjectedTerrainCacheEntry = Readonly<{
  tile: TerrainTile;
  geometry: BufferGeometry | null;
  reliefVertexMask: Uint8Array;
}>;

type ProjectedTerrainGeometryCache = Readonly<{
  get: (
    id: TerrainTileId,
    maximumMeshErrorMeters?: number
  ) => Promise<ProjectedTerrainCacheEntry | null>;
  set: (
    tile: TerrainTile,
    geometry: BufferGeometry | null,
    reliefVertexMask: Uint8Array,
    recomputeMs?: number
  ) => void;
}>;

const pendingWrites = new Map<string, Promise<void>>();
let pendingWriteBytes = 0;
let cacheTimedOut = false;
const cacheJobs = new Set<AbortController>();
const runCacheTask = async (task: TerrainWorkerTask) => {
  const controller = new AbortController();
  cacheJobs.add(controller);
  try {
    return await runTerrainWorkerTask(task, controller.signal);
  } finally {
    cacheJobs.delete(controller);
  }
};
const disableTimedOutCache = () => {
  cacheTimedOut = true;
  // Module-session circuit breaker, not a persistent ban. Abort optional writes
  // and cost feedback too: they may own the worker/IDB lock delaying this read.
  for (const controller of cacheJobs) {
    controller.abort(
      new DOMException("Terrain cache read timed out", "TimeoutError")
    );
  }
};
const hash = md5 as unknown as (message: string | Uint8Array) => string;

const restoreGeometry = (record: CachedProjectedTerrainGeometry) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(record.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(record.normals, 3));
  geometry.setIndex(new BufferAttribute(record.indices, 1));
  geometry.boundingBox = new Box3(
    new Vector3().fromArray(record.bounds),
    new Vector3().fromArray(record.bounds, 3)
  );
  geometry.boundingSphere = new Sphere(
    new Vector3().fromArray(record.sphere),
    record.sphere[3]
  );
  return geometry;
};

const snapshotGeometry = (
  geometry: BufferGeometry,
  availableBytes: number
): CachedProjectedTerrainGeometry | null => {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!position || !normal || !index) return null;
  // Worker-generated terrain already supplies these. Do not rescan cached
  // vertices on reload; missing bounds mean this geometry is not cache-ready.
  if (!geometry.boundingBox || !geometry.boundingSphere) return null;
  const byteLength =
    (position.array.length + normal.array.length) *
      Float32Array.BYTES_PER_ELEMENT +
    index.array.length * Uint32Array.BYTES_PER_ELEMENT;
  if (byteLength > availableBytes) return null;
  return {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    indices: Uint32Array.from(index.array),
    bounds: [
      ...geometry.boundingBox.min.toArray(),
      ...geometry.boundingBox.max.toArray(),
    ],
    sphere: [
      ...geometry.boundingSphere.center.toArray(),
      geometry.boundingSphere.radius,
    ],
  };
};

export const createProjectedTerrainGeometryCache = (
  terrainSourceKey: string,
  originLngLat: readonly [longitude: number, latitude: number],
  noDataHeightMeters: number | undefined,
  producerAssetUrl?: string
): ProjectedTerrainGeometryCache => {
  // Development module URLs survive source/HMR changes and cannot identify an
  // immutable transformation graph. Skip even the worker read and buffer-copy
  // cost there; the worker independently verifies its built producer identity.
  const producer = resolveDerivedCacheAssetEpoch({
    production: import.meta.env.PROD,
    assetUrl: producerAssetUrl ?? "",
  });
  if (!producer) return { get: async () => null, set: () => {} };
  const namespace = hash(
    [
      terrainSourceKey,
      originLngLat[0],
      originLngLat[1],
      noDataHeightMeters ?? "no-nodata",
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
    ].join("|")
  );
  const getKey = (id: TerrainTileId, maximumMeshErrorMeters?: number) =>
    `${namespace}:${terrainTileKey(id)}:error=${resolveRasterMeshErrorMeters(
      maximumMeshErrorMeters
    )}`;
  const getPendingKey = (key: string) => JSON.stringify([producer, key]);
  const readTimings = new Map<string, number[]>();

  return {
    async get(id, maximumMeshErrorMeters) {
      if (cacheTimedOut) return null;
      const key = getKey(id, maximumMeshErrorMeters);
      const start = performance.now();
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const deadline = new Promise<null>((resolve) => {
          timer = setTimeout(() => {
            disableTimedOutCache();
            resolve(null);
          }, CACHE_READ_DEADLINE_MS);
        });
        const read = async () => {
          await pendingWrites.get(getPendingKey(key));
          if (cacheTimedOut) return null;
          const result = await runCacheTask({
            kind: "read-cache",
            key,
            producerAssetUrl: producer,
          });
          return result.kind === "read-cache" ? result.entry : null;
        };
        const cached = await Promise.race([read(), deadline]);
        // A timed-out worker can still finish in headless execution. Its late
        // payload must never create geometry or emit successful-read feedback.
        if (cacheTimedOut) return null;
        if (
          !cached ||
          cached.tile.id.level !== id.level ||
          cached.tile.id.x !== id.x ||
          cached.tile.id.y !== id.y ||
          (cached.tile.reconstructionErrorMeters ?? 0) >
            resolveRasterMeshErrorMeters(maximumMeshErrorMeters) ||
          (cached.tile.maximumMeshErrorMeters !== undefined &&
            cached.tile.maximumMeshErrorMeters !==
              resolveRasterMeshErrorMeters(maximumMeshErrorMeters))
        ) {
          if (performance.now() - start >= CACHE_READ_DEADLINE_MS)
            disableTimedOutCache();
          return null;
        }
        // Native IndexedDB returns a clone owned by this read; the worker
        // transfers it. No additional copies or fallback string-storage adapter.
        const restored = {
          tile: cached.tile,
          geometry: cached.geometry ? restoreGeometry(cached.geometry) : null,
          reliefVertexMask: cached.reliefVertexMask,
        };
        const restoreMs = performance.now() - start;
        // A busy main thread can defer the timer task beyond its deadline. Check
        // the measured total as well before adopting the transferred payload.
        if (restoreMs >= CACHE_READ_DEADLINE_MS) {
          restored.geometry?.dispose();
          disableTimedOutCache();
          return null;
        }
        // Include worker wait/transfer and reconstruction, not just IDB service
        // time. Feedback is lower priority than visible terrain and never awaited.
        const samples = readTimings.get(key) ?? [];
        samples.push(restoreMs);
        if (samples.length > 5) samples.shift();
        readTimings.delete(key);
        readTimings.set(key, samples);
        if (readTimings.size > 256)
          readTimings.delete(readTimings.keys().next().value!);
        // A mesh may be read only once per runtime, so persist the first real
        // measurement too. Later reuse refines it with the bounded rolling median;
        // waiting for three local reads would leave reload-only entries unknown.
        void runCacheTask({
          kind: "cache-cost",
          key,
          producerAssetUrl: producer,
          restoreMs: [...samples].sort((a, b) => a - b)[
            Math.floor(samples.length / 2)
          ],
        }).catch(() => {});
        return restored;
      } catch {
        if (performance.now() - start >= CACHE_READ_DEADLINE_MS)
          disableTimedOutCache();
        return null;
      } finally {
        clearTimeout(timer);
      }
    },

    set(tile, geometry, reliefVertexMask, recomputeMs) {
      if (cacheTimedOut) return;
      const key = getKey(tile.id, tile.maximumMeshErrorMeters);
      const pendingKey = getPendingKey(key);
      if (pendingWrites.has(pendingKey)) return;
      const tileArrays = [
        tile.u,
        tile.v,
        tile.heightMeters,
        tile.indices,
        tile.westIndices,
        tile.southIndices,
        tile.eastIndices,
        tile.northIndices,
      ];
      // An optional cache must never turn incomplete/foreign runtime metadata
      // into a failed visible terrain publication.
      if (!tileArrays.every((array) => ArrayBuffer.isView(array))) return;
      // Blob-restored tile views can share the complete container backing.
      // Retaining/cloning the tile keeps that buffer once, not once per view.
      const tileBytes = [
        ...new Set(tileArrays.map((array) => array.buffer)),
      ].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
      // The pending entry owns a compact mask copy, not the input mask backing.
      const maskBytes = reliefVertexMask.byteLength;
      if (tileBytes + maskBytes > MAX_PENDING_WRITE_BYTES - pendingWriteBytes)
        return;
      let snapshot: CachedProjectedTerrainGeometry | null = null;
      try {
        // Include the source arrays retained by the write; check the global
        // budget before allocating optional geometry snapshots.
        if (geometry) {
          snapshot = snapshotGeometry(
            geometry,
            MAX_PENDING_WRITE_BYTES - pendingWriteBytes - tileBytes - maskBytes
          );
          if (!snapshot) return;
        }
      } catch {
        return;
      }
      const byteLength =
        tileBytes +
        maskBytes +
        (snapshot
          ? snapshot.positions.byteLength +
            snapshot.normals.byteLength +
            snapshot.indices.byteLength
          : 0);
      const entry: CachedProjectedTerrainTile = {
        tile,
        geometry: snapshot,
        reliefVertexMask: Uint8Array.from(reliefVertexMask),
      };
      pendingWriteBytes += byteLength;
      const write = runCacheTask({
        kind: "write-cache",
        key,
        entry,
        bytes: byteLength,
        recomputeMs,
        producerAssetUrl: producer,
      })
        .then(() => undefined)
        .catch(() => {
          /* Optional cache: a failed write must not disable reads. */
        })
        .finally(() => {
          pendingWriteBytes -= byteLength;
          pendingWrites.delete(pendingKey);
        });
      pendingWrites.set(pendingKey, write);
    },
  };
};

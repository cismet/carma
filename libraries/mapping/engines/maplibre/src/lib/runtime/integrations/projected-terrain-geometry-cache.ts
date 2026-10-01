import { BufferGeometry, BufferAttribute, Box3, Sphere, Vector3 } from "three";
import { resolveDerivedCacheAssetEpoch } from "@carma-commons/utils";

import { runTerrainWorkerTask } from "./terrain-worker-client";
import type { TerrainWorkerTask } from "./terrain-worker-task";
import { resolveRasterMeshErrorMeters } from "../../core/raster-mesh-error";
import { terrainIndexArraysEqual } from "../../core/terrain-index-equality";
import { terrainCacheTree } from "./terrain-cache-tree";
import type { TerrainEcefGeometryRecord } from "./terrain-ecef-geometry-cache.worker";
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
// A complete dense 512-cell baseline record exceeds 32 MiB. This remains a
// shared bound checked before snapshots, not a per-worker allowance.
const MAX_PENDING_WRITE_BYTES = 64 * 1024 ** 2;
// This optional shortcut must not postpone source terrain behind a hung IDB
// transaction. The total budget includes queued work and a same-key write.
const CACHE_READ_DEADLINE_MS = 50;
const CACHE_WRITE_DEADLINE_MS = 5_000;
export type ProjectedTerrainCacheEntry = Readonly<{
  tile: TerrainTile;
  geometry: BufferGeometry | null;
  reliefVertexMask: Uint8Array;
  cachedEcefGeometry?: BufferGeometry | null;
}>;

type ProjectedTerrainGeometryCache = Readonly<{
  protectBaseline: (ids: readonly TerrainTileId[]) => Promise<boolean>;
  markUsed: (ids: readonly TerrainTileId[]) => Promise<void>;
  close: () => void;
  get: (
    id: TerrainTileId,
    maximumMeshErrorMeters?: number
  ) => Promise<ProjectedTerrainCacheEntry | null>;
  set: (
    tile: TerrainTile,
    geometry: BufferGeometry | null,
    reliefVertexMask: Uint8Array,
    recomputeMs?: number,
    signal?: AbortSignal,
    cachedEcefGeometry?: BufferGeometry | null
  ) => Promise<boolean>;
}>;

const pendingWrites = new Map<string, Promise<boolean>>();
let pendingWriteBytes = 0;
let cacheTimedOut = false;
const cacheJobs = new Set<AbortController>();
const runCacheTask = async (task: TerrainWorkerTask, signal?: AbortSignal) => {
  const controller = new AbortController();
  cacheJobs.add(controller);
  try {
    return await runTerrainWorkerTask(
      task,
      signal ? AbortSignal.any([controller.signal, signal]) : controller.signal
    );
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

const restoreGeometry = (
  record: CachedProjectedTerrainGeometry | TerrainEcefGeometryRecord,
  sourceIndices?: Uint32Array
) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(record.positions, 3));
  geometry.setAttribute("normal", new BufferAttribute(record.normals, 3));
  geometry.setIndex(
    new BufferAttribute(
      record.indices instanceof Uint32Array &&
      sourceIndices &&
      terrainIndexArraysEqual(record.indices, sourceIndices)
        ? sourceIndices
        : record.indices,
      1
    )
  );
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

function snapshotGeometry(
  geometry: BufferGeometry,
  availableBytes: number,
  preserveIndices?: false,
  sharedIndices?: Uint32Array
): CachedProjectedTerrainGeometry | null;
function snapshotGeometry(
  geometry: BufferGeometry,
  availableBytes: number,
  preserveIndices: true,
  sharedIndices?: Uint32Array
): TerrainEcefGeometryRecord | null;
function snapshotGeometry(
  geometry: BufferGeometry,
  availableBytes: number,
  preserveIndices = false,
  sharedIndices?: Uint32Array
): CachedProjectedTerrainGeometry | TerrainEcefGeometryRecord | null {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!position || !normal || !index) return null;
  // Worker-generated terrain already supplies these. Do not rescan cached
  // vertices on reload; missing bounds mean this geometry is not cache-ready.
  if (!geometry.boundingBox || !geometry.boundingSphere) return null;
  const reuseIndices =
    index.array instanceof Uint32Array &&
    sharedIndices &&
    terrainIndexArraysEqual(index.array, sharedIndices);
  const byteLength =
    (position.array.length + normal.array.length) *
      Float32Array.BYTES_PER_ELEMENT +
    (reuseIndices
      ? 0
      : index.array.length *
        (preserveIndices && index.array instanceof Uint16Array ? 2 : 4));
  if (byteLength > availableBytes) return null;
  return {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    indices: reuseIndices
      ? sharedIndices!
      : preserveIndices && index.array instanceof Uint16Array
      ? Uint16Array.from(index.array)
      : Uint32Array.from(index.array),
    bounds: [
      ...geometry.boundingBox.min.toArray(),
      ...geometry.boundingBox.max.toArray(),
    ],
    sphere: [
      ...geometry.boundingSphere.center.toArray(),
      geometry.boundingSphere.radius,
    ],
  };
}

export const createProjectedTerrainGeometryCache = (
  terrainSourceKey: string,
  originLngLat: readonly [longitude: number, latitude: number],
  noDataHeightMeters: number | undefined,
  producerAssetUrl?: string,
  options: Readonly<{
    minimumSourceLevel?: number;
    sourceRevision?: string;
    presentationMode?: "ecef" | "native";
  }> = {}
): ProjectedTerrainGeometryCache => {
  // Development module URLs survive source/HMR changes and cannot identify an
  // immutable transformation graph. Skip even the worker read and buffer-copy
  // cost there; the worker independently verifies its built producer identity.
  const producer = resolveDerivedCacheAssetEpoch({
    production: import.meta.env.PROD,
    assetUrl: producerAssetUrl ?? "",
  });
  if (!producer)
    return {
      get: async () => null,
      set: async () => false,
      protectBaseline: async () => false,
      markUsed: async () => {},
      close: () => {},
    };
  const namespace = JSON.stringify([
    terrainSourceKey,
    originLngLat[0],
    originLngLat[1],
    noDataHeightMeters ?? "no-nodata",
    PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
    options.sourceRevision ?? null,
    options.minimumSourceLevel ?? 0,
    producer,
    options.presentationMode ?? "native",
  ]);
  const getKey = (id: TerrainTileId, maximumMeshErrorMeters?: number) =>
    `${namespace}:${terrainTileKey(id)}:error=${resolveRasterMeshErrorMeters(
      maximumMeshErrorMeters
    )}`;
  const getPendingKey = (key: string) => JSON.stringify([producer, key]);
  const readTimings = new Map<string, number[]>();
  const lifetime = new AbortController();
  const identities = new Set<string>();
  const getTree = (id: TerrainTileId, error?: number) => {
    const identity = JSON.stringify([
      namespace,
      resolveRasterMeshErrorMeters(error),
    ]);
    identities.add(identity);
    return terrainCacheTree(identity, id, options.minimumSourceLevel);
  };
  const runOwnedCacheTask = (task: TerrainWorkerTask, signal?: AbortSignal) =>
    runCacheTask(
      task,
      signal ? AbortSignal.any([lifetime.signal, signal]) : lifetime.signal
    );

  return {
    async markUsed(ids) {
      if (lifetime.signal.aborted || cacheTimedOut) return;
      const nodes = ids.map((id) => terrainCacheTree("", id).node);
      await Promise.all(
        [...identities].map((identity) =>
          runOwnedCacheTask({
            kind: "mark-cache-used",
            identity,
            nodes,
            producerAssetUrl: producer,
          }).catch(() => {})
        )
      );
    },
    close() {
      lifetime.abort();
      readTimings.clear();
      identities.clear();
    },
    async protectBaseline(ids) {
      if (lifetime.signal.aborted || cacheTimedOut) return false;
      const nodes = ids.map((id) => terrainCacheTree("", id).node);
      const outcomes = await Promise.all(
        [...identities].map((identity) =>
          runOwnedCacheTask({
            kind: "protect-cache",
            identity,
            nodes,
            producerAssetUrl: producer,
          })
            .then(
              (result) => result.kind === "protect-cache" && result.protected
            )
            .catch(() => false)
        )
      );
      return outcomes.length > 0 && outcomes.every(Boolean);
    },
    async get(id, maximumMeshErrorMeters) {
      if (cacheTimedOut || lifetime.signal.aborted) return null;
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
          const result = await runOwnedCacheTask({
            kind: "read-cache",
            key,
            tree: getTree(id, maximumMeshErrorMeters),
            producerAssetUrl: producer,
          });
          return result.kind === "read-cache" ? result.entry : null;
        };
        const cached = await Promise.race([read(), deadline]);
        // A timed-out worker can still finish in headless execution. Its late
        // payload must never create geometry or emit successful-read feedback.
        if (cacheTimedOut || lifetime.signal.aborted) return null;
        if (
          !cached ||
          (options.presentationMode !== "ecef" && cached.presentation) ||
          (options.presentationMode === "ecef" &&
            cached.geometry &&
            !cached.presentation) ||
          (cached.presentation &&
            (cached.presentation.origin[0] !== originLngLat[0] ||
              cached.presentation.origin[1] !== originLngLat[1])) ||
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
        const nativeGeometry = cached.geometry
          ? restoreGeometry(cached.geometry, cached.tile.indices)
          : null;
        const restored = {
          tile: cached.tile,
          geometry: nativeGeometry,
          reliefVertexMask: cached.reliefVertexMask,
          cachedEcefGeometry: cached.presentation
            ? restoreGeometry(
                cached.presentation.geometry,
                nativeGeometry?.index?.array instanceof Uint32Array
                  ? nativeGeometry.index.array
                  : undefined
              )
            : null,
        };
        const restoreMs = performance.now() - start;
        // A busy main thread can defer the timer task beyond its deadline. Check
        // the measured total as well before adopting the transferred payload.
        if (restoreMs >= CACHE_READ_DEADLINE_MS) {
          restored.geometry?.dispose();
          restored.cachedEcefGeometry?.dispose();
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
        void runOwnedCacheTask({
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

    async set(
      tile,
      geometry,
      reliefVertexMask,
      recomputeMs,
      signal,
      cachedEcefGeometry
    ) {
      if (cacheTimedOut || signal?.aborted || lifetime.signal.aborted)
        return false;
      if (
        options.presentationMode === "ecef" &&
        geometry &&
        !cachedEcefGeometry
      )
        return false;
      const key = getKey(tile.id, tile.maximumMeshErrorMeters);
      const pendingKey = getPendingKey(key);
      const pending = pendingWrites.get(pendingKey);
      if (pending) return pending;
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
      if (!tileArrays.every((array) => ArrayBuffer.isView(array))) return false;
      // Blob-restored tile views can share the complete container backing.
      // Retaining/cloning the tile keeps that buffer once, not once per view.
      const tileBytes = [
        ...new Set(tileArrays.map((array) => array.buffer)),
      ].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
      // The pending entry owns a compact mask copy, not the input mask backing.
      const maskBytes = reliefVertexMask.byteLength;
      if (tileBytes + maskBytes > MAX_PENDING_WRITE_BYTES - pendingWriteBytes)
        return false;
      let snapshot: CachedProjectedTerrainGeometry | null = null;
      try {
        // Include the source arrays retained by the write; check the global
        // budget before allocating optional geometry snapshots.
        if (geometry) {
          snapshot = snapshotGeometry(
            geometry,
            MAX_PENDING_WRITE_BYTES - pendingWriteBytes - tileBytes - maskBytes,
            false,
            tile.indices
          );
          if (!snapshot) return false;
        }
      } catch {
        return false;
      }
      let byteLength =
        tileBytes +
        maskBytes +
        (snapshot
          ? snapshot.positions.byteLength +
            snapshot.normals.byteLength +
            (tileArrays.some(
              (array) => array.buffer === snapshot!.indices.buffer
            )
              ? 0
              : snapshot.indices.byteLength)
          : 0);
      const presentation =
        options.presentationMode === "ecef" && snapshot && cachedEcefGeometry
          ? snapshotGeometry(
              cachedEcefGeometry,
              MAX_PENDING_WRITE_BYTES - pendingWriteBytes - byteLength,
              true,
              snapshot.indices
            )
          : null;
      if (options.presentationMode === "ecef" && snapshot && !presentation)
        return false;
      if (presentation)
        byteLength += [
          ...new Set([
            presentation.positions.buffer,
            presentation.normals.buffer,
            presentation.indices.buffer,
          ]),
        ]
          .filter((buffer) => buffer !== snapshot!.indices.buffer)
          .reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const entry: CachedProjectedTerrainTile = {
        tile,
        geometry: snapshot,
        reliefVertexMask: Uint8Array.from(reliefVertexMask),
        ...(presentation && snapshot
          ? {
              presentation: {
                mode: "ecef" as const,
                origin: [...originLngLat] as [number, number],
                geometry: presentation,
                native: {
                  normals: snapshot.normals,
                  indices: snapshot.indices,
                  bounds: snapshot.bounds,
                  sphere: snapshot.sphere,
                },
              },
            }
          : {}),
      };
      pendingWriteBytes += byteLength;
      const deadline = AbortSignal.timeout(CACHE_WRITE_DEADLINE_MS);
      const write = runOwnedCacheTask(
        {
          kind: "write-cache",
          key,
          tree: getTree(tile.id, tile.maximumMeshErrorMeters),
          entry,
          bytes: byteLength,
          recomputeMs,
          producerAssetUrl: producer,
        },
        signal ? AbortSignal.any([signal, deadline]) : deadline
      )
        .then((result) => result.kind === "write-cache" && result.stored)
        .catch(() => {
          /* Optional cache: a failed write must not disable reads. */
          return false;
        })
        .finally(() => {
          pendingWriteBytes -= byteLength;
          pendingWrites.delete(pendingKey);
        });
      pendingWrites.set(pendingKey, write);
      return write;
    },
  };
};

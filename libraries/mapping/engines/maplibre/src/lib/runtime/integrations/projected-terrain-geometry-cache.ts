import localforage from "localforage";
import md5 from "md5";
import { BufferGeometry, BufferAttribute, Box3, Sphere, Vector3 } from "three";

import { runTerrainWorkerTask } from "./terrain-worker-client";
import {
  projectedTerrainGeometryStorage as storage,
  type CachedProjectedTerrainGeometry,
  type CachedProjectedTerrainTile,
} from "./projected-terrain-cache-record";

import {
  terrainTileKey,
  type TerrainTile,
  type TerrainTileId,
} from "./raster-dem-terrain-tile-source";

// Bump the revision whenever projection, winding, generated attributes, or the
// persisted tile metadata change.
export const PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION =
  "prepared-raster-dem-interpolated-boundaries-v6";

const CACHE_REVISION_KEY = "__conversion_revision__";
const MAX_PENDING_WRITE_BYTES = 32 * 1024 ** 2;
export type ProjectedTerrainCacheEntry = Readonly<{
  tile: TerrainTile;
  geometry: BufferGeometry | null;
  reliefVertexMask: Uint8Array;
}>;

type ProjectedTerrainGeometryCache = Readonly<{
  get: (id: TerrainTileId) => Promise<ProjectedTerrainCacheEntry | null>;
  set: (
    tile: TerrainTile,
    geometry: BufferGeometry | null,
    reliefVertexMask: Uint8Array
  ) => void;
}>;

let cacheAvailable = true;
let revisionReady: Promise<boolean> | null = null;
const pendingWrites = new Map<string, Promise<void>>();
let pendingWriteBytes = 0;

const prepareStorage = () => {
  revisionReady ??= (async () => {
    try {
      const revision = await storage.getItem<string>(CACHE_REVISION_KEY);
      if (revision !== PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION) {
        await storage.clear();
        await storage.setItem(
          CACHE_REVISION_KEY,
          PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION
        );
      }
      return true;
    } catch {
      cacheAvailable = false;
      return false;
    }
  })();
  return revisionReady;
};

const hash = md5 as unknown as (message: string | Uint8Array) => string;

const cloneTile = (tile: TerrainTile): TerrainTile => ({
  ...tile,
  id: { ...tile.id },
  bounds: { ...tile.bounds },
  u: Float32Array.from(tile.u),
  v: Float32Array.from(tile.v),
  heightMeters: Float32Array.from(tile.heightMeters),
  indices: Uint32Array.from(tile.indices),
  westIndices: Uint32Array.from(tile.westIndices),
  southIndices: Uint32Array.from(tile.southIndices),
  eastIndices: Uint32Array.from(tile.eastIndices),
  northIndices: Uint32Array.from(tile.northIndices),
});

const restoreGeometry = (
  record: CachedProjectedTerrainGeometry,
  ownsArrays: boolean
) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new BufferAttribute(
      ownsArrays ? record.positions : Float32Array.from(record.positions),
      3
    )
  );
  geometry.setAttribute(
    "normal",
    new BufferAttribute(
      ownsArrays ? record.normals : Float32Array.from(record.normals),
      3
    )
  );
  geometry.setIndex(
    new BufferAttribute(
      ownsArrays ? record.indices : Uint32Array.from(record.indices),
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
  noDataHeightMeters: number | undefined
): ProjectedTerrainGeometryCache => {
  const namespace = hash(
    [
      terrainSourceKey,
      originLngLat[0],
      originLngLat[1],
      noDataHeightMeters ?? "no-nodata",
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
    ].join("|")
  );
  const getKey = (id: TerrainTileId) => `${namespace}:${terrainTileKey(id)}`;

  return {
    async get(id) {
      if (!cacheAvailable || !(await prepareStorage())) return null;
      const key = getKey(id);
      await pendingWrites.get(key);
      if (!cacheAvailable) return null;
      let cached: CachedProjectedTerrainTile | null;
      try {
        const result = await runTerrainWorkerTask({ kind: "read-cache", key });
        if (result.kind !== "read-cache") return null;
        cached = result.entry;
      } catch {
        cacheAvailable = false;
        return null;
      }
      if (
        !cached ||
        cached.tile.id.level !== id.level ||
        cached.tile.id.x !== id.x ||
        cached.tile.id.y !== id.y
      )
        return null;
      // IndexedDB returns a structured clone owned by this read. Keep
      // defensive copies for adapters without that ownership guarantee.
      const ownsArrays =
        typeof Worker !== "undefined" ||
        storage.driver() === localforage.INDEXEDDB;
      const tile = ownsArrays ? cached.tile : cloneTile(cached.tile);
      const reliefVertexMask = ownsArrays
        ? cached.reliefVertexMask
        : Uint8Array.from(cached.reliefVertexMask);
      return {
        tile,
        geometry: cached.geometry
          ? restoreGeometry(cached.geometry, ownsArrays)
          : null,
        reliefVertexMask,
      };
    },

    set(tile, geometry, reliefVertexMask) {
      if (!cacheAvailable) return;
      const key = getKey(tile.id);
      if (pendingWrites.has(key)) return;
      const tileBytes = [
        tile.u,
        tile.v,
        tile.heightMeters,
        tile.indices,
        tile.westIndices,
        tile.southIndices,
        tile.eastIndices,
        tile.northIndices,
      ].reduce((bytes, array) => bytes + array.buffer.byteLength, 0);
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
        cacheAvailable = false;
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
      const write = prepareStorage()
        .then((ready) => {
          if (!ready || !cacheAvailable) return;
          return storage.setItem(key, entry).then(() => undefined);
        })
        .catch(() => {
          cacheAvailable = false;
        })
        .finally(() => {
          pendingWriteBytes -= byteLength;
          pendingWrites.delete(key);
        });
      pendingWrites.set(key, write);
    },
  };
};

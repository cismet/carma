import localforage from "localforage";
import md5 from "md5";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Uint32BufferAttribute,
} from "three";

import {
  cesiumTerrainTileKey,
  type CesiumTerrainTile,
  type CesiumTerrainTileId,
} from "@carma-mapping/engines/cesium/terrain";

// Bump the revision whenever projection, winding, generated attributes, or the
// persisted tile metadata change.
export const PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION =
  "projected-quantized-mesh-v2";

const CACHE_REVISION_KEY = "__conversion_revision__";
const storage = localforage.createInstance({
  name: "carma-terrain-geometry-cache",
  storeName: "projected_tiles",
});

type CachedProjectedTerrainGeometry = Readonly<{
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}>;

type CachedProjectedTerrainTile = Readonly<{
  tile: CesiumTerrainTile;
  geometry: CachedProjectedTerrainGeometry;
}>;

export type ProjectedTerrainCacheEntry = Readonly<{
  tile: CesiumTerrainTile;
  geometry: BufferGeometry;
}>;

type ProjectedTerrainGeometryCache = Readonly<{
  get: (id: CesiumTerrainTileId) => Promise<ProjectedTerrainCacheEntry | null>;
  set: (tile: CesiumTerrainTile, geometry: BufferGeometry) => void;
}>;

let cacheAvailable = true;
let revisionReady: Promise<boolean> | null = null;
const pendingWrites = new Map<string, Promise<void>>();

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

const isTypedArray = <T extends Float32Array | Uint32Array>(
  value: unknown,
  constructor: { new (array: ArrayLike<number>): T }
): value is T => value instanceof constructor;

const isCachedTile = (value: unknown): value is CesiumTerrainTile => {
  if (!value || typeof value !== "object") return false;
  const tile = value as Partial<CesiumTerrainTile>;
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
      Number.isFinite(tile.childTileMask) &&
      Number.isFinite(tile.geometricErrorMeters) &&
      Number.isFinite(tile.byteLength)
  );
};

const isCachedGeometry = (
  value: unknown
): value is CachedProjectedTerrainGeometry => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedProjectedTerrainGeometry>;
  if (
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

const isCachedEntry = (value: unknown): value is CachedProjectedTerrainTile => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CachedProjectedTerrainTile>;
  return isCachedTile(entry.tile) && isCachedGeometry(entry.geometry);
};

const cloneTile = (tile: CesiumTerrainTile): CesiumTerrainTile => ({
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

const restoreGeometry = (record: CachedProjectedTerrainGeometry) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(Float32Array.from(record.positions), 3)
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(Float32Array.from(record.normals), 3)
  );
  geometry.setIndex(
    new Uint32BufferAttribute(Uint32Array.from(record.indices), 1)
  );
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
};

const snapshotGeometry = (
  geometry: BufferGeometry
): CachedProjectedTerrainGeometry | null => {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const index = geometry.getIndex();
  if (!position || !normal || !index) return null;
  return {
    positions: Float32Array.from(position.array),
    normals: Float32Array.from(normal.array),
    indices: Uint32Array.from(index.array),
  };
};

export const createProjectedTerrainGeometryCache = (
  terrainUrl: string,
  originLngLat: readonly [longitude: number, latitude: number]
): ProjectedTerrainGeometryCache => {
  const namespace = hash(
    [
      terrainUrl.trim().replace(/\/+$/, ""),
      originLngLat[0],
      originLngLat[1],
      PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION,
    ].join("|")
  );
  const getKey = (id: CesiumTerrainTileId) =>
    `${namespace}:${cesiumTerrainTileKey(id)}`;

  return {
    async get(id) {
      if (!(await prepareStorage())) return null;
      const key = getKey(id);
      await pendingWrites.get(key);
      try {
        const cached = await storage.getItem<unknown>(key);
        if (
          isCachedEntry(cached) &&
          cached.tile.id.level === id.level &&
          cached.tile.id.x === id.x &&
          cached.tile.id.y === id.y
        ) {
          return {
            tile: cloneTile(cached.tile),
            geometry: restoreGeometry(cached.geometry),
          };
        }
      } catch {
        cacheAvailable = false;
      }
      return null;
    },

    set(tile, geometry) {
      if (!cacheAvailable) return;
      const snapshot = snapshotGeometry(geometry);
      if (!snapshot) return;
      const key = getKey(tile.id);
      const entry: CachedProjectedTerrainTile = {
        tile,
        geometry: snapshot,
      };
      const write = prepareStorage()
        .then((ready) => {
          if (!ready) return;
          return storage.setItem(key, entry).then(() => undefined);
        })
        .catch(() => undefined)
        .finally(() => pendingWrites.delete(key));
      pendingWrites.set(key, write);
    },
  };
};

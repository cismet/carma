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
} from "@carma-mapping/engines/cesium/terrain";

// Bump the revision whenever projection, winding, or generated attributes change.
export const PROJECTED_TERRAIN_GEOMETRY_CACHE_REVISION =
  "projected-quantized-mesh-v1";

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

type ProjectedTerrainGeometryCache = Readonly<{
  getOrCreate: (
    tile: CesiumTerrainTile,
    create: () => BufferGeometry
  ) => Promise<BufferGeometry>;
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

const hashArray = (array: ArrayBufferView) =>
  hash(new Uint8Array(array.buffer, array.byteOffset, array.byteLength));

const getTileContentHash = (tile: CesiumTerrainTile) =>
  hash(
    [
      hashArray(tile.u),
      hashArray(tile.v),
      hashArray(tile.heightMeters),
      hashArray(tile.indices),
      tile.bounds.west,
      tile.bounds.south,
      tile.bounds.east,
      tile.bounds.north,
    ].join("|")
  );

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

const restoreGeometry = (record: CachedProjectedTerrainGeometry) => {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    "position",
    new Float32BufferAttribute(record.positions, 3)
  );
  geometry.setAttribute(
    "normal",
    new Float32BufferAttribute(record.normals, 3)
  );
  geometry.setIndex(new Uint32BufferAttribute(record.indices, 1));
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

  return {
    async getOrCreate(tile, create) {
      if (!(await prepareStorage())) return create();
      const key = `${namespace}:${cesiumTerrainTileKey(
        tile.id
      )}:${getTileContentHash(tile)}`;
      await pendingWrites.get(key);
      try {
        const cached = await storage.getItem<unknown>(key);
        if (isCachedGeometry(cached)) return restoreGeometry(cached);
      } catch {
        cacheAvailable = false;
      }

      const geometry = create();
      if (!cacheAvailable) return geometry;
      const snapshot = snapshotGeometry(geometry);
      if (!snapshot) return geometry;
      const write = storage
        .setItem(key, snapshot)
        .then(() => undefined)
        .catch(() => undefined)
        .finally(() => pendingWrites.delete(key));
      pendingWrites.set(key, write);
      return geometry;
    },
  };
};

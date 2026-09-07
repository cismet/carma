import localforage from "localforage";
import type { TerrainTile } from "./raster-dem-tile";

export const projectedTerrainGeometryStorage = localforage.createInstance({
  name: "carma-terrain-geometry-cache",
  storeName: "projected_tiles",
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
      Number.isFinite(tile.byteLength)
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

const isCachedEntry = (value: unknown): value is CachedProjectedTerrainTile => {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<CachedProjectedTerrainTile>;
  return Boolean(
    isCachedTile(entry.tile) &&
      (entry.geometry === null || isCachedGeometry(entry.geometry)) &&
      entry.reliefVertexMask instanceof Uint8Array &&
      entry.reliefVertexMask.length === entry.tile!.u.length
  );
};

/** IndexedDB deserialization and full index validation run in the terrain worker. */
export const readProjectedTerrainCacheRecord = async (
  key: string
): Promise<CachedProjectedTerrainTile | null> => {
  const value = await projectedTerrainGeometryStorage.getItem<unknown>(key);
  return isCachedEntry(value) ? value : null;
};

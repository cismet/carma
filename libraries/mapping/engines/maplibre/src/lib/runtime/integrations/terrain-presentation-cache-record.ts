import { MercatorCoordinate } from "maplibre-gl";
import { projectTerrainTilePositions } from "@carma-mapping/engines/three/primitives/core";
import type { TerrainTile } from "../../core/raster-dem-tile";
import { createMercatorTerrainProjector } from "./mercator-terrain-projector";
import type { CachedProjectedTerrainGeometry } from "./projected-terrain-cache-record";
import type { TerrainEcefGeometryRecord } from "./terrain-ecef-geometry-cache.worker";

/** Native normals/topology remain necessary for seams; native positions are
 * reproducible from the authoritative raster samples and are never persisted.
 */
export type CachedTerrainPresentation = Readonly<{
  mode: "ecef";
  origin: readonly [number, number];
  geometry: TerrainEcefGeometryRecord;
  native: Omit<CachedProjectedTerrainGeometry, "positions">;
}>;

export const isCachedTerrainPresentation = (
  value: unknown,
  count: number
): value is CachedTerrainPresentation => {
  if (!value || typeof value !== "object") return false;
  const record = value as Partial<CachedTerrainPresentation>;
  const geometry = record.geometry;
  const native = record.native;
  const validExtent = (
    candidate: { bounds?: number[]; sphere?: number[] } | undefined
  ) =>
    Boolean(
      candidate &&
        Array.isArray(candidate.bounds) &&
        candidate.bounds.length === 6 &&
        candidate.bounds.every(Number.isFinite) &&
        candidate.bounds.every(
          (v, i) => i >= 3 || v <= candidate.bounds![i + 3]
        ) &&
        Array.isArray(candidate.sphere) &&
        candidate.sphere.length === 4 &&
        candidate.sphere.every(Number.isFinite) &&
        candidate.sphere[3] >= 0
    );
  return Boolean(
    record.mode === "ecef" &&
      Array.isArray(record.origin) &&
      record.origin.length === 2 &&
      record.origin.every(Number.isFinite) &&
      geometry?.positions instanceof Float32Array &&
      geometry.positions.length === count * 3 &&
      geometry.normals instanceof Float32Array &&
      geometry.normals.length === count * 3 &&
      (geometry.indices instanceof Uint16Array ||
        geometry.indices instanceof Uint32Array) &&
      geometry.indices.length > 0 &&
      geometry.indices.length % 3 === 0 &&
      geometry.indices.every((index) => index < count) &&
      validExtent(geometry) &&
      native?.normals instanceof Float32Array &&
      native.normals.length === count * 3 &&
      native.indices instanceof Uint32Array &&
      native.indices.length > 0 &&
      native.indices.length % 3 === 0 &&
      native.indices.every((index) => index < count) &&
      validExtent(native)
  );
};

/** The same projection kernel used by initial preparation. Supplied normals
 * avoid recomputing them; stored topology includes any no-data partition.
 */
export const rebuildCachedNativeGeometry = (
  tile: TerrainTile,
  record: CachedTerrainPresentation
): CachedProjectedTerrainGeometry => {
  const positions = projectTerrainTilePositions(
    tile,
    createMercatorTerrainProjector(
      MercatorCoordinate.fromLngLat([...record.origin], 0)
    )
  );
  return { positions, ...record.native };
};

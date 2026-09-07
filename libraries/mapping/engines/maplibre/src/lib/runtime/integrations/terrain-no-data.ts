import type { BufferGeometry } from "three";
import { computeMeshVertexNormals } from "@carma-mapping/engines/three/primitives/core";
import type { TerrainTile } from "./raster-dem-tile";

export const NO_DATA_EPSILON_METERS = 1e-3;

/** Decoder extrema cover every vertex; account for the stored Float32 heights. */
export const terrainHeightRangeExcludesNoData = (
  tile: Pick<TerrainTile, "minimumHeightMeters" | "maximumHeightMeters">,
  noDataHeightMeters: number
): boolean => {
  const minimum = Math.fround(tile.minimumHeightMeters);
  const maximum = Math.fround(tile.maximumHeightMeters);
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum > maximum
  )
    return false;
  return (
    (minimum > noDataHeightMeters &&
      Math.abs(minimum - noDataHeightMeters) > NO_DATA_EPSILON_METERS) ||
    (maximum < noDataHeightMeters &&
      Math.abs(maximum - noDataHeightMeters) > NO_DATA_EPSILON_METERS)
  );
};

/** Keep only complete relief faces; mixed faces would bridge missing coverage. */
export const partitionNoDataTerrainGeometry = (
  geometry: BufferGeometry,
  heights: Float32Array,
  noDataHeightMeters: number
) => {
  const missing = Uint8Array.from(heights, (height) =>
    Math.abs(height - noDataHeightMeters) <= NO_DATA_EPSILON_METERS ? 1 : 0
  );
  if (!missing.some(Boolean)) {
    return {
      geometry,
      reliefVertexMask: new Uint8Array(heights.length).fill(1),
    };
  }
  const sourceIndex = geometry.getIndex();
  if (!sourceIndex)
    throw new TypeError("Projected terrain geometry must be indexed");
  const indices: number[] = [];
  const reliefVertexMask = new Uint8Array(heights.length);
  for (let offset = 0; offset < sourceIndex.count; offset += 3) {
    const a = sourceIndex.getX(offset);
    const b = sourceIndex.getX(offset + 1);
    const c = sourceIndex.getX(offset + 2);
    if (missing[a] || missing[b] || missing[c]) continue;
    indices.push(a, b, c);
    reliefVertexMask[a] = reliefVertexMask[b] = reliefVertexMask[c] = 1;
  }
  if (!indices.length) {
    geometry.dispose();
    return { geometry: null, reliefVertexMask };
  }
  geometry.setIndex(indices);
  computeMeshVertexNormals(geometry);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return { geometry, reliefVertexMask };
};

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

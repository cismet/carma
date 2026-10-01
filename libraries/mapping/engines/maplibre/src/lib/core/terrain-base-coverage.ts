import type { RasterDemTerrainResource } from "@carma-commons/resources";
import { getRasterDemTileGridIdsForBounds } from "./raster-dem-tile-grid";
import {
  latitudeToTileY,
  longitudeToTileX,
  type TerrainTileId,
} from "./raster-dem-tile";

export type TerrainBaseStage = Readonly<{
  level: number;
  /** Input raster coverage, independent of mesh simplification/display error. */
  rasterEdgePixels: number;
  ids: readonly TerrainTileId[];
}>;

/** Build the pyramid from its root before 4k/8k. A stage always covers the
 * complete source extent; rounding to XYZ tiles can add a boundary tile.
 * Wrapped sources need split extents and fail closed in this optional planner.
 */
export const planTerrainBaseStages = (
  source: RasterDemTerrainResource,
  maximumRasterEdgePixels = 8192,
  maximumStageTiles = 1024
): TerrainBaseStage[] => {
  const [west, south, east, north] = source.bounds;
  if (
    ![west, south, east, north, maximumRasterEdgePixels, source.tileSize].every(
      Number.isFinite
    ) ||
    west >= east ||
    south >= north ||
    source.tileSize <= 0 ||
    maximumRasterEdgePixels <= 0
  )
    return [];
  const bounds = { west, south, east, north };
  const grid = {
    bounds,
    minzoom: source.minzoom,
    maxzoom: source.maxzoom,
    meshSegments: source.tileSize,
  };
  const edge = Math.max(
    longitudeToTileX(east, 0) - longitudeToTileX(west, 0),
    latitudeToTileY(south, 0) - latitudeToTileY(north, 0)
  );
  const maximumLevel = Math.min(
    source.maxzoom,
    Math.max(
      source.minzoom,
      Math.floor(Math.log2(maximumRasterEdgePixels / (source.tileSize * edge)))
    )
  );
  const stages: TerrainBaseStage[] = [];
  for (let level = source.minzoom; level <= maximumLevel; level++) {
    // Bound enumeration before allocation, including the two rim tiles.
    const estimate = (Math.ceil(edge * 2 ** level) + 2) ** 2;
    if (estimate > maximumStageTiles) break;
    const ids = getRasterDemTileGridIdsForBounds(grid, bounds, level);
    if (ids.length)
      stages.push({
        level,
        ids,
        rasterEdgePixels: edge * 2 ** level * source.tileSize,
      });
  }
  return stages;
};

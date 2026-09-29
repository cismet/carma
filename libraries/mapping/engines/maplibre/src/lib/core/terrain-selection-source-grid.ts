import { getTileBounds } from "./raster-dem-tile";
import {
  getRasterDemTileGeometricError,
  getRasterDemTileGridIdsForBounds,
  isRasterDemTileDataAvailable,
  type RasterDemTileGrid,
} from "./raster-dem-tile-grid";
import type { TerrainSelectionAdapter } from "./terrain-selection-types";

export const createTerrainSelectionSourceGrid = (
  source: RasterDemTileGrid
): TerrainSelectionAdapter => ({
  getTileGridIdsForBounds: (bounds, level) =>
    getRasterDemTileGridIdsForBounds(source, bounds, level),
  getTileBounds,
  getTileGeometricError: (level) =>
    getRasterDemTileGeometricError(source, level),
  getTileDataAvailable: (id) => isRasterDemTileDataAvailable(source, id),
});

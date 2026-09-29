import { getPixelResolutionFromZoomAtLatitudeRad } from "@carma-geo/proj";
import { intersectUnwrappedGeographicBounds } from "@carma-geo/helpers";
import { degToRad } from "@carma-units";
import type { Degrees } from "@carma-units";
import {
  boundsIntersect,
  getTileBounds,
  latitudeToTileY,
  longitudeToTileX,
  type TerrainTileBounds,
  type TerrainTileId,
} from "./raster-dem-tile";

export type RasterDemTileGrid = Readonly<{
  bounds: TerrainTileBounds;
  minzoom: number;
  maxzoom: number;
  meshSegments: number;
}>;

/**
 * Enumerate one unwrapped source extent in row-major order.
 * Bounds must share its longitude frame; no world-copy wrapping is performed.
 * Callers own level validation.
 */
export const getRasterDemTileGridIdsForBounds = (
  source: RasterDemTileGrid,
  bounds: TerrainTileBounds,
  level: number
): TerrainTileId[] => {
  if (level < source.minzoom || level > source.maxzoom) return [];
  const intersection = intersectUnwrappedGeographicBounds(
    bounds,
    source.bounds
  );
  if (!intersection) return [];
  const { west, south, east, north } = intersection;
  const scale = 2 ** level;
  const epsilon = 1e-10;
  const minimumX = Math.max(0, Math.floor(longitudeToTileX(west, level)));
  const maximumX = Math.min(
    scale - 1,
    Math.floor(longitudeToTileX(east - epsilon, level))
  );
  const minimumY = Math.max(
    0,
    Math.floor(latitudeToTileY(north - epsilon, level))
  );
  const maximumY = Math.min(
    scale - 1,
    Math.floor(latitudeToTileY(south + epsilon, level))
  );
  const ids: TerrainTileId[] = [];
  for (let y = minimumY; y <= maximumY; y += 1)
    for (let x = minimumX; x <= maximumX; x += 1) ids.push({ level, x, y });
  return ids;
};

export const getRasterDemTileGeometricError = (
  source: RasterDemTileGrid,
  level: number
) =>
  getPixelResolutionFromZoomAtLatitudeRad(
    level,
    degToRad(((source.bounds.south + source.bounds.north) / 2) as Degrees),
    { tileSize: source.meshSegments }
  );

export const isRasterDemTileDataAvailable = (
  source: RasterDemTileGrid,
  id: TerrainTileId
) =>
  id.level >= source.minzoom &&
  id.level <= source.maxzoom &&
  boundsIntersect(getTileBounds(id), [
    source.bounds.west,
    source.bounds.south,
    source.bounds.east,
    source.bounds.north,
  ]);

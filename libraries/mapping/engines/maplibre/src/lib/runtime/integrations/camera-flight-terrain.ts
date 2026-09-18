import type { RasterDemTerrainResource } from "@carma-commons/resources";
import { acquireRasterDemTerrainTileSource } from "./raster-dem-terrain-tile-source";
import { latitudeToTileY, longitudeToTileX } from "../../core/raster-dem-tile";

/** Bounded, cancellable preparation, never a raycast over the resident scene per frame. */
export const sampleCameraPathGroundHeights = async (
  resource: RasterDemTerrainResource,
  coordinates: readonly (readonly [number, number])[],
  signal: AbortSignal
) => {
  const source = await acquireRasterDemTerrainTileSource(resource, {
    maxCacheBytes: 16 * 1024 ** 2,
    meshSegments: 16,
  });
  try {
    const heights: number[] = [];
    for (const [longitude, latitude] of coordinates) {
      signal.throwIfAborted();
      const level = Math.max(resource.minzoom, Math.min(13, resource.maxzoom));
      const tile = {
        level,
        x: Math.floor(longitudeToTileX(longitude, level)),
        y: Math.floor(latitudeToTileY(latitude, level)),
      };
      if (!source.getTileDataAvailable(tile))
        throw new Error("Flight path lies outside the elevation source");
      await source.requestTile(tile, signal, 5);
      const height = source.sampleHeight(longitude, latitude);
      if (height === undefined || !Number.isFinite(height))
        throw new Error("Flight path has missing elevation data");
      heights.push(height);
    }
    return heights;
  } finally {
    source.release();
  }
};

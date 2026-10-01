import { Box3, Vector3 } from "three";
import {
  createLocalEcefFrame,
  createRasterEcefProjector,
  getGeodeticPatchBounds,
} from "@carma-geo/proj";
import type { TerrainTileBounds } from "./raster-dem-tile";

export const TERRAIN_GEOMETRY_PROJECTION = {
  ECEF: "ecef",
  MERCATOR: "mercator",
} as const;
export type TerrainGeometryProjection =
  (typeof TERRAIN_GEOMETRY_PROJECTION)[keyof typeof TERRAIN_GEOMETRY_PROJECTION];

/** Geographic metadata in the same local ECEF frame as the displayed surface. */
export const createTerrainGeodeticProjection = (
  origin: readonly [number, number]
) => {
  const frame = createLocalEcefFrame(...origin);
  const project = createRasterEcefProjector({ maximumCacheEntries: 2048 });
  const boundsCache = new Map<string, Box3>();
  const boundsFrame = frame.localFromEcef.clone();
  return {
    ...frame,
    project: (
      longitude: number,
      latitude: number,
      height: number,
      target: Vector3
    ) =>
      project(longitude, latitude, height, target).applyMatrix4(
        frame.localFromEcef
      ),
    bounds: (
      bounds: TerrainTileBounds,
      heights: readonly [number, number],
      target = new Box3()
    ) => {
      // Tile geography and heights stay fixed across camera/shadow queries.
      // Cache only this local envelope; the caller still applies its current
      // world transform. Copy results so consumers cannot change cached bounds.
      if (!boundsFrame.equals(frame.localFromEcef)) {
        boundsCache.clear();
        boundsFrame.copy(frame.localFromEcef);
      }
      const key = [
        bounds.west,
        bounds.south,
        bounds.east,
        bounds.north,
        ...heights,
      ].join(":");
      let box = boundsCache.get(key);
      if (!box) {
        box = getGeodeticPatchBounds(bounds, heights, frame.localFromEcef);
        if (boundsCache.size >= 512)
          boundsCache.delete(boundsCache.keys().next().value!);
      } else boundsCache.delete(key);
      boundsCache.set(key, box);
      return target.copy(box);
    },
  };
};

import {
  createLocalEcefFrame,
  createRasterEcefProjector,
  getGeodeticPatchBounds,
} from "@carma-geo/proj";
import { Box3, Vector3 } from "three";
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
  const project = createRasterEcefProjector();
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
      return target.copy(
        getGeodeticPatchBounds(bounds, heights, frame.localFromEcef)
      );
    },
  };
};

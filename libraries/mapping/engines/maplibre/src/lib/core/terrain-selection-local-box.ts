import {
  EARTH_CIRCUMFERENCE,
  getWebMercatorFromWgs84Deg,
  getWgs84DegFromWebMercator,
} from "@carma-geo/proj";
import { degToRadNumeric } from "@carma-units";
import type { Degrees, Meters } from "@carma-units";
import { Box3, Vector3 } from "three";
import type { TerrainTileBounds } from "./raster-dem-tile";

export const projectTerrainToLocalWorld = (
  longitude: number,
  latitude: number,
  height: number,
  origin: readonly [number, number, number],
  meterScale: number,
  target: Vector3
) => {
  const latitudeRadians = degToRadNumeric(latitude);
  const x = (longitude + 180) / 360;
  const [, northing] = getWebMercatorFromWgs84Deg(
    0 as Degrees,
    latitude as Degrees
  );
  const y = 0.5 - northing / EARTH_CIRCUMFERENCE;
  // Reuse the caller's Mercator scale, including its Earth-radius convention.
  const [, originLatitudeDegrees] = getWgs84DegFromWebMercator(
    0 as Meters,
    ((0.5 - origin[1]) * EARTH_CIRCUMFERENCE) as Meters
  );
  const originLatitude = degToRadNumeric(originLatitudeDegrees);
  const z =
    (height * meterScale * Math.cos(originLatitude)) /
    Math.cos(latitudeRadians);
  return target.set(
    (x - origin[0]) / meterScale,
    (z - origin[2]) / meterScale,
    (y - origin[1]) / meterScale
  );
};

/**
 * A 2.5D tile as a 3D box: its footprint over the elevation range it covers.
 * Selection culls with this box and the diagnostics draw the same one, so a
 * terrain tile is tested exactly like a 3D Tiles bounding volume.
 */
export const buildTerrainTileLocalBox = (
  bounds: TerrainTileBounds,
  heightRange: readonly [number, number],
  origin: readonly [number, number, number],
  meterScale: number,
  target: Box3 = new Box3()
): Box3 => {
  target.makeEmpty();
  const point = new Vector3();
  for (const longitude of [bounds.west, bounds.east])
    for (const latitude of [bounds.south, bounds.north])
      for (const height of heightRange)
        target.expandByPoint(
          projectTerrainToLocalWorld(
            longitude,
            latitude,
            height,
            origin,
            meterScale,
            point
          )
        );
  return target;
};

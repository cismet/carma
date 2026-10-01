import { Box3, Matrix4, Vector3 } from "three";
import { degToRadNumeric, radToDegNumeric } from "@carma-units";
import { createRasterEcefProjector } from "./raster-ecef-projector";

/** Exact bounds of a geodetic rectangle over an ellipsoidal height interval,
 * expressed in any affine ECEF frame. Raster tiles do not wrap longitude;
 * split an antimeridian-crossing region into two rectangles before calling.
 */
export const getGeodeticPatchBounds = (
  bounds: Readonly<{
    west: number;
    south: number;
    east: number;
    north: number;
  }>,
  heights: readonly [number, number],
  localFromEcef = new Matrix4()
): Box3 => {
  if (
    ![bounds.west, bounds.south, bounds.east, bounds.north, ...heights].every(
      Number.isFinite
    ) ||
    bounds.west > bounds.east ||
    bounds.south > bounds.north ||
    bounds.west < -180 ||
    bounds.east > 180 ||
    bounds.south < -90 ||
    bounds.north > 90 ||
    heights[0] > heights[1] ||
    heights[0] <= -6_000_000
  )
    throw new RangeError(
      "Geodetic patch needs non-wrapping bounds and an ordered height interval"
    );
  const result = new Box3();
  const project = createRasterEcefProjector();
  const point = new Vector3();
  const matrix = localFromEcef.elements;
  // For each output axis, extrema occur at an edge or where a meridian /
  // parallel tangent is perpendicular to that axis. The positive M+h and N+h
  // factors cancel from the derivative, so these angles are height-independent.
  for (let axis = 0; axis < 3; axis++) {
    const a = matrix[axis],
      b = matrix[axis + 4],
      c = matrix[axis + 8];
    const longitudes = [bounds.west, bounds.east];
    const stationaryLongitude = radToDegNumeric(Math.atan2(b, a));
    for (const shift of [-180, 0, 180]) {
      const longitude = stationaryLongitude + shift;
      if (longitude >= bounds.west && longitude <= bounds.east)
        longitudes.push(longitude);
    }
    for (const longitude of longitudes) {
      const angle = degToRadNumeric(longitude);
      const stationaryLatitude = radToDegNumeric(
        Math.atan2(c, a * Math.cos(angle) + b * Math.sin(angle))
      );
      const latitudes = [bounds.south, bounds.north];
      for (const shift of [-180, 0, 180]) {
        const latitude = stationaryLatitude + shift;
        if (latitude >= bounds.south && latitude <= bounds.north)
          latitudes.push(latitude);
      }
      for (const latitude of latitudes)
        for (const height of heights)
          result.expandByPoint(
            project(longitude, latitude, height, point).applyMatrix4(
              localFromEcef
            )
          );
    }
  }
  return result;
};

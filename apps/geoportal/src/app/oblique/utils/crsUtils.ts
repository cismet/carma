import proj4 from "proj4";
import { ExteriorPosition, Proj4Converter } from "../types";

/**
 * Calculates the convergence angle (meridian convergence) between a projected CRS and WGS84
 * This is the angle between grid north in the projected CRS and true north in WGS84
 *
 * @param position Position in the source CRS
 * @param converter Existing proj4 converter from source CRS to WGS84
 * @returns Convergence angle in radians
 */
export function calculateConvergenceAngle(
  position: ExteriorPosition,
  converter: Proj4Converter
): number {
  const { x, y } = position;

  // Convert the point to WGS84
  const [lon, lat] = converter.converter.forward([x, y]);

  // Calculate two points slightly north of the original point in the source CRS
  // We'll use these to determine the grid north direction
  const northOffsetMeters = 1000; // 1 km north
  const northPoint = {
    x,
    y: y + northOffsetMeters,
    z: position.z,
  };

  // Convert the north point to WGS84
  const [northLon, northLat] = converter.converter.forward([
    northPoint.x,
    northPoint.y,
  ]);

  // Calculate the azimuth from the original point to the north point in WGS84
  // This gives us the direction of grid north in terms of true north
  const dLon = ((northLon - lon) * Math.PI) / 180;
  const y1 = Math.sin(dLon) * Math.cos((northLat * Math.PI) / 180);
  const x1 =
    Math.cos((lat * Math.PI) / 180) * Math.sin((northLat * Math.PI) / 180) -
    Math.sin((lat * Math.PI) / 180) *
      Math.cos((northLat * Math.PI) / 180) *
      Math.cos(dLon);
  const gridNorthAzimuth = Math.atan2(y1, x1);

  // The convergence angle is the difference between grid north and true north
  // True north has an azimuth of 0, so the convergence is simply the grid north azimuth
  return gridNorthAzimuth;
}

/**
 * Adjusts a heading value from a source CRS to WGS84 by applying the convergence angle
 *
 * @param heading Heading in the source CRS (radians)
 * @param position Position in the source CRS
 * @param converter Existing proj4 converter from source CRS to WGS84
 * @returns Heading adjusted to WGS84 (radians)
 */
export function adjustHeadingToWGS84(
  heading: number,
  position: ExteriorPosition,
  converter: Proj4Converter
): number {
  // Calculate the convergence angle
  const convergenceAngle = calculateConvergenceAngle(position, converter);

  // Apply the convergence angle to adjust the heading
  let adjustedHeading = heading - convergenceAngle;

  // Normalize to 0-2π range
  adjustedHeading =
    ((adjustedHeading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return adjustedHeading;
}

export function createConverter(
  sourceCrs: string,
  targetCrs = "EPSG:4326"
): Proj4Converter {
  const converter = proj4(sourceCrs, targetCrs);
  return {
    converter,
    sourceCrs,
    targetCrs,
  };
}

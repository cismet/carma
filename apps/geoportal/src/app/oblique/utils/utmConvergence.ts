/**
 * Zero Dependency Utility function to calculate meridian convergence angle.
 * Meridian convergence is the angle between grid north and true north.
 * Not tested for southern hemisphere or other regions than Germany.
 * There is no need to correction expansions for ellipsoidal effects for this use case
 *
 * This implementation uses the WGS84 ellipsoid.
 */

const CENTRAL_MERIDIAN_DEG = 3;

const TO_RADIANS_FACTOR = Math.PI / 180;

const toRadians = (degrees: number): number => degrees * TO_RADIANS_FACTOR;

/**
 * Calculate meridian convergence angle directly from latitude and longitude
 *
 * @param longitude Longitude in degrees
 * @param latitude Latitude in degrees
 * @returns Convergence angle in radians
 */

export function calculateUTMConvergence(
  longitude: number,
  latitude: number
): number {
  // Convert degrees to radians
  const latRad = toRadians(latitude);
  const lonRad = toRadians(longitude);
  const cmRad = toRadians(CENTRAL_MERIDIAN_DEG);

  // Zone is not needed for this calculation, since it's the same for every strip in relation to the strip's Meridian
  const lonLocalStripRad = (lonRad + Math.PI) % (cmRad * 2);

  const deltaLong = cmRad - lonLocalStripRad;

  const firstOrder = deltaLong * Math.sin(latRad);

  // add higher order ellipsoidal correction terms here when needed;
  // for a visual alignment use case, the first order term is sufficient
  // since the error of the RKT/GPS system is usually higher than the error of the first order terms

  const convergence = -firstOrder;

  return convergence;
}

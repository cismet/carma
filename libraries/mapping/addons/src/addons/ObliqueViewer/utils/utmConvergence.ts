/**
 * Meridian convergence: the angle between grid north and true north at a
 * point. First order term only, which is well inside the GPS/IMU noise for
 * lining up an image; not tested outside Germany or the northern hemisphere.
 */

const CENTRAL_MERIDIAN_DEG = 3;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * @param longitude degrees
 * @param latitude degrees
 * @returns convergence angle in radians
 */
export const calculateUTMConvergence = (
  longitude: number,
  latitude: number
): number => {
  const latRad = toRadians(latitude);
  const lonRad = toRadians(longitude);
  const cmRad = toRadians(CENTRAL_MERIDIAN_DEG);

  // the zone does not matter: every strip is measured against its own meridian
  const lonLocalStripRad = (lonRad + Math.PI) % (cmRad * 2);
  const deltaLong = cmRad - lonLocalStripRad;
  const firstOrder = deltaLong * Math.sin(latRad);

  return -firstOrder;
};

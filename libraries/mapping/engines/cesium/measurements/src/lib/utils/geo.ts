import { Cartesian3, Ellipsoid, Matrix4, Transforms } from "@carma/cesium";

export const getEuclideanDistance = (
  point1: Cartesian3,
  point2: Cartesian3
): number => {
  return Cartesian3.distance(point1, point2);
};

export const getENU = (
  pointECEF: Cartesian3,
  referenceECEF: Cartesian3
): { east: number; north: number; up: number } => {
  // Create ENU transformation matrix at reference point
  const enuTransform = Transforms.eastNorthUpToFixedFrame(
    referenceECEF,
    Ellipsoid.WGS84
  );

  // Get inverse transformation (ECEF to ENU)
  const enuTransformInverse = Matrix4.inverse(enuTransform, new Matrix4());

  // Transform point to ENU coordinate system
  const pointENU = Matrix4.multiplyByPoint(
    enuTransformInverse,
    pointECEF,
    new Cartesian3()
  );

  return {
    east: pointENU.x,
    north: pointENU.y,
    up: pointENU.z,
  };
};

export const getBearing = (east: number, north: number): number => {
  // Bearing calculation
  // bearing is angle from North (positive Y in ENU)
  // atan2(x, y) returns angle from Y axis (North) in range -PI to PI
  // We want 0-360 degrees
  let bearing = Math.atan2(east, north);
  if (bearing < 0) {
    bearing += 2 * Math.PI;
  }
  return bearing;
};

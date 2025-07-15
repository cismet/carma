import {
  Cartesian3,
  Ellipsoid,
  Math as CesiumMath,
  Matrix4,
  Transforms,
} from "cesium";

export const toGeographicDegrees = (
  p: Cartesian3,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
) => {
  const { latitude, longitude, height } = ellipsoid.cartesianToCartographic(p);
  return {
    longitude: CesiumMath.toDegrees(longitude),
    latitude: CesiumMath.toDegrees(latitude),
    height,
  };
};

export const getRelativeENUDistance = (
  pointECEF: Cartesian3,
  referenceECEF: Cartesian3
): {
  east: number;
  north: number;
  up: number;
  distance: number;
  bearing: number | null;
} => {
  // Create ENU transformation matrix at reference point
  const enuTransform = Transforms.eastNorthUpToFixedFrame(
    referenceECEF,
    Ellipsoid.WGS84
  );

  const distance = Cartesian3.distance(pointECEF, referenceECEF);

  if (distance === 0) {
    return { east: 0, north: 0, up: 0, distance: 0, bearing: null };
  }

  // Get inverse transformation (ECEF to ENU)
  const enuTransformInverse = Matrix4.inverse(enuTransform, new Matrix4());

  // Transform both points to ENU coordinate system
  const pointENU = Matrix4.multiplyByPoint(
    enuTransformInverse,
    pointECEF,
    new Cartesian3()
  );

  const referenceENU = Matrix4.multiplyByPoint(
    enuTransformInverse,
    referenceECEF,
    new Cartesian3()
  );

  const east = pointENU.x - referenceENU.x;
  const north = pointENU.y - referenceENU.y;
  const up = pointENU.z - referenceENU.z;

  // true bearing of point vs refpoint
  const bearing = Math.atan2(north, east);

  // Calculate relative distance in ENU
  return {
    distance,
    bearing,
    east,
    north,
    up,
  };
};

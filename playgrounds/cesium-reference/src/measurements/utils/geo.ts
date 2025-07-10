import { Cartesian3, Ellipsoid, Math } from "cesium";

export const toGeographicDegrees = (
  p: Cartesian3,
  ellipsoid: Ellipsoid = Ellipsoid.WGS84
) => {
  const { latitude, longitude, height } = ellipsoid.cartesianToCartographic(p);
  return {
    longitude: Math.toDegrees(longitude),
    latitude: Math.toDegrees(latitude),
    height,
  };
};

import { logOnce } from "@carma-commons/utils";
import { Cartographic, type Cartesian3 } from "@carma-cesium";
import { LatLngAlt, Altitude } from "@carma-geo/data-structures";
import { radToDeg } from "@carma-units";
import { Radians } from "@carma-units";
logOnce(
  "Deprecated: Use @carma-cesium for conversion with pure cesium scope or conversion to generic geo types"
);

export const getDegreesFromCartographic = (
  cartographic: Cartographic
): LatLngAlt.deg => {
  return {
    longitude: radToDeg(cartographic.longitude as Radians),
    latitude: radToDeg(cartographic.latitude as Radians),
    altitude: cartographic.height as Altitude.EllipsoidalWGS84Meters,
  };
};

export const getDegreesFromCartesian = (
  cartesian: Cartesian3
): LatLngAlt.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

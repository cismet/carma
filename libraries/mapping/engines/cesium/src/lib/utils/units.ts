import { LatLng, Meters, Radians } from "@carma/types";
import { radToDeg } from "@carma-commons/math";
import { Cartographic, type Cartesian3 } from "cesium";

export const getDegreesFromCartographic = (
  cartographic: Cartographic
): LatLng.deg => {
  return {
    longitude: radToDeg(cartographic.longitude as Radians),
    latitude: radToDeg(cartographic.latitude as Radians),
    altitude: cartographic.height as Meters,
  };
};

export const getDegreesFromCartesian = (cartesian: Cartesian3): LatLng.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

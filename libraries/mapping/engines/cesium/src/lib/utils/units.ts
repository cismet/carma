import { LatLng } from "@carma-commons/types";
import { Math as CesiumMath, Cartographic, type Cartesian3 } from "cesium";

export const getDegreesFromCartographic = (
  cartographic: Cartographic
): LatLng.deg => {
  return {
    longitude: CesiumMath.toDegrees(cartographic.longitude),
    latitude: CesiumMath.toDegrees(cartographic.latitude),
    altitude: cartographic.height,
  };
};

export const getDegreesFromCartesian = (cartesian: Cartesian3): LatLng.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

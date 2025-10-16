import {
  LatLng,
  LatLngAlt,
  Latitude,
  Longitude,
  Altitude,
} from "@carma/geo/types";
import { Radians } from "@carma/units/types";
import { radToDeg } from "@carma/units/helpers";
import { Cartographic, type Cartesian3 } from "cesium";

export const getDegreesFromCartographic = (
  cartographic: Cartographic
): LatLngAlt.deg => {
  return {
    longitude: radToDeg(cartographic.longitude as Radians) as Longitude.deg,
    latitude: radToDeg(cartographic.latitude as Radians) as Latitude.deg,
    altitude: cartographic.height as Altitude.EllipsoidalWGS84Meters,
  } as LatLngAlt.deg;
};

export const getDegreesFromCartesian = (
  cartesian: Cartesian3
): LatLngAlt.deg => {
  const cartographic = Cartographic.fromCartesian(cartesian);
  return getDegreesFromCartographic(cartographic);
};

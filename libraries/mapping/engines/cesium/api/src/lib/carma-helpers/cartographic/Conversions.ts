import { Altitude, LatLngAlt, Latitude, Longitude } from "@carma/geo/types";
import { radToDeg } from "@carma/units/helpers";
import { Radians } from "@carma/units/types";

import { Cartographic } from "../../cesium";
const ZERO_ELLIPSOIDAL_ALTITUDE = 0 as Altitude.EllipsoidalWGS84Meters;

export const getEllipsoidalAltitudeOrZero = (
  altitude: Altitude.EllipsoidalWGS84Meters | null | undefined
): Altitude.EllipsoidalWGS84Meters => altitude ?? ZERO_ELLIPSOIDAL_ALTITUDE;

/**
 * Convert Cesium Cartographic (radians) to degrees LatLngAlt.
 */
export const getDegreesFromCartographic = (
  cartographic: Cartographic
): LatLngAlt.deg => {
  return {
    longitude: radToDeg(cartographic.longitude as Radians) as Longitude.deg,
    latitude: radToDeg(cartographic.latitude as Radians) as Latitude.deg,
    altitude: cartographic.height as Altitude.EllipsoidalWGS84Meters,
  };
};

import { Altitude, LatLngAlt, Latitude, Longitude } from "@carma/geo/types";
import { Radians } from "@carma/units/types";
import { radToDeg } from "@carma/units/helpers";

// Re-export Cartographic class from Cesium
import { Cartographic } from "cesium";
export { Cartographic };

/**
 * Convert Cesium Cartographic (radians) to degrees LatLngAlt
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

type EllipsoidalWGS84Meters = Altitude.EllipsoidalWGS84Meters;

// Strict Geo Unit Typed Helpers

// note height not altitude ve LatLngAlt
export interface CartographicUnitTyped {
  latitude: Latitude.rad;
  longitude: Longitude.rad;
  height: Altitude.EllipsoidalWGS84Meters;
}

export const cartographicToUnitTyped = (
  cartographic: Cartographic
): CartographicUnitTyped => {
  return {
    latitude: cartographic.latitude as Latitude.rad,
    longitude: cartographic.longitude as Longitude.rad,
    height: cartographic.height as EllipsoidalWGS84Meters,
  };
};

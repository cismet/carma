import { Altitude, Latitude, Longitude } from "@carma/geo/types";
import type { Radians } from "@carma/units/types";

// Re-export Cartographic class from Cesium
import { Cartographic } from "cesium";
export { Cartographic };

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

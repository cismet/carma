import { Altitude, LatLngAlt, Latitude, Longitude } from "@carma/geo/types";
import { Radians } from "@carma/units/types";
import { radToDeg } from "@carma/units/helpers";

// Re-export Cartographic class from Cesium
import { Cartographic } from "cesium";
export { Cartographic };

export type CartographicJson = Pick<
  Cartographic,
  "latitude" | "longitude" | "height"
>;

export type CartographicJsonTyped = {
  latitude: Radians;
  longitude: Radians;
  height: Altitude.EllipsoidalWGS84Meters;
};

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

export function cartographicToJson(
  cartographic: Cartographic,
  typed?: true
): CartographicJsonTyped;
export function cartographicToJson(
  cartographic: Cartographic,
  typed: false
): CartographicJson;
export function cartographicToJson(
  cartographic: Cartographic,
  typed: boolean | undefined = true
): CartographicJson | CartographicJsonTyped {
  return typed
    ? {
        latitude: cartographic.latitude as Radians,
        longitude: cartographic.longitude as Radians,
        height: cartographic.height as Altitude.EllipsoidalWGS84Meters,
      }
    : {
        latitude: cartographic.latitude,
        longitude: cartographic.longitude,
        height: cartographic.height,
      };
}

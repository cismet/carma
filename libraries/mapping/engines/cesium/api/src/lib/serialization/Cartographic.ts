import { Altitude } from "@carma/geo/types";
import { Radians } from "@carma/units/types";
import { Cartographic } from "../cesium";

export type CartographicJson = Pick<
  Cartographic,
  "latitude" | "longitude" | "height"
>;

export type CartographicJsonTyped = {
  latitude: Radians;
  longitude: Radians;
  height: Altitude.EllipsoidalWGS84Meters;
};

export const isCartographicJson = (
  value: CartographicJson | CartographicJsonTyped | undefined | null
): value is CartographicJson | CartographicJsonTyped =>
  !!value &&
  typeof value.latitude === "number" &&
  Number.isFinite(value.latitude) &&
  typeof value.longitude === "number" &&
  Number.isFinite(value.longitude) &&
  typeof value.height === "number" &&
  Number.isFinite(value.height);

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

export const cartographicFromJson = (
  value: CartographicJson | CartographicJsonTyped
): Cartographic => new Cartographic(value.longitude, value.latitude, value.height);

import type { LatLngAlt } from "@carma/geo/types";
import { isFiniteNumber } from "@carma/math";

import { Cartesian3, Cartographic } from "../cesium";
import type { Cartesian3 as CesiumCartesian3 } from "../cesium";
export type CartographicRadJson = {
  longitude: number;
  latitude: number;
  altitude?: number;
};

export const isCartographicRadJson = (
  value: CartographicRadJson | undefined | null
): value is CartographicRadJson =>
  !!value &&
  isFiniteNumber(value.longitude) &&
  isFiniteNumber(value.latitude) &&
  (value.altitude === undefined || isFiniteNumber(value.altitude));

export const cartographicRadToJson = (
  value: LatLngAlt.rad
): CartographicRadJson => ({
  longitude: value.longitude,
  latitude: value.latitude,
  ...(isFiniteNumber(value.altitude) ? { altitude: value.altitude } : {}),
});

export const cartographicRadFromJson = (
  value: CartographicRadJson
): LatLngAlt.rad => ({
  longitude: value.longitude as LatLngAlt.rad["longitude"],
  latitude: value.latitude as LatLngAlt.rad["latitude"],
  ...(isFiniteNumber(value.altitude)
    ? { altitude: value.altitude as NonNullable<LatLngAlt.rad["altitude"]> }
    : {}),
});

export const cartographicRadFromCartesian3 = (
  value: CesiumCartesian3,
  scratch?: Cartographic
): LatLngAlt.rad => {
  const cartographic = Cartographic.fromCartesian(value, undefined, scratch);
  return {
    longitude: cartographic.longitude as LatLngAlt.rad["longitude"],
    latitude: cartographic.latitude as LatLngAlt.rad["latitude"],
    altitude: cartographic.height as NonNullable<LatLngAlt.rad["altitude"]>,
  };
};

export const cartesian3FromCartographicRad = (
  value: LatLngAlt.rad,
  scratch?: Cartesian3
): Cartesian3 =>
  Cartesian3.fromRadians(
    value.longitude,
    value.latitude,
    isFiniteNumber(value.altitude) ? value.altitude : 0,
    undefined,
    scratch
  );

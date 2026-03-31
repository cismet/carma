import type {
  Altitude,
  Latitude,
  Longitude,
  LatLngAlt,
} from "@carma/geo/types";
import { radToDeg } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";

import type { Camera } from "../../cesium";
import { cartographicToJson } from "../../serialization";
export const cameraPositionCartographicRadians = (
  camera: Camera
): LatLngAlt.rad => {
  const pos = camera.positionCartographic.clone();
  const { latitude, longitude, height } = cartographicToJson(pos);
  return {
    latitude,
    longitude,
    altitude: height,
  };
};

export const cameraPositionCartographicDegrees = (
  camera: Camera
): LatLngAlt.deg => {
  const { latitude, longitude, height } = camera.positionCartographic.clone();
  return {
    latitude: radToDeg(latitude as Radians) as Latitude.deg,
    longitude: radToDeg(longitude as Radians) as Longitude.deg,
    altitude: height as Altitude.EllipsoidalWGS84Meters,
  };
};

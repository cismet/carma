import type {
  Altitude,
  Latitude,
  Longitude,
  LatLngAlt,
} from "@carma-geo/data-structures";
import { radToDeg } from "@carma-units";
import type { Radians } from "@carma-units";

import type { Camera } from "@carma-cesium";
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

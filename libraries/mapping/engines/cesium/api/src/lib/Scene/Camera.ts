import { Altitude, Latitude, Longitude, LatLngAlt } from "@carma/geo/types";

// Re-export Camera class from Cesium
import { Camera } from "cesium";
export { Camera };

import { radToDeg } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { cartographicToUnitTyped } from "../Core/Cartographic";

export const isValidCamera = (camera: unknown): camera is Camera =>
  camera instanceof Camera;

/**
 * Validates a Camera and executes a callback if valid
 */
export const tryWithValidCamera = (
  camera: unknown,
  cb: (camera: Camera) => void,
  label: string = "camera"
) => {
  if (!isValidCamera(camera)) {
    console.error(`tryWithValidCamera had invalid Camera ${label}`);
    return;
  }
  try {
    cb(camera);
  } catch (e) {
    console.error(`tryWithValidCamera failed on ${label}`, e);
  }
};

export const cameraPositionCartographicRadians = (
  camera: Camera
): LatLngAlt.rad => {
  const pos = camera.positionCartographic.clone();
  const { latitude, longitude, height } = cartographicToUnitTyped(pos);
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

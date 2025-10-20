import type {
  Altitude,
  Latitude,
  Longitude,
  LatLngAlt,
} from "@carma/geo/types";
import { radToDeg } from "@carma/units/helpers";
import type { Radians } from "@carma/units/types";
import { cartographicToUnitTyped } from "../Core/Cartographic";

// Re-export Camera class from Cesium
import { Camera, Cartesian3, BoundingSphere, HeadingPitchRange } from "cesium";
export { Camera };

// Reusable scratch objects for flyToTarget
const scratchBoundingSphere = new BoundingSphere();
const scratchHeadingPitchRange = new HeadingPitchRange();

/**
 * Fly camera to target position with HeadingPitchRange orientation.
 * Wrapper around flyToBoundingSphere that creates the sphere on the fly.
 *
 * @param camera - The Cesium camera
 * @param target - Point to look at (world coordinates)
 * @param hpr - Camera orientation relative to target (heading, pitch, range)
 * @param duration - Optional flight duration in seconds
 */
export const flyToTarget = (
  camera: Camera,
  target: Cartesian3,
  hpr: { heading: number; pitch: number; range: number },
  duration?: number
): void => {
  scratchBoundingSphere.center = target;
  scratchBoundingSphere.radius = 0;

  scratchHeadingPitchRange.heading = hpr.heading;
  scratchHeadingPitchRange.pitch = hpr.pitch;
  scratchHeadingPitchRange.range = hpr.range;

  const options: {
    offset: HeadingPitchRange;
    duration?: number;
  } = {
    offset: scratchHeadingPitchRange,
  };
  if (duration !== undefined) {
    options.duration = duration;
  }
  camera.flyToBoundingSphere(scratchBoundingSphere, options);
};

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

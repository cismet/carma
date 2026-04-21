import {
  CESIUM_LOCAL_NORTH_HEADING_RAD,
  CESIUM_NADIR_PITCH_RAD,
  CESIUM_UP_ROLL_RAD,
} from "@carma-commons/camera/model";
import type { Altitude } from "@carma-geo/data-structures";

import type { CameraStateHeadingPitchRoll } from "./Types";
/**
 * Validate camera state in HeadingPitchRoll format.
 */
export function validateCameraStateHeadingPitchRoll(
  state: unknown
): [boolean, CameraStateHeadingPitchRoll | null] {
  if (!state || typeof state !== "object") {
    return [false, null];
  }

  const obj = state as CameraStateHeadingPitchRoll;

  const latitude = obj.latitude;
  const longitude = obj.longitude;
  const altitude = obj.altitude;

  const hasPosition =
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Number.isFinite(altitude);

  if (!hasPosition) {
    console.debug("Invalid camera state: missing or invalid position");
    return [false, null];
  }

  const result: CameraStateHeadingPitchRoll = {
    latitude: latitude,
    longitude: longitude,
    altitude: altitude as Altitude.EllipsoidalWGS84Meters,
    heading: CESIUM_LOCAL_NORTH_HEADING_RAD,
    pitch: CESIUM_NADIR_PITCH_RAD,
    roll: CESIUM_UP_ROLL_RAD,
  };

  const hasOrientation =
    Number.isFinite(obj.heading) &&
    Number.isFinite(obj.pitch) &&
    obj.roll !== undefined &&
    Number.isFinite(obj.roll);

  if (!hasOrientation) {
    console.warn("Invalid camera state: missing or invalid orientation");
    return [false, result];
  }

  result.heading = obj.heading;
  result.pitch = obj.pitch;
  if (obj.roll !== undefined) {
    result.roll = obj.roll;
  }

  if (obj.fov !== undefined && Number.isFinite(obj.fov)) {
    result.fov = obj.fov;
  }

  return [true, result];
}

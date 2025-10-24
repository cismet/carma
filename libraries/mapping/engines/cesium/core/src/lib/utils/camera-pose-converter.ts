/**
 * Camera pose format conversions
 * Converts between CARMA/Portal format (degrees + altitude) and Cesium internal format (radians + height)
 *
 * @see {@link CameraPoseRadians} - Cesium internal format (cesium/api/src/lib/Scene/Camera.d.ts)
 * @see {@link degToRad} - Degree to radian conversion (commons/math)
 * @see CAMERA-POSE-FORMATS.md - Format guide and best practices
 */

import type { CameraPoseRadians } from "@carma/cesium";
import type { Degrees, Meters } from "@carma/units/types";
import { degToRad } from "@carma/units/helpers";

/**
 * CARMA/Portal camera pose format (user-facing)
 * - Uses degrees (intuitive for users)
 * - Uses 'altitude' field (differentiator from Cesium format)
 * - Used in PortalConfig and user-facing APIs
 */
export interface CameraPosePortal {
  latitude: number; // degrees
  longitude: number; // degrees
  altitude: number; // meters above sea level (WGS84 ellipsoid)
  heading?: number; // degrees (0 = north, 90 = east)
  pitch?: number; // degrees (-90 = looking down, 0 = horizon)
  roll?: number; // degrees
}

/**
 * Note: CameraPoseRadians is imported from @carma/cesium
 * - Uses radians (Cesium internal format)
 * - Uses 'height' field (differentiator from Portal format)
 * - Used internally by Cesium engine
 */

/**
 * Convert CARMA/Portal camera pose (degrees + altitude) to Cesium internal format (radians + height)
 *
 * Key transformations:
 * - latitude/longitude: degrees → radians
 * - altitude → height (field rename, same value)
 * - heading/pitch/roll: degrees → radians
 *
 * @param pose - Camera pose in Portal format (degrees + altitude)
 * @returns Camera pose in Cesium internal format (radians + height)
 *
 * @example
 * ```typescript
 * // Portal format (user-friendly)
 * const portalPose: CameraPosePortal = {
 *   latitude: 51.27,
 *   longitude: 7.20,
 *   altitude: 10000,  // ← 'altitude' field
 *   heading: 0,
 *   pitch: -90,
 *   roll: 0,
 * };
 *
 * // Convert to Cesium format
 * const cesiumPose = convertPortalPoseToCesiumPose(portalPose);
 * // {
 * //   latitude: 0.894...,
 * //   longitude: 0.125...,
 * //   height: 10000,    // ← 'height' field (renamed from altitude)
 * //   heading: 0,
 * //   pitch: -1.570...,
 * //   roll: 0,
 * // }
 * ```
 */
export function convertPortalPoseToCesiumPose(
  pose: CameraPosePortal
): CameraPoseRadians {
  return {
    latitude: degToRad(pose.latitude as Degrees),
    longitude: degToRad(pose.longitude as Degrees),
    height: pose.altitude as Meters, // altitude → height (field rename, same value)
    heading:
      pose.heading !== undefined
        ? degToRad(pose.heading as Degrees)
        : undefined,
    pitch:
      pose.pitch !== undefined ? degToRad(pose.pitch as Degrees) : undefined,
    roll: pose.roll !== undefined ? degToRad(pose.roll as Degrees) : undefined,
  };
}

/**
 * Validate camera pose in Portal format (degrees + altitude)
 * Throws error if invalid
 */
export function validateCameraPosePortal(
  pose: CameraPosePortal,
  fieldName: string = "cameraPose"
): void {
  const errors: string[] = [];

  // Validate latitude (-90 to 90)
  if (typeof pose.latitude !== "number" || isNaN(pose.latitude)) {
    errors.push(`${fieldName}.latitude must be a number`);
  } else if (pose.latitude < -90 || pose.latitude > 90) {
    errors.push(`${fieldName}.latitude must be between -90 and 90 degrees`);
  }

  // Validate longitude (-180 to 180)
  if (typeof pose.longitude !== "number" || isNaN(pose.longitude)) {
    errors.push(`${fieldName}.longitude must be a number`);
  } else if (pose.longitude < -180 || pose.longitude > 180) {
    errors.push(`${fieldName}.longitude must be between -180 and 180 degrees`);
  }

  // Validate altitude
  if (typeof pose.altitude !== "number" || isNaN(pose.altitude)) {
    errors.push(`${fieldName}.altitude must be a number`);
  } else if (pose.altitude < 0) {
    errors.push(`${fieldName}.altitude must be >= 0 meters`);
  }

  // Validate optional heading
  if (pose.heading !== undefined) {
    if (typeof pose.heading !== "number" || isNaN(pose.heading)) {
      errors.push(`${fieldName}.heading must be a number`);
    }
  }

  // Validate optional pitch
  if (pose.pitch !== undefined) {
    if (typeof pose.pitch !== "number" || isNaN(pose.pitch)) {
      errors.push(`${fieldName}.pitch must be a number`);
    } else if (pose.pitch < -90 || pose.pitch > 90) {
      errors.push(`${fieldName}.pitch must be between -90 and 90 degrees`);
    }
  }

  // Validate optional roll
  if (pose.roll !== undefined) {
    if (typeof pose.roll !== "number" || isNaN(pose.roll)) {
      errors.push(`${fieldName}.roll must be a number`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`[Camera Pose Validation Failed]\n${errors.join("\n")}`);
  }
}

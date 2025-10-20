/**
 * Cesium Camera State Adapter
 *
 * Converts between URL hash parameters and Cesium camera state.
 * Moved from @carma-mapping/engines/cesium/utils/cesiumHashParamsCodec
 */

import { Camera, CesiumMath, PerspectiveFrustum } from "@carma/cesium";
import type { Degrees, Radians } from "@carma/units/types";
import { radToDeg } from "@carma/units/helpers";

/**
 * Camera state for portal app - all angles in degrees (plain numbers)
 * This is the external API for the portal app state
 */
export type CameraStateDegrees = {
  longitude: number; // degrees
  latitude: number; // degrees
  height: number; // meters
  heading?: number; // degrees
  pitch?: number; // degrees
  fov?: number; // degrees
};

export type StringifiedCameraState = Array<{ key: string; value: string }>;

// Constants for URL parameter formatting
const DEGREE_DIGITS = 7;
const CAMERA_DEGREE_DIGITS = 2;

type HashCodec = {
  key: string;
  decode: (value: string) => number;
  encode: (value: number) => string;
};

/**
 * Format a radian value to degrees with specified precision
 */
const formatRadians = (value: number, fixed = DEGREE_DIGITS): string =>
  parseFloat(CesiumMath.toDegrees(value).toFixed(fixed)).toString(); // parse float removes trailing zeros for shorter urls

/**
 * Camera parameter codecs for URL hash state
 */
const cameraCodec: Record<string, HashCodec> = {
  longitude: {
    key: "lng",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  latitude: {
    key: "lat",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value),
  },
  height: {
    key: "h",
    decode: (value: string) => Number(value),
    encode: (value: number) => parseFloat(value.toFixed(2)).toString(),
  },
  heading: {
    key: "heading",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) =>
      formatRadians(CesiumMath.zeroToTwoPi(value), CAMERA_DEGREE_DIGITS),
  },
  pitch: {
    key: "pitch",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) =>
      formatRadians(CesiumMath.zeroToTwoPi(value), CAMERA_DEGREE_DIGITS),
  },
  fov: {
    key: "fov",
    decode: (value: string) => CesiumMath.toRadians(Number(value)),
    encode: (value: number) => formatRadians(value, CAMERA_DEGREE_DIGITS),
  },
};

/**
 * URL parameter keys used by Cesium camera state
 */
export const cesiumCameraParamKeys = Object.values(cameraCodec).map(
  (codec) => codec.key
);

/**
 * Parameter keys that should be cleared when switching from 3D to 2D
 * Keeps lng/lat as they're used in 2D mode too
 */
export const cesiumClearParamKeys = cesiumCameraParamKeys.filter(
  (k) => !["lng", "lat"].includes(k)
);

function isNumber(value: unknown): value is number {
  return (
    value !== undefined &&
    value !== null &&
    !isNaN(Number(value)) &&
    isFinite(Number(value))
  );
}

/**
 * Convert Cesium Camera to CameraStateDegrees (portal app state)
 * Returns all angles in degrees for external consumption
 */
export const cameraToState = (camera: Camera): CameraStateDegrees => {
  const { positionCartographic, pitch, heading, frustum } = camera;
  const { longitude, latitude, height } = positionCartographic;
  const fov = frustum instanceof PerspectiveFrustum ? frustum.fov : undefined;

  const cameraState: CameraStateDegrees = {
    longitude: radToDeg(longitude as Radians),
    latitude: radToDeg(latitude as Radians),
    height,
    ...(heading !== undefined && { heading: radToDeg(heading as Radians) }),
    ...(pitch !== undefined && { pitch: radToDeg(pitch as Radians) }),
    ...(fov !== undefined && { fov: radToDeg(fov as Radians) }),
  };

  return cameraState;
};

/**
 * Encode Cesium camera to URL hash parameters
 * @deprecated Use cameraToState + encodeCameraState instead
 */
export const encodeCesiumCamera = (camera: Camera): StringifiedCameraState => {
  const { positionCartographic, pitch, heading, frustum } = camera;
  const { longitude, latitude, height } = positionCartographic;
  const fov = frustum instanceof PerspectiveFrustum ? frustum.fov : undefined;

  const orderedParams: [number | undefined, HashCodec][] = [
    [longitude, cameraCodec["longitude"]],
    [latitude, cameraCodec["latitude"]],
    [height, cameraCodec["height"]],
    [heading, cameraCodec["heading"]],
    [pitch, cameraCodec["pitch"]],
    [fov, cameraCodec["fov"]],
  ];

  const stringifiedOrderedParams = orderedParams
    .filter(([numberValue]) => isNumber(numberValue))
    .map(([numberValue, codec]) => ({
      key: codec.key,
      value: codec.encode(numberValue as number),
    }));

  return stringifiedOrderedParams;
};

/**
 * Encode CameraStateDegrees to URL hash parameters (stringified)
 * Note: Codecs expect radians internally, but we format as degrees in the URL
 */
export const encodeCameraState = (
  state: CameraStateDegrees
): Record<string, string> => {
  const { longitude, latitude, height, heading, pitch, fov } = state;

  // Codecs handle the degree formatting internally via formatRadians
  // They expect numeric values (degrees are just numbers here)
  const orderedParams: [number | undefined, HashCodec][] = [
    [longitude as number, cameraCodec["longitude"]],
    [latitude as number, cameraCodec["latitude"]],
    [height as number, cameraCodec["height"]],
    [heading as number | undefined, cameraCodec["heading"]],
    [pitch as number | undefined, cameraCodec["pitch"]],
    [fov as number | undefined, cameraCodec["fov"]],
  ];

  const encoded = orderedParams
    .filter(([numberValue]) => isNumber(numberValue))
    .reduce((acc, [numberValue, codec]) => {
      acc[codec.key] = numberValue!.toFixed(
        codec.key === "h" ? 2 : DEGREE_DIGITS
      );
      return acc;
    }, {} as Record<string, string>);

  return encoded;
};

/**
 * Decode URL hash parameters to CameraStateDegrees (portal app state)
 * Returns all angles in degrees for external consumption
 */
export const decodeCesiumCamera = (
  hashParams: Record<string, string>
): CameraStateDegrees | null => {
  const decoded = Object.keys(cameraCodec).reduce((acc, key) => {
    const codec = cameraCodec[key];
    if (!codec) return acc;
    const shortKey = codec.key;
    const value = hashParams[shortKey];
    acc[key] =
      value !== null && value !== undefined ? codec.decode(value) : null;
    return acc;
  }, {} as Record<string, number | null>);

  const { longitude, latitude, height, heading, pitch, fov } = decoded;

  if (!isNumber(longitude) || !isNumber(latitude) || !isNumber(height)) {
    return null;
  }

  // Convert from radians to degrees
  const longitudeDeg = radToDeg(longitude as Radians);
  const latitudeDeg = radToDeg(latitude as Radians);

  // Normalize pitch to Cesium's expected range in degrees
  // Input URLs may encode pitch in [0, 360). Example: 299.98° should map to -60.02°
  let normalizedPitchDeg: number | undefined = undefined;
  if (isNumber(pitch)) {
    let pDeg = radToDeg(pitch as Radians) as number;
    // wrap to [-180, 180]
    if (pDeg > 180) pDeg -= 360;
    if (pDeg < -180) pDeg += 360;
    // clamp to [-90, 90]
    pDeg = Math.max(-90, Math.min(90, pDeg));
    normalizedPitchDeg = pDeg;
  }

  const cameraState: CameraStateDegrees = {
    longitude: longitudeDeg,
    latitude: latitudeDeg,
    height,
    ...(heading !== null && { heading: radToDeg(heading as Radians) }),
    ...(normalizedPitchDeg !== undefined && { pitch: normalizedPitchDeg }),
    ...(fov !== null && { fov: radToDeg(fov as Radians) }),
  };
  return cameraState;
};

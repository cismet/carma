import {
  Camera,
  Cartographic,
  Math as CesiumMath,
  PerspectiveFrustum,
} from "cesium";
import { VIEWERSTATE_KEYS } from "../constants";

// Constants for URL parameter formatting
const DEGREE_DIGITS = 7;
const CAMERA_DEGREE_DIGITS = 2;

type HashCodec = {
  key: string;
  decode: (value: string) => number;
  encode: (value: number) => string;
};

export type CameraState = {
  position: Cartographic;
  heading?: number;
  pitch?: number;
  fov?: number;
};
export type StringifiedCameraState = { key: string; value: string }[];

/**
 * Format a radian value to degrees with specified precision
 */
const formatRadians = (value: number, fixed = DEGREE_DIGITS): string =>
  parseFloat(CesiumMath.toDegrees(value).toFixed(fixed)).toString(); // parse float removes trailing zeros for shorter urls

/**
 * Common parameter codecs for URL hash state
 */

const cameraCodec: Record<string, HashCodec> = {
  // Cesium Camera position and orientation codecs
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

export const cesiumCameraParamKeys = Object.values(cameraCodec).map(
  (codec) => codec.key
);

export const cesiumClearParamKeys = cesiumCameraParamKeys
  .filter(
    (k) => !["lng", "lat"].includes(k) // keep lng and lat  as they are used for 2D mode too an will be overwritten
  )
  .concat(VIEWERSTATE_KEYS.is3d); // remove Cesium Only state keys

function isNumber(value: unknown): value is number {
  return (
    value !== undefined &&
    value !== null &&
    !isNaN(Number(value)) &&
    isFinite(Number(value))
  );
}

export const encodeCesiumCamera = (camera: Camera): StringifiedCameraState => {
  const { positionCartographic, pitch, heading, frustum } = camera;
  const { longitude, latitude, height } = positionCartographic;
  const fov = frustum instanceof PerspectiveFrustum ? frustum.fov : undefined;

  const orderedParams: [number | undefined, HashCodec][] = [
    [longitude, cameraCodec.longitude],
    [latitude, cameraCodec.latitude],
    [height, cameraCodec.height],
    [heading, cameraCodec.heading],
    [pitch, cameraCodec.pitch],
    [fov, cameraCodec.fov],
  ];

  const stringifiedOrderedParams = orderedParams
    .filter(([numberValue]) => isNumber(numberValue))
    .map(([numberValue, codec]) => ({
      key: codec.key,
      value: codec.encode(numberValue as number),
    }));

  return stringifiedOrderedParams;
};

export const decodeCesiumCamera = (
  hashParams: Record<string, string>
): CameraState | null => {
  const decoded = Object.keys(cameraCodec).reduce((acc, key) => {
    const shortKey = cameraCodec[key].key;
    const value = hashParams[shortKey];
    acc[key] =
      value !== null && value !== undefined
        ? cameraCodec[key].decode(value)
        : null;
    return acc;
  }, {} as Record<string, number | null>);

  const { longitude, latitude, height, heading, pitch, fov } = decoded;

  if (!isNumber(longitude) || !isNumber(latitude) || !isNumber(height)) {
    return null;
  }

  const position = Cartographic.fromRadians(longitude, latitude, height);

  const cameraState = {
    position,
    heading: heading ?? undefined,
    pitch: pitch ?? undefined,
    fov: fov ?? undefined,
  };
  return cameraState;
};

import {
  Cartesian3,
  Camera,
  Cartographic,
  Math as CesiumMath,
  PerspectiveFrustum,
  Transforms,
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

const objectCentricCameraHashKeys = ["camera3d", "c3"] as const;
const DEFAULT_C3_SOURCE_CODE = "c";

export const cesiumClearParamKeys = Array.from(
  new Set(
    cesiumCameraParamKeys
      .filter(
        (k) => !["lng", "lat"].includes(k) // keep lng and lat as they are used for 2D mode too and will be overwritten
      )
      .concat(
        "altitude",
        "range",
        "bearing",
        "roll",
        VIEWERSTATE_KEYS.is3d,
        ...objectCentricCameraHashKeys
      ) // remove Cesium-only state keys
  )
);

function isNumber(value: unknown): value is number {
  return (
    value !== undefined &&
    value !== null &&
    !isNaN(Number(value)) &&
    isFinite(Number(value))
  );
}

const decodeNumberField = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeCesiumPitchRad = (pitchRad: number | undefined): number | undefined => {
  if (!isNumber(pitchRad)) {
    return undefined;
  }

  let normalized = pitchRad;
  if (normalized > CesiumMath.PI) normalized -= CesiumMath.TWO_PI;
  if (normalized < -CesiumMath.PI) normalized += CesiumMath.TWO_PI;
  return CesiumMath.clamp(
    normalized,
    -CesiumMath.PI_OVER_TWO,
    CesiumMath.PI_OVER_TWO
  );
};

const projectCameraPositionFromAnchorRange = ({
  anchor,
  headingRad,
  pitchRad,
  rangeM,
}: {
  anchor: Cartographic;
  headingRad: number;
  pitchRad: number;
  rangeM: number;
}): Cartographic | null => {
  const anchorEcef = Cartographic.toCartesian(anchor);
  if (!anchorEcef) {
    return null;
  }

  const transform = Transforms.eastNorthUpToFixedFrame(anchorEcef);
  const cosPitch = Math.cos(pitchRad);
  const east = Math.sin(headingRad) * cosPitch * rangeM;
  const north = Math.cos(headingRad) * cosPitch * rangeM;
  const up = Math.sin(pitchRad) * rangeM;

  const eastAxis = new Cartesian3(transform[0], transform[1], transform[2]);
  const northAxis = new Cartesian3(transform[4], transform[5], transform[6]);
  const upAxis = new Cartesian3(transform[8], transform[9], transform[10]);

  const worldOffset = Cartesian3.add(
    Cartesian3.multiplyByScalar(eastAxis, east, new Cartesian3()),
    Cartesian3.add(
      Cartesian3.multiplyByScalar(northAxis, north, new Cartesian3()),
      Cartesian3.multiplyByScalar(upAxis, up, new Cartesian3()),
      new Cartesian3()
    ),
    new Cartesian3()
  );
  const cameraEcef = Cartesian3.subtract(anchorEcef, worldOffset, new Cartesian3());
  return Cartographic.fromCartesian(cameraEcef);
};

const decodeObjectCentricCameraFromHash = (
  hashParams: Record<string, string>
): CameraState | null => {
  const encoded = hashParams.c3 ?? hashParams.camera3d;
  if (!encoded) {
    return null;
  }

  const fields = encoded.split(",");
  const lngDeg = decodeNumberField(fields[0]);
  const latDeg = decodeNumberField(fields[1]);
  const altitudeM = decodeNumberField(fields[2]);
  if (!isNumber(lngDeg) || !isNumber(latDeg) || !isNumber(altitudeM)) {
    return null;
  }

  const headingDeg = decodeNumberField(fields[3]);
  const pitchDeg = decodeNumberField(fields[4]);
  const fovDeg = decodeNumberField(fields[6]);
  const maybeRangeM = decodeNumberField(fields[7]);
  const sourceCode = isNumber(maybeRangeM)
    ? fields[8] ?? DEFAULT_C3_SOURCE_CODE
    : fields[7] ?? DEFAULT_C3_SOURCE_CODE;

  const headingRad = isNumber(headingDeg)
    ? CesiumMath.toRadians(headingDeg)
    : undefined;
  const pitchRad = normalizeCesiumPitchRad(
    isNumber(pitchDeg) ? CesiumMath.toRadians(pitchDeg) : undefined
  );
  const fovRad = isNumber(fovDeg) ? CesiumMath.toRadians(fovDeg) : undefined;

  const anchorCartographic = Cartographic.fromDegrees(lngDeg, latDeg, altitudeM);
  const reconstructedPosition =
    sourceCode !== "c" &&
    isNumber(maybeRangeM) &&
    maybeRangeM > 0 &&
    isNumber(headingRad) &&
    isNumber(pitchRad)
      ? projectCameraPositionFromAnchorRange({
          anchor: anchorCartographic,
          headingRad,
          pitchRad,
          rangeM: maybeRangeM,
        }) ?? anchorCartographic
      : anchorCartographic;

  return {
    position: reconstructedPosition,
    heading: headingRad,
    pitch: pitchRad,
    fov: fovRad,
  };
};

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
    return decodeObjectCentricCameraFromHash(hashParams);
  }

  const position = Cartographic.fromRadians(longitude, latitude, height);
  const normalizedPitch = normalizeCesiumPitchRad(
    isNumber(pitch) ? (pitch as number) : undefined
  );

  const cameraState = {
    position,
    heading: heading ?? undefined,
    pitch: normalizedPitch,
    fov: fov ?? undefined,
  };
  return cameraState;
};

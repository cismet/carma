import {
  distanceFromMercatorZoomAtLatitudeDeg,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "@carma/geo/utils";
import {
  degToRadNumeric,
  negativeOneEightyToOneEighty,
  radToDegNumeric,
  zeroToThreeSixty,
} from "@carma/units/helpers";
import type { Degrees, Meters, Radians } from "@carma/units/types";
import {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
} from "../../../../mapping/engines/maplibre/src/constants/cameraDefaults";

export const DEFAULT_SCENE_STATE_HASH_KEY = "camera3d";
export const DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY = "altitude";

export {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
};

const MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;
const MIN_DECODED_OBJECT_CENTRIC_RANGE_M = 10;

const SOURCE_CODE = {
  cameraPosition: "c",
  screenCenter: "s",
  fallback: "f",
} as const;

const SOURCE_FROM_CODE = {
  c: "camera-position",
  s: "screen-center",
  f: "fallback",
} as const;

export type SceneStateAnchorSource =
  | "camera-position"
  | "screen-center"
  | "fallback";

export type SceneStateHashAnchor = {
  lngDeg: number;
  latDeg: number;
  heightM: number;
  source: SceneStateAnchorSource;
};

export type SceneStateHashOrientation = {
  bearingRad?: number;
  pitchRad?: number;
  rollRad?: number;
  fovVerticalRad?: number;
  rangeM?: number;
};

export type SceneStateHashSnapshot = {
  anchor: SceneStateHashAnchor;
  orientation: SceneStateHashOrientation;
};

export type SceneStateHashCodec = {
  decode: (value: string | undefined) => SceneStateHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};

export type SceneStateHashConfig = {
  hashKey: string;
  keyAliases: Record<string, string>;
  keyOrder: string[];
  hashCodecs: Record<string, SceneStateHashCodec>;
};

export type SceneStateHashEncodeScheme = "carma-maplibre-plus-elevation";

export type MapLibreCompatHashParams = {
  lng: number;
  lat: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  altitude?: number;
  fov?: number;
};

export type MapLibrePlusElevationHashValues = {
  lng: number;
  lat: number;
  zoom: number;
  altitude: number;
  bearing?: number;
  pitch?: number;
  fov?: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeBearingDeg = (bearingDeg: number): number =>
  zeroToThreeSixty(bearingDeg as Degrees) as number;

const toRad = (degrees: number): number => degToRadNumeric(degrees)!;
const toDeg = (radians: number): number => radToDegNumeric(radians)!;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toMapLibrePitchDeg = (
  scenePitchDeg: number,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG
): number => clamp(90 + scenePitchDeg, minPitchDeg, maxPitchDeg);

const fromMapLibrePitchDeg = (
  pitchDeg: number,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG
): number => clamp(pitchDeg, minPitchDeg, maxPitchDeg) - 90;

const isZeroish = (value: number | undefined, epsilon = 1e-9): boolean =>
  !isFiniteNumber(value) || Math.abs(value) <= epsilon;

export const readObjectCentricRangeFromMapLibreZoom = ({
  zoom,
  latitudeDeg,
  fovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  viewportWidthPx,
  viewportHeightPx,
}: {
  zoom: number;
  latitudeDeg: number;
  fovDeg?: number;
  viewportWidthPx: number;
  viewportHeightPx: number;
}): number | undefined => {
  if (
    !isFiniteNumber(zoom) ||
    !isFiniteNumber(latitudeDeg) ||
    !isFiniteNumber(viewportWidthPx) ||
    !isFiniteNumber(viewportHeightPx)
  ) {
    return undefined;
  }

  const fovRad = toRad(fovDeg);
  const rangeM = distanceFromMercatorZoomAtLatitudeDeg(
    zoom,
    latitudeDeg as never,
    {
      fovVerticalRad: fovRad as Radians,
      viewportWidthPx,
      viewportHeightPx,
    }
  );

  if (!isFiniteNumber(rangeM)) {
    return undefined;
  }

  return Math.max(rangeM, MIN_LINE_OF_SIGHT_DISTANCE_M);
};

export const readMapLibrePlusElevationHashValuesFromSceneState = ({
  snapshot,
  viewportWidthPx,
  viewportHeightPx,
  defaultFovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: SceneStateHashSnapshot;
  viewportWidthPx: number;
  viewportHeightPx: number;
  defaultFovDeg?: number;
  minPitchDeg?: number;
  maxPitchDeg?: number;
}): MapLibrePlusElevationHashValues | null => {
  const rangeM = snapshot.orientation.rangeM;
  if (!isFiniteNumber(rangeM)) {
    return null;
  }

  const fovRad = snapshot.orientation.fovVerticalRad;
  const fovDeg =
    isFiniteNumber(fovRad) && fovRad > 0 ? toDeg(fovRad) : defaultFovDeg;

  const zoom = mercatorZoomFromDistanceAtLatitudeDeg(
    rangeM as Meters,
    snapshot.anchor.latDeg as never,
    {
      fovVerticalRad: toRad(fovDeg) as Radians,
      viewportWidthPx,
      viewportHeightPx,
    }
  );

  if (!isFiniteNumber(zoom)) {
    return null;
  }

  const pitchDeg = isFiniteNumber(snapshot.orientation.pitchRad)
    ? toDeg(snapshot.orientation.pitchRad)
    : undefined;
  const mapLibrePitchDeg = isFiniteNumber(pitchDeg)
    ? toMapLibrePitchDeg(pitchDeg, minPitchDeg, maxPitchDeg)
    : undefined;

  const params: MapLibrePlusElevationHashValues = {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
    zoom,
    altitude: snapshot.anchor.heightM,
  };

  const bearingDeg = isFiniteNumber(snapshot.orientation.bearingRad)
    ? normalizeBearingDeg(toDeg(snapshot.orientation.bearingRad))
    : undefined;
  if (!isZeroish(bearingDeg)) {
    params.bearing = bearingDeg!;
  }

  if (!isZeroish(mapLibrePitchDeg)) {
    params.pitch = mapLibrePitchDeg!;
  }

  if (isFiniteNumber(fovRad) && Math.abs(fovDeg - defaultFovDeg) > 1e-9) {
    params.fov = fovDeg;
  }

  return params;
};

export const readSceneStateFromMapLibrePlusElevationHashValues = ({
  values,
  viewportWidthPx,
  viewportHeightPx,
  defaultFovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
}: {
  values: Partial<MapLibrePlusElevationHashValues>;
  viewportWidthPx: number;
  viewportHeightPx: number;
  defaultFovDeg?: number;
  minPitchDeg?: number;
  maxPitchDeg?: number;
}): SceneStateHashSnapshot | null => {
  const { lng, lat, zoom, altitude } = values;
  if (
    !isFiniteNumber(lng) ||
    !isFiniteNumber(lat) ||
    !isFiniteNumber(zoom) ||
    !isFiniteNumber(altitude)
  ) {
    return null;
  }

  const fovDeg =
    isFiniteNumber(values.fov) && values.fov > 0 ? values.fov : defaultFovDeg;
  const rangeM = readObjectCentricRangeFromMapLibreZoom({
    zoom,
    latitudeDeg: lat,
    fovDeg,
    viewportWidthPx,
    viewportHeightPx,
  });
  const pitchDeg = fromMapLibrePitchDeg(
    isFiniteNumber(values.pitch)
      ? values.pitch
      : DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
    minPitchDeg,
    maxPitchDeg
  );
  let restoredRangeM = rangeM;
  if (
    isFiniteNumber(restoredRangeM) &&
    restoredRangeM < MIN_DECODED_OBJECT_CENTRIC_RANGE_M
  ) {
    console.warn(
      "[hash-state] Clamping zoom-decoded scene restore range to minimum distance.",
      {
        decodedRangeM: restoredRangeM,
        restoredRangeM: MIN_DECODED_OBJECT_CENTRIC_RANGE_M,
        zoom,
        latitudeDeg: lat,
        fovDeg,
      }
    );
    restoredRangeM = MIN_DECODED_OBJECT_CENTRIC_RANGE_M;
  }

  return {
    anchor: {
      lngDeg: lng,
      latDeg: lat,
      heightM: altitude,
      source: "screen-center",
    },
    orientation: {
      ...(isFiniteNumber(values.bearing)
        ? { bearingRad: toRad(normalizeBearingDeg(values.bearing)) }
        : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchRad: toRad(pitchDeg) } : {}),
      ...(isFiniteNumber(restoredRangeM) ? { rangeM: restoredRangeM } : {}),
      ...(isFiniteNumber(values.fov)
        ? { fovVerticalRad: toRad(values.fov) }
        : {}),
    },
  };
};

const formatNumber = (
  value: number | undefined,
  fixedDigits: number
): string | undefined => {
  if (!isFiniteNumber(value)) {
    return undefined;
  }
  return parseFloat(value.toFixed(fixedDigits)).toString();
};

const toDelimitedField = (
  value: number | undefined,
  fixedDigits: number
): string => formatNumber(value, fixedDigits) ?? "";

const decodeField = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

/** Encode a rad value as a fixed-precision deg string (rad→deg boundary). */
const encodeAngleDeg = (
  rad: number | undefined,
  fixedDigits: number
): string => {
  if (!isFiniteNumber(rad)) return "";
  return formatNumber(toDeg(rad), fixedDigits) ?? "";
};

/** Decode a deg string field to rad (deg→rad boundary). */
const decodeAngleRad = (field: string | undefined): number | undefined => {
  const deg = decodeField(field);
  return isFiniteNumber(deg) ? toRad(deg) : undefined;
};

const getSourceCode = (source: SceneStateAnchorSource): string => {
  if (source === "screen-center") {
    return SOURCE_CODE.screenCenter;
  }
  if (source === "fallback") {
    return SOURCE_CODE.fallback;
  }
  return SOURCE_CODE.cameraPosition;
};

const getSourceFromCode = (
  sourceCode: string | undefined
): SceneStateAnchorSource => {
  if (!sourceCode) {
    return "camera-position";
  }
  return (
    SOURCE_FROM_CODE[sourceCode as keyof typeof SOURCE_FROM_CODE] ??
    "camera-position"
  );
};

const looksLikeSnapshot = (value: unknown): value is SceneStateHashSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SceneStateHashSnapshot>;
  const anchor = candidate.anchor as Partial<SceneStateHashAnchor> | undefined;
  return (
    !!anchor &&
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

export const encodeSceneStateHashSnapshot = (
  snapshot: SceneStateHashSnapshot
): string => {
  const { anchor, orientation } = snapshot;
  const fields = [
    toDelimitedField(anchor.lngDeg, 7),
    toDelimitedField(anchor.latDeg, 7),
    toDelimitedField(anchor.heightM, 2),
    encodeAngleDeg(orientation.bearingRad, 2),
    encodeAngleDeg(orientation.pitchRad, 2),
    encodeAngleDeg(orientation.rollRad, 2),
    encodeAngleDeg(orientation.fovVerticalRad, 2),
  ];
  if (isFiniteNumber(orientation.rangeM)) {
    fields.push(
      toDelimitedField(orientation.rangeM, 2),
      getSourceCode(anchor.source)
    );
  } else {
    fields.push(getSourceCode(anchor.source));
  }

  while (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  return fields.join(",");
};

export const decodeSceneStateHashSnapshot = (
  value: string | undefined
): SceneStateHashSnapshot | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const fields = value.split(",");
  const lngDeg = decodeField(fields[0]);
  const latDeg = decodeField(fields[1]);
  const heightM = decodeField(fields[2]);
  if (
    !isFiniteNumber(lngDeg) ||
    !isFiniteNumber(latDeg) ||
    !isFiniteNumber(heightM)
  ) {
    return undefined;
  }

  const bearingRad = decodeAngleRad(fields[3]);
  const pitchRad = decodeAngleRad(fields[4]);
  const rollRad = decodeAngleRad(fields[5]);
  const fovVerticalRad = decodeAngleRad(fields[6]);
  const maybeRangeOrSource = fields[7];
  const maybeRange = decodeField(maybeRangeOrSource);
  const source = isFiniteNumber(maybeRange)
    ? getSourceFromCode(fields[8])
    : getSourceFromCode(maybeRangeOrSource);

  return {
    anchor: {
      lngDeg,
      latDeg,
      heightM,
      source,
    },
    orientation: {
      ...(isFiniteNumber(bearingRad) ? { bearingRad } : {}),
      ...(isFiniteNumber(pitchRad) ? { pitchRad } : {}),
      ...(isFiniteNumber(rollRad) ? { rollRad } : {}),
      ...(isFiniteNumber(fovVerticalRad) ? { fovVerticalRad } : {}),
      ...(isFiniteNumber(maybeRange) ? { rangeM: maybeRange } : {}),
    },
  };
};

export const sceneStateHashCodec: SceneStateHashCodec = {
  decode: decodeSceneStateHashSnapshot,
  encode: (value: unknown) => {
    if (!looksLikeSnapshot(value)) {
      return undefined;
    }
    return encodeSceneStateHashSnapshot(value);
  },
};

export const sceneStateHashInternals = {
  toMapLibrePitchDeg,
  fromMapLibrePitchDeg,
  isZeroish,
  isFiniteNumber,
};

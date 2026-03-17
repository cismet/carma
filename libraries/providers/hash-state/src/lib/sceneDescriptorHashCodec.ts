import {
  distanceFromMercatorZoomAtLatitudeDeg,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "@carma/geo/utils";
import type { Meters, Radians } from "@carma/units/types";

export const DEFAULT_SCENE_DESCRIPTOR_HASH_KEY = "camera3d";
export const DEFAULT_SCENE_DESCRIPTOR_HASH_ALIAS = "c3";
export const DEFAULT_SCENE_DESCRIPTOR_ALTITUDE_HASH_KEY = "altitude";

export const DEFAULT_MAPLIBRE_PITCH_MIN_DEG = 0;
export const DEFAULT_MAPLIBRE_PITCH_MAX_DEG = 85;
export const DEFAULT_MAPLIBRE_FOV_DEG = 60;

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
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

export type SceneDescriptorAnchorSource =
  | "camera-position"
  | "screen-center"
  | "fallback";

export type SceneDescriptorHashAnchor = {
  lngDeg: number;
  latDeg: number;
  heightM: number;
  source: SceneDescriptorAnchorSource;
};

export type SceneDescriptorHashOrientation = {
  bearingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  fovDeg?: number;
  rangeM?: number;
};

export type SceneDescriptorHashSnapshot = {
  anchor: SceneDescriptorHashAnchor;
  orientation: SceneDescriptorHashOrientation;
};

export type SceneDescriptorHashCodec = {
  decode: (
    value: string | undefined
  ) => SceneDescriptorHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};

export type SceneDescriptorHashConfig = {
  hashKey: string;
  keyAliases: Record<string, string>;
  keyOrder: string[];
  hashCodecs: Record<string, SceneDescriptorHashCodec>;
};

export type SceneDescriptorHashEncodeScheme = "carma-maplibre-plus-elevation";

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

const normalizeBearingDeg = (bearingDeg: number): number => {
  const normalized = bearingDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const toRad = (degrees: number): number => degrees * DEG_TO_RAD;

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

export const readMapLibrePlusElevationHashValuesFromSceneDescriptor = ({
  snapshot,
  viewportWidthPx,
  viewportHeightPx,
  defaultFovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: SceneDescriptorHashSnapshot;
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

  const fovDeg =
    isFiniteNumber(snapshot.orientation.fovDeg) &&
    snapshot.orientation.fovDeg > 0
      ? snapshot.orientation.fovDeg
      : defaultFovDeg;

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

  const mapLibrePitchDeg = isFiniteNumber(snapshot.orientation.pitchDeg)
    ? toMapLibrePitchDeg(
        snapshot.orientation.pitchDeg,
        minPitchDeg,
        maxPitchDeg
      )
    : undefined;

  const params: MapLibrePlusElevationHashValues = {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
    zoom,
    altitude: snapshot.anchor.heightM,
  };

  if (!isZeroish(snapshot.orientation.bearingDeg)) {
    params.bearing = normalizeBearingDeg(snapshot.orientation.bearingDeg!);
  }

  if (!isZeroish(mapLibrePitchDeg)) {
    params.pitch = mapLibrePitchDeg!;
  }

  if (
    isFiniteNumber(snapshot.orientation.fovDeg) &&
    Math.abs(snapshot.orientation.fovDeg! - defaultFovDeg) > 1e-9
  ) {
    params.fov = snapshot.orientation.fovDeg!;
  }

  return params;
};

export const readSceneDescriptorFromMapLibrePlusElevationHashValues = ({
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
}): SceneDescriptorHashSnapshot | null => {
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
        ? { bearingDeg: normalizeBearingDeg(values.bearing) }
        : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(restoredRangeM) ? { rangeM: restoredRangeM } : {}),
      ...(isFiniteNumber(values.fov) ? { fovDeg: values.fov } : {}),
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

const getSourceCode = (source: SceneDescriptorAnchorSource): string => {
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
): SceneDescriptorAnchorSource => {
  if (!sourceCode) {
    return "camera-position";
  }
  return (
    SOURCE_FROM_CODE[sourceCode as keyof typeof SOURCE_FROM_CODE] ??
    "camera-position"
  );
};

const looksLikeSnapshot = (
  value: unknown
): value is SceneDescriptorHashSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<SceneDescriptorHashSnapshot>;
  const anchor = candidate.anchor as
    | Partial<SceneDescriptorHashAnchor>
    | undefined;
  return (
    !!anchor &&
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

export const encodeSceneDescriptorHashSnapshot = (
  snapshot: SceneDescriptorHashSnapshot
): string => {
  const { anchor, orientation } = snapshot;
  const fields = [
    toDelimitedField(anchor.lngDeg, 7),
    toDelimitedField(anchor.latDeg, 7),
    toDelimitedField(anchor.heightM, 2),
    toDelimitedField(orientation.bearingDeg, 2),
    toDelimitedField(orientation.pitchDeg, 2),
    toDelimitedField(orientation.rollDeg, 2),
    toDelimitedField(orientation.fovDeg, 2),
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

export const decodeSceneDescriptorHashSnapshot = (
  value: string | undefined
): SceneDescriptorHashSnapshot | undefined => {
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

  const bearingDeg = decodeField(fields[3]);
  const pitchDeg = decodeField(fields[4]);
  const rollDeg = decodeField(fields[5]);
  const fovDeg = decodeField(fields[6]);
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
      ...(isFiniteNumber(bearingDeg) ? { bearingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(maybeRange) ? { rangeM: maybeRange } : {}),
    },
  };
};

export const sceneDescriptorHashCodec: SceneDescriptorHashCodec = {
  decode: decodeSceneDescriptorHashSnapshot,
  encode: (value: unknown) => {
    if (!looksLikeSnapshot(value)) {
      return undefined;
    }
    return encodeSceneDescriptorHashSnapshot(value);
  },
};

export const createSceneDescriptorHashConfig = ({
  hashKey = DEFAULT_SCENE_DESCRIPTOR_HASH_KEY,
  hashAlias = DEFAULT_SCENE_DESCRIPTOR_HASH_ALIAS,
}: {
  hashKey?: string;
  hashAlias?: string;
} = {}): SceneDescriptorHashConfig => ({
  hashKey,
  keyAliases: {
    [hashKey]: hashAlias,
  },
  keyOrder: [hashAlias],
  hashCodecs: {
    [hashKey]: sceneDescriptorHashCodec,
  },
});

export const sceneDescriptorHashInternals = {
  normalizeBearingDeg,
  toMapLibrePitchDeg,
  fromMapLibrePitchDeg,
  isZeroish,
  isFiniteNumber,
  toRad,
  RAD_TO_DEG,
};

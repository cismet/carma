import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";
import type { OrbitPointSource, SceneStateSnapshot } from "@carma/types";
import type { Meters, Radians } from "@carma/units/types";

export const DEFAULT_CESIUM_CAMERA_HASH_KEY = "camera3d";
export const DEFAULT_CESIUM_CAMERA_HASH_ALIAS = "c3";
export const DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY = "altitude";

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const MAPLIBRE_PITCH_MIN_DEG = 0;
const MAPLIBRE_PITCH_MAX_DEG = 85;
const MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;
const MIN_TAN_HALF_FOV = 1e-6;

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

export type CesiumCameraAnchorSource =
  | "camera-position"
  | "screen-center"
  | "fallback";

export type CesiumCameraHashAnchor = {
  lngDeg: number;
  latDeg: number;
  heightM: number;
  source: CesiumCameraAnchorSource;
};

export type CesiumCameraHashOrientation = {
  headingDeg?: number;
  pitchDeg?: number;
  rollDeg?: number;
  fovDeg?: number;
  rangeM?: number;
};

export type CesiumCameraHashSnapshot = {
  anchor: CesiumCameraHashAnchor;
  orientation: CesiumCameraHashOrientation;
};

export type CesiumCameraHashCodec = {
  decode: (value: string | undefined) => CesiumCameraHashSnapshot | undefined;
  encode: (value: unknown) => string | undefined;
};

export type CesiumCameraHashConfig = {
  hashKey: string;
  keyAliases: Record<string, string>;
  keyOrder: string[];
  hashCodecs: Record<string, CesiumCameraHashCodec>;
};

export type CesiumCameraHashEncodeScheme =
  | "carma-camera-centric"
  | "carma-object-centric"
  | "maplibre-object-centric"
  | "maplibre-camera-centric";

export type CesiumMapLibreCompatHashParams = {
  lng: number;
  lat: number;
  zoom?: number;
  bearing?: number;
  pitch?: number;
  altitude?: number;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const normalizeHeadingDeg = (headingDeg: number): number => {
  const normalized = headingDeg % 360;
  return normalized < 0 ? normalized + 360 : normalized;
};

const normalizeSignedDeg = (angleDeg: number): number => {
  const normalized = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
};

const toDeg = (radians: number): number => radians * RAD_TO_DEG;
const toRad = (degrees: number): number => degrees * DEG_TO_RAD;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const toMapLibrePitchDeg = (
  cesiumPitchDeg: number,
  minPitchDeg = MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = MAPLIBRE_PITCH_MAX_DEG
): number => clamp(90 + cesiumPitchDeg, minPitchDeg, maxPitchDeg);

const readFallbackAnchorDistanceFromCameraM = (
  camera: CesiumCameraLike | null | undefined,
  anchorHeightM: number
): number | undefined => {
  const cameraHeightM = camera?.positionCartographic?.height;
  if (!isFiniteNumber(cameraHeightM)) {
    return undefined;
  }

  const distance = Math.abs(cameraHeightM - anchorHeightM);
  if (!isFiniteNumber(distance)) {
    return undefined;
  }

  return Math.max(distance, MIN_LINE_OF_SIGHT_DISTANCE_M);
};

const readSceneStateOrbitDistanceM = (
  sceneState: SceneStateSnapshot
): number | undefined => {
  const cameraPosition = sceneState.camera.worldPosition;
  const orbitPosition = sceneState.orbitPoint?.worldPosition;
  if (!orbitPosition) {
    return undefined;
  }

  const dx = cameraPosition.x - orbitPosition.x;
  const dy = cameraPosition.y - orbitPosition.y;
  const dz = cameraPosition.z - orbitPosition.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!isFiniteNumber(distance)) {
    return undefined;
  }

  return Math.max(distance, MIN_LINE_OF_SIGHT_DISTANCE_M);
};

const readFallbackAnchorDistanceM = (
  sceneState: SceneStateSnapshot,
  anchorHeightM: number
): number | undefined => {
  const cameraHeightM = sceneState.camera.cartographic?.altitude;
  if (!isFiniteNumber(cameraHeightM)) {
    return undefined;
  }

  const distance = Math.abs(cameraHeightM - anchorHeightM);
  if (!isFiniteNumber(distance)) {
    return undefined;
  }

  return Math.max(distance, MIN_LINE_OF_SIGHT_DISTANCE_M);
};

const readMapLibreZoomFromSceneState = ({
  sceneState,
  scene,
  camera,
  anchor,
}: {
  sceneState: SceneStateSnapshot | null | undefined;
  scene?: CesiumSceneLike | null;
  camera?: CesiumCameraLike | null;
  anchor: CesiumCameraHashAnchor;
}): number | undefined => {
  const fovVertical = sceneState?.camera.fovVertical ?? camera?.frustum?.fov;
  if (!isFiniteNumber(fovVertical)) {
    return undefined;
  }

  const canvasWidth = scene?.canvas?.clientWidth;
  const canvasHeight = scene?.canvas?.clientHeight;
  if (!isFiniteNumber(canvasWidth) || !isFiniteNumber(canvasHeight)) {
    return undefined;
  }

  const centerRadiusPx = Math.max(canvasWidth, canvasHeight) * 0.5;
  if (!isFiniteNumber(centerRadiusPx) || centerRadiusPx <= 0) {
    return undefined;
  }

  const halfFovTan = Math.tan(fovVertical * 0.5);
  if (!isFiniteNumber(halfFovTan) || Math.abs(halfFovTan) < MIN_TAN_HALF_FOV) {
    return undefined;
  }

  const lineOfSightDistanceM =
    readSceneStateOrbitDistanceM(sceneState) ??
    readFallbackAnchorDistanceM(sceneState, anchor.heightM) ??
    readFallbackAnchorDistanceFromCameraM(camera, anchor.heightM);
  if (!isFiniteNumber(lineOfSightDistanceM) || lineOfSightDistanceM <= 0) {
    return undefined;
  }

  const groundRadiusM = lineOfSightDistanceM * Math.abs(halfFovTan);
  const metersPerCssPixel = groundRadiusM / centerRadiusPx;
  if (!isFiniteNumber(metersPerCssPixel) || metersPerCssPixel <= 0) {
    return undefined;
  }

  const latRad = toRad(anchor.latDeg);
  const zoom = getZoomFromPixelResolutionAtLatitudeRad(
    metersPerCssPixel as Meters,
    latRad as Radians
  );
  return isFiniteNumber(zoom) ? zoom : undefined;
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

const getSourceCode = (source: CesiumCameraAnchorSource): string => {
  if (source === "screen-center") {
    return SOURCE_CODE.screenCenter;
  }
  if (source === "fallback") {
    return SOURCE_CODE.fallback;
  }
  return SOURCE_CODE.cameraPosition;
};

const getSourceFromCode = (sourceCode: string | undefined): CesiumCameraAnchorSource => {
  if (!sourceCode) {
    return "camera-position";
  }
  return SOURCE_FROM_CODE[sourceCode as keyof typeof SOURCE_FROM_CODE] ?? "camera-position";
};

const looksLikeSnapshot = (value: unknown): value is CesiumCameraHashSnapshot => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<CesiumCameraHashSnapshot>;
  const anchor = candidate.anchor as Partial<CesiumCameraHashAnchor> | undefined;
  return (
    !!anchor &&
    isFiniteNumber(anchor.lngDeg) &&
    isFiniteNumber(anchor.latDeg) &&
    isFiniteNumber(anchor.heightM)
  );
};

export const encodeCesiumCameraHashSnapshot = (
  snapshot: CesiumCameraHashSnapshot
): string => {
  const { anchor, orientation } = snapshot;
  const fields = [
    toDelimitedField(anchor.lngDeg, 7),
    toDelimitedField(anchor.latDeg, 7),
    toDelimitedField(anchor.heightM, 2),
    toDelimitedField(orientation.headingDeg, 2),
    toDelimitedField(orientation.pitchDeg, 2),
    toDelimitedField(orientation.rollDeg, 2),
    toDelimitedField(orientation.fovDeg, 2),
  ];
  if (isFiniteNumber(orientation.rangeM)) {
    fields.push(toDelimitedField(orientation.rangeM, 2), getSourceCode(anchor.source));
  } else {
    fields.push(getSourceCode(anchor.source));
  }

  // Keep a compact suffix by trimming trailing empty fields.
  while (fields.length > 0 && fields[fields.length - 1] === "") {
    fields.pop();
  }

  return fields.join(",");
};

export const decodeCesiumCameraHashSnapshot = (
  value: string | undefined
): CesiumCameraHashSnapshot | undefined => {
  if (!value || typeof value !== "string") {
    return undefined;
  }

  const fields = value.split(",");
  const lngDeg = decodeField(fields[0]);
  const latDeg = decodeField(fields[1]);
  const heightM = decodeField(fields[2]);
  if (!isFiniteNumber(lngDeg) || !isFiniteNumber(latDeg) || !isFiniteNumber(heightM)) {
    return undefined;
  }

  const headingDeg = decodeField(fields[3]);
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
      ...(isFiniteNumber(headingDeg) ? { headingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(maybeRange) ? { rangeM: maybeRange } : {}),
    },
  };
};

export const cesiumCameraHashCodec: CesiumCameraHashCodec = {
  decode: decodeCesiumCameraHashSnapshot,
  encode: (value: unknown) => {
    if (!looksLikeSnapshot(value)) {
      return undefined;
    }
    return encodeCesiumCameraHashSnapshot(value);
  },
};

export const createCesiumCameraHashConfig = ({
  hashKey = DEFAULT_CESIUM_CAMERA_HASH_KEY,
  hashAlias = DEFAULT_CESIUM_CAMERA_HASH_ALIAS,
}: {
  hashKey?: string;
  hashAlias?: string;
} = {}): CesiumCameraHashConfig => ({
  hashKey,
  keyAliases: {
    [hashKey]: hashAlias,
  },
  keyOrder: [hashAlias],
  hashCodecs: {
    [hashKey]: cesiumCameraHashCodec,
  },
});

export type CesiumCartographicLike = {
  longitude: number;
  latitude: number;
  height: number;
};

export type CesiumCameraLike = {
  positionCartographic?: CesiumCartographicLike;
  heading?: number;
  pitch?: number;
  roll?: number;
  frustum?: { fov?: number } | null;
  getPickRay?: (windowPosition: { x: number; y: number }) => unknown;
};

export type CesiumSceneLike = {
  camera?: CesiumCameraLike;
  canvas?: { clientWidth: number; clientHeight: number };
  pickPositionSupported?: boolean;
  pickPosition?: (windowPosition: { x: number; y: number }) => unknown;
  globe?: {
    pick?: (ray: unknown, scene: CesiumSceneLike) => unknown;
    ellipsoid?: {
      cartesianToCartographic?: (
        cartesian: unknown
      ) => CesiumCartographicLike | undefined | null;
    };
  };
};

export type CesiumCameraAnchorMode = "camera-position" | "screen-center";

const toAnchorSourceFromOrbitPointSource = (
  source: OrbitPointSource
): CesiumCameraAnchorSource => {
  if (source === "screen-center-depth" || source === "screen-center-globe") {
    return "screen-center";
  }
  if (source === "fallback") {
    return "fallback";
  }
  return "camera-position";
};

const readCameraPositionAnchor = (
  camera: CesiumCameraLike,
  fallbackHeightM: number,
  source: CesiumCameraAnchorSource
): CesiumCameraHashAnchor | null => {
  const position = camera.positionCartographic;
  if (!position) {
    return null;
  }

  const lngDeg = toDeg(position.longitude);
  const latDeg = toDeg(position.latitude);
  if (!Number.isFinite(lngDeg) || !Number.isFinite(latDeg)) {
    return null;
  }

  const safeHeight = Number.isFinite(position.height)
    ? position.height
    : fallbackHeightM;

  return {
    lngDeg,
    latDeg,
    heightM: safeHeight,
    source,
  };
};

const sampleScreenCenterAnchor = (
  scene: CesiumSceneLike,
  camera: CesiumCameraLike,
  fallbackHeightM: number
): CesiumCameraHashAnchor | null => {
  const canvas = scene.canvas;
  const toCartographic = scene.globe?.ellipsoid?.cartesianToCartographic;
  if (!canvas || typeof toCartographic !== "function") {
    return null;
  }

  const centerScreenPosition = {
    x: canvas.clientWidth * 0.5,
    y: canvas.clientHeight * 0.5,
  };

  let pickedCartesian: unknown = null;
  if (scene.pickPositionSupported && typeof scene.pickPosition === "function") {
    pickedCartesian = scene.pickPosition(centerScreenPosition);
  }

  if (!pickedCartesian && typeof camera.getPickRay === "function") {
    const ray = camera.getPickRay(centerScreenPosition);
    if (ray && typeof scene.globe?.pick === "function") {
      pickedCartesian = scene.globe.pick(ray, scene);
    }
  }

  if (!pickedCartesian) {
    return null;
  }

  const pickedCartographic = toCartographic(pickedCartesian);
  if (!pickedCartographic) {
    return null;
  }

  const lngDeg = toDeg(pickedCartographic.longitude);
  const latDeg = toDeg(pickedCartographic.latitude);
  if (!Number.isFinite(lngDeg) || !Number.isFinite(latDeg)) {
    return null;
  }

  const safeHeight = Number.isFinite(pickedCartographic.height)
    ? pickedCartographic.height
    : fallbackHeightM;

  return {
    lngDeg,
    latDeg,
    heightM: safeHeight,
    source: "screen-center",
  };
};

export const readCesiumCameraHashSnapshot = ({
  camera,
  scene,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  camera: CesiumCameraLike;
  scene?: CesiumSceneLike | null;
  anchorMode?: CesiumCameraAnchorMode;
  fallbackHeightM?: number;
}): CesiumCameraHashSnapshot | null => {
  const anchor =
    anchorMode === "screen-center" && scene
      ? sampleScreenCenterAnchor(scene, camera, fallbackHeightM) ??
        readCameraPositionAnchor(camera, fallbackHeightM, "fallback")
      : readCameraPositionAnchor(camera, fallbackHeightM, "camera-position");

  if (!anchor) {
    return null;
  }

  const headingDeg = isFiniteNumber(camera.heading)
    ? normalizeHeadingDeg(toDeg(camera.heading))
    : undefined;
  const pitchDeg = isFiniteNumber(camera.pitch)
    ? normalizeSignedDeg(toDeg(camera.pitch))
    : undefined;
  const rollDeg = isFiniteNumber(camera.roll)
    ? normalizeSignedDeg(toDeg(camera.roll))
    : undefined;
  const fovDeg =
    camera.frustum && isFiniteNumber(camera.frustum.fov)
      ? toDeg(camera.frustum.fov)
      : undefined;
  const rangeM =
    anchorMode === "screen-center"
      ? readFallbackAnchorDistanceFromCameraM(camera, anchor.heightM)
      : undefined;

  return {
    anchor,
    orientation: {
      ...(isFiniteNumber(headingDeg) ? { headingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(rangeM) ? { rangeM } : {}),
    },
  };
};

export const readCesiumCameraHashSnapshotFromSceneState = ({
  sceneState,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  sceneState: SceneStateSnapshot | null | undefined;
  anchorMode?: CesiumCameraAnchorMode;
  fallbackHeightM?: number;
}): CesiumCameraHashSnapshot | null => {
  if (!sceneState) {
    return null;
  }

  const cameraCartographic = sceneState.camera.cartographic;
  const orbitPoint = sceneState.orbitPoint;
  const orbitCartographic = orbitPoint?.cartographic ?? null;

  const anchorCartographic =
    anchorMode === "screen-center"
      ? orbitCartographic ?? cameraCartographic
      : cameraCartographic;
  if (!anchorCartographic) {
    return null;
  }

  const heightM = Number.isFinite(anchorCartographic.altitude)
    ? anchorCartographic.altitude
    : fallbackHeightM;
  const source: CesiumCameraAnchorSource =
    anchorMode === "screen-center"
      ? orbitPoint
        ? toAnchorSourceFromOrbitPointSource(orbitPoint.source)
        : "fallback"
      : "camera-position";

  const headingDeg = isFiniteNumber(sceneState.camera.headingRad)
    ? normalizeHeadingDeg(toDeg(sceneState.camera.headingRad))
    : undefined;
  const pitchDeg = isFiniteNumber(sceneState.camera.pitchRad)
    ? normalizeSignedDeg(toDeg(sceneState.camera.pitchRad))
    : undefined;
  const rollDeg = isFiniteNumber(sceneState.camera.rollRad)
    ? normalizeSignedDeg(toDeg(sceneState.camera.rollRad))
    : undefined;
  const fovDeg = isFiniteNumber(sceneState.camera.fovVertical)
    ? toDeg(sceneState.camera.fovVertical)
    : undefined;
  const rangeM =
    anchorMode === "screen-center"
      ? readSceneStateOrbitDistanceM(sceneState) ??
        readFallbackAnchorDistanceM(sceneState, heightM)
      : undefined;

  return {
    anchor: {
      lngDeg: toDeg(anchorCartographic.longitude),
      latDeg: toDeg(anchorCartographic.latitude),
      heightM,
      source,
    },
    orientation: {
      ...(isFiniteNumber(headingDeg) ? { headingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(rangeM) ? { rangeM } : {}),
    },
  };
};

export const readCesiumMapLibreCompatHashParams = ({
  snapshot,
  sceneState,
  scene,
  camera,
  includeAltitude = false,
  altitudeKey = DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY,
  minPitchDeg = MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: CesiumCameraHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  scene?: CesiumSceneLike | null;
  camera?: CesiumCameraLike | null;
  includeAltitude?: boolean;
  altitudeKey?: string;
  minPitchDeg?: number;
  maxPitchDeg?: number;
}): Record<string, number> => {
  const params: Record<string, number> = {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
  };
  if (includeAltitude) {
    params[altitudeKey] = snapshot.anchor.heightM;
  }

  if (isFiniteNumber(snapshot.orientation.headingDeg)) {
    params.bearing = normalizeHeadingDeg(snapshot.orientation.headingDeg);
  }

  if (isFiniteNumber(snapshot.orientation.pitchDeg)) {
    params.pitch = toMapLibrePitchDeg(
      snapshot.orientation.pitchDeg,
      minPitchDeg,
      maxPitchDeg
    );
  }

  const zoom = readMapLibreZoomFromSceneState({
    sceneState,
    scene,
    camera,
    anchor: snapshot.anchor,
  });
  if (isFiniteNumber(zoom)) {
    params.zoom = zoom;
  }

  return params;
};

export const readCesiumMapLibreCameraCentricHashParams = ({
  snapshot,
  sceneState,
  scene,
  camera,
  includeAltitude = false,
  altitudeKey = DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY,
  fallbackHeightM = 200,
  minPitchDeg = MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: CesiumCameraHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  scene?: CesiumSceneLike | null;
  camera?: CesiumCameraLike | null;
  includeAltitude?: boolean;
  altitudeKey?: string;
  fallbackHeightM?: number;
  minPitchDeg?: number;
  maxPitchDeg?: number;
}): Record<string, number> => {
  const position = readCameraCentricPosition({
    sceneState,
    camera,
    snapshot,
    fallbackHeightM,
  });

  const params: Record<string, number> = {
    lng: position.lngDeg,
    lat: position.latDeg,
  };
  if (includeAltitude) {
    params[altitudeKey] = position.heightM;
  }

  const headingDeg =
    (isFiniteNumber(sceneState?.camera.headingRad)
      ? normalizeHeadingDeg(toDeg(sceneState!.camera.headingRad!))
      : undefined) ??
    (isFiniteNumber(camera?.heading)
      ? normalizeHeadingDeg(toDeg(camera!.heading!))
      : undefined) ??
    (isFiniteNumber(snapshot.orientation.headingDeg)
      ? normalizeHeadingDeg(snapshot.orientation.headingDeg)
      : undefined);
  if (isFiniteNumber(headingDeg)) {
    params.bearing = headingDeg;
  }

  const pitchDegSigned =
    (isFiniteNumber(sceneState?.camera.pitchRad)
      ? normalizeSignedDeg(toDeg(sceneState!.camera.pitchRad!))
      : undefined) ??
    (isFiniteNumber(camera?.pitch)
      ? normalizeSignedDeg(toDeg(camera!.pitch!))
      : undefined) ??
    (isFiniteNumber(snapshot.orientation.pitchDeg)
      ? normalizeSignedDeg(snapshot.orientation.pitchDeg)
      : undefined);
  if (isFiniteNumber(pitchDegSigned)) {
    params.pitch = toMapLibrePitchDeg(pitchDegSigned, minPitchDeg, maxPitchDeg);
  }

  const zoom = readMapLibreZoomFromSceneState({
    sceneState,
    scene,
    camera,
    anchor: {
      lngDeg: position.lngDeg,
      latDeg: position.latDeg,
      heightM: position.heightM,
      source: "camera-position",
    },
  });
  if (isFiniteNumber(zoom)) {
    params.zoom = zoom;
  }

  return params;
};

const readCameraCentricPosition = ({
  sceneState,
  camera,
  snapshot,
  fallbackHeightM,
}: {
  sceneState?: SceneStateSnapshot | null;
  camera?: CesiumCameraLike | null;
  snapshot: CesiumCameraHashSnapshot;
  fallbackHeightM: number;
}): { lngDeg: number; latDeg: number; heightM: number } => {
  const sceneCartographic = sceneState?.camera.cartographic;
  if (
    sceneCartographic &&
    isFiniteNumber(sceneCartographic.longitude) &&
    isFiniteNumber(sceneCartographic.latitude)
  ) {
    return {
      lngDeg: toDeg(sceneCartographic.longitude),
      latDeg: toDeg(sceneCartographic.latitude),
      heightM: isFiniteNumber(sceneCartographic.altitude)
        ? sceneCartographic.altitude
        : fallbackHeightM,
    };
  }

  const cameraCartographic = camera?.positionCartographic;
  if (
    cameraCartographic &&
    isFiniteNumber(cameraCartographic.longitude) &&
    isFiniteNumber(cameraCartographic.latitude)
  ) {
    return {
      lngDeg: toDeg(cameraCartographic.longitude),
      latDeg: toDeg(cameraCartographic.latitude),
      heightM: isFiniteNumber(cameraCartographic.height)
        ? cameraCartographic.height
        : fallbackHeightM,
    };
  }

  return {
    lngDeg: snapshot.anchor.lngDeg,
    latDeg: snapshot.anchor.latDeg,
    heightM: snapshot.anchor.heightM,
  };
};

const normalizeLegacyPitchDeg = (pitchDeg: number): number =>
  normalizeHeadingDeg(pitchDeg);

export const readCesiumCarmaCameraCentricHashParams = ({
  snapshot,
  sceneState,
  camera,
  fallbackHeightM = 200,
}: {
  snapshot: CesiumCameraHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  camera?: CesiumCameraLike | null;
  fallbackHeightM?: number;
}): Record<string, number> => {
  const position = readCameraCentricPosition({
    sceneState,
    camera,
    snapshot,
    fallbackHeightM,
  });

  const headingDeg =
    (isFiniteNumber(sceneState?.camera.headingRad)
      ? normalizeHeadingDeg(toDeg(sceneState!.camera.headingRad!))
      : undefined) ??
    (isFiniteNumber(camera?.heading)
      ? normalizeHeadingDeg(toDeg(camera!.heading!))
      : undefined) ??
    (isFiniteNumber(snapshot.orientation.headingDeg)
      ? normalizeHeadingDeg(snapshot.orientation.headingDeg)
      : undefined);

  const pitchDegSigned =
    (isFiniteNumber(sceneState?.camera.pitchRad)
      ? normalizeSignedDeg(toDeg(sceneState!.camera.pitchRad!))
      : undefined) ??
    (isFiniteNumber(camera?.pitch)
      ? normalizeSignedDeg(toDeg(camera!.pitch!))
      : undefined) ??
    (isFiniteNumber(snapshot.orientation.pitchDeg)
      ? normalizeSignedDeg(snapshot.orientation.pitchDeg)
      : undefined);

  const fovDeg =
    (isFiniteNumber(sceneState?.camera.fovVertical)
      ? toDeg(sceneState!.camera.fovVertical!)
      : undefined) ??
    (isFiniteNumber(camera?.frustum?.fov) ? toDeg(camera!.frustum!.fov!) : undefined) ??
    snapshot.orientation.fovDeg;

  return {
    lng: position.lngDeg,
    lat: position.latDeg,
    h: position.heightM,
    ...(isFiniteNumber(headingDeg) ? { heading: headingDeg } : {}),
    ...(isFiniteNumber(pitchDegSigned)
      ? { pitch: normalizeLegacyPitchDeg(pitchDegSigned) }
      : {}),
    ...(isFiniteNumber(fovDeg) ? { fov: fovDeg } : {}),
  };
};

export const readCesiumCarmaObjectCentricHashParams = ({
  snapshot,
  sceneState,
  camera,
  altitudeKey = DEFAULT_CESIUM_CAMERA_ALTITUDE_HASH_KEY,
  rangeKey = "range",
}: {
  snapshot: CesiumCameraHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  camera?: CesiumCameraLike | null;
  altitudeKey?: string;
  rangeKey?: string;
}): Record<string, number> => {
  const rangeM =
    snapshot.orientation.rangeM ??
    readSceneStateOrbitDistanceM(sceneState) ??
    readFallbackAnchorDistanceM(sceneState, snapshot.anchor.heightM) ??
    readFallbackAnchorDistanceFromCameraM(camera, snapshot.anchor.heightM);

  return {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
    [altitudeKey]: snapshot.anchor.heightM,
    ...(isFiniteNumber(rangeM) ? { [rangeKey]: rangeM } : {}),
    ...(isFiniteNumber(snapshot.orientation.headingDeg)
      ? { bearing: normalizeHeadingDeg(snapshot.orientation.headingDeg) }
      : {}),
    ...(isFiniteNumber(snapshot.orientation.pitchDeg)
      ? { pitch: normalizeSignedDeg(snapshot.orientation.pitchDeg) }
      : {}),
    ...(isFiniteNumber(snapshot.orientation.fovDeg)
      ? { fov: snapshot.orientation.fovDeg }
      : {}),
  };
};

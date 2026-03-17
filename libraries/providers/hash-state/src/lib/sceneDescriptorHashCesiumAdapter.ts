import {
  getPixelResolutionFromZoomAtLatitudeRad,
  getZoomFromPixelResolutionAtLatitudeRad,
  mercatorZoomFromDistanceAtLatitudeDeg,
} from "@carma/geo/utils";
import type { SceneStateSnapshot } from "@carma/types";
import type { Meters, Radians } from "@carma/units/types";
import {
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  DEFAULT_SCENE_DESCRIPTOR_ALTITUDE_HASH_KEY,
  readMapLibrePlusElevationHashValuesFromSceneDescriptor,
  sceneDescriptorHashInternals,
  type SceneDescriptorHashSnapshot,
} from "./sceneDescriptorHashCodec";
import {
  readSceneDescriptorHashSnapshotFromSceneState,
  type SceneDescriptorAnchorMode,
} from "./sceneDescriptorHashSceneStateAdapter";

const { RAD_TO_DEG, isFiniteNumber, isZeroish, normalizeBearingDeg, toMapLibrePitchDeg } =
  sceneDescriptorHashInternals;

const MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;

const normalizeSignedDeg = (angleDeg: number): number => {
  const normalized = ((angleDeg + 180) % 360 + 360) % 360 - 180;
  return normalized === -180 ? 180 : normalized;
};

const toDeg = (radians: number): number => radians * RAD_TO_DEG;

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
  frustum?: { fov?: number; fovy?: number } | null;
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

const readAspectRatio = (
  scene: CesiumSceneLike | null | undefined
): number | undefined => {
  const width = scene?.canvas?.clientWidth;
  const height = scene?.canvas?.clientHeight;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || height <= 0) {
    return undefined;
  }

  const aspect = width / height;
  return isFiniteNumber(aspect) && aspect > 0 ? aspect : undefined;
};

const readCesiumVerticalFovRad = ({
  camera,
  scene,
}: {
  camera?: CesiumCameraLike | null;
  scene?: CesiumSceneLike | null;
}): number | undefined => {
  const frustum = camera?.frustum;
  if (isFiniteNumber(frustum?.fovy) && frustum.fovy > 0) {
    return frustum.fovy;
  }

  if (!isFiniteNumber(frustum?.fov) || frustum.fov <= 0) {
    return undefined;
  }

  const aspect = readAspectRatio(scene);
  if (isFiniteNumber(aspect) && aspect > 1) {
    return Math.atan(Math.tan(frustum.fov * 0.5) / aspect) * 2;
  }

  return frustum.fov;
};

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
  anchor: SceneDescriptorHashSnapshot["anchor"];
}): number | undefined => {
  const canvasWidth = scene?.canvas?.clientWidth;
  const canvasHeight = scene?.canvas?.clientHeight;
  if (!isFiniteNumber(canvasWidth) || !isFiniteNumber(canvasHeight)) {
    return undefined;
  }

  const lineOfSightDistanceM =
    (sceneState ? readSceneStateOrbitDistanceM(sceneState) : undefined) ??
    (sceneState ? readFallbackAnchorDistanceM(sceneState, anchor.heightM) : undefined) ??
    readFallbackAnchorDistanceFromCameraM(camera, anchor.heightM);
  if (!isFiniteNumber(lineOfSightDistanceM) || lineOfSightDistanceM <= 0) {
    return undefined;
  }

  const fovVertical =
    sceneState?.camera.fovVertical ??
    readCesiumVerticalFovRad({
      camera,
      scene,
    });
  if (!isFiniteNumber(fovVertical)) {
    return undefined;
  }

  const zoom = mercatorZoomFromDistanceAtLatitudeDeg(
    lineOfSightDistanceM as Meters,
    anchor.latDeg as never,
    {
      fovVerticalRad: fovVertical as Radians,
      viewportWidthPx: canvasWidth,
      viewportHeightPx: canvasHeight,
    }
  );
  return isFiniteNumber(zoom) ? zoom : undefined;
};

const readCameraPositionAnchor = (
  camera: CesiumCameraLike,
  fallbackHeightM: number,
  source: SceneDescriptorHashSnapshot["anchor"]["source"]
): SceneDescriptorHashSnapshot["anchor"] | null => {
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
): SceneDescriptorHashSnapshot["anchor"] | null => {
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

export const readSceneDescriptorHashSnapshotFromCesiumCamera = ({
  camera,
  scene,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  camera: CesiumCameraLike;
  scene?: CesiumSceneLike | null;
  anchorMode?: SceneDescriptorAnchorMode;
  fallbackHeightM?: number;
}): SceneDescriptorHashSnapshot | null => {
  const anchor =
    anchorMode === "screen-center" && scene
      ? sampleScreenCenterAnchor(scene, camera, fallbackHeightM) ??
        readCameraPositionAnchor(camera, fallbackHeightM, "fallback")
      : readCameraPositionAnchor(camera, fallbackHeightM, "camera-position");

  if (!anchor) {
    return null;
  }

  const bearingDeg = isFiniteNumber(camera.heading)
    ? normalizeBearingDeg(toDeg(camera.heading))
    : undefined;
  const pitchDeg = isFiniteNumber(camera.pitch)
    ? normalizeSignedDeg(toDeg(camera.pitch))
    : undefined;
  const rollDeg = isFiniteNumber(camera.roll)
    ? normalizeSignedDeg(toDeg(camera.roll))
    : undefined;
  const fovVerticalRad = readCesiumVerticalFovRad({
    camera,
    scene,
  });
  const fovDeg = isFiniteNumber(fovVerticalRad) ? toDeg(fovVerticalRad) : undefined;
  const rangeM =
    anchorMode === "screen-center"
      ? readFallbackAnchorDistanceFromCameraM(camera, anchor.heightM)
      : undefined;

  return {
    anchor,
    orientation: {
      ...(isFiniteNumber(bearingDeg) ? { bearingDeg } : {}),
      ...(isFiniteNumber(pitchDeg) ? { pitchDeg } : {}),
      ...(isFiniteNumber(rollDeg) ? { rollDeg } : {}),
      ...(isFiniteNumber(fovDeg) ? { fovDeg } : {}),
      ...(isFiniteNumber(rangeM) ? { rangeM } : {}),
    },
  };
};

export const readSceneDescriptorHashSnapshotFromSceneAdapter =
  readSceneDescriptorHashSnapshotFromCesiumCamera;

export function readMapLibreCompatHashParamsFromSceneDescriptor({
  snapshot,
  sceneState,
  scene,
  camera,
  includeAltitude = false,
  altitudeKey = DEFAULT_SCENE_DESCRIPTOR_ALTITUDE_HASH_KEY,
  defaultFovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: SceneDescriptorHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  scene?: CesiumSceneLike | null;
  camera?: CesiumCameraLike | null;
  includeAltitude?: boolean;
  altitudeKey?: string;
  defaultFovDeg?: number;
  minPitchDeg?: number;
  maxPitchDeg?: number;
}): Record<string, number> {
  const zoom = readMapLibreZoomFromSceneState({
    sceneState,
    scene,
    camera,
    anchor: snapshot.anchor,
  });

  const cameraVerticalFovRad = readCesiumVerticalFovRad({
    camera,
    scene,
  });
  const effectiveFovDeg = isFiniteNumber(sceneState?.camera.fovVertical)
    ? toDeg(sceneState.camera.fovVertical)
    : isFiniteNumber(snapshot.orientation.fovDeg)
      ? snapshot.orientation.fovDeg
      : isFiniteNumber(cameraVerticalFovRad)
        ? toDeg(cameraVerticalFovRad)
        : undefined;

  const snapshotForMapLibreProjection =
    isFiniteNumber(effectiveFovDeg) &&
    (!isFiniteNumber(snapshot.orientation.fovDeg) ||
      Math.abs(snapshot.orientation.fovDeg - effectiveFovDeg) > 1e-9)
      ? {
          ...snapshot,
          orientation: {
            ...snapshot.orientation,
            fovDeg: effectiveFovDeg,
          },
        }
      : snapshot;

  const sceneWidth = scene?.canvas?.clientWidth;
  const sceneHeight = scene?.canvas?.clientHeight;
  const paramsFromSnapshot =
    isFiniteNumber(sceneWidth) && isFiniteNumber(sceneHeight)
      ? readMapLibrePlusElevationHashValuesFromSceneDescriptor({
          snapshot: snapshotForMapLibreProjection,
          viewportWidthPx: sceneWidth,
          viewportHeightPx: sceneHeight,
          defaultFovDeg,
          minPitchDeg,
          maxPitchDeg,
        })
      : null;

  const params: Record<string, number> = {
    lng: snapshot.anchor.lngDeg,
    lat: snapshot.anchor.latDeg,
  };
  if (includeAltitude) {
    params[altitudeKey] = snapshot.anchor.heightM;
  }

  if (paramsFromSnapshot) {
    if (isFiniteNumber(paramsFromSnapshot.zoom)) {
      params.zoom = paramsFromSnapshot.zoom;
    }
    if (isFiniteNumber(paramsFromSnapshot.bearing)) {
      params.bearing = paramsFromSnapshot.bearing;
    }
    if (isFiniteNumber(paramsFromSnapshot.pitch)) {
      params.pitch = paramsFromSnapshot.pitch;
    }
    if (isFiniteNumber(paramsFromSnapshot.fov)) {
      params.fov = paramsFromSnapshot.fov;
    } else if (
      isFiniteNumber(effectiveFovDeg) &&
      !isZeroish(effectiveFovDeg - defaultFovDeg)
    ) {
      params.fov = effectiveFovDeg;
    }
    return params;
  }

  if (!isZeroish(snapshot.orientation.bearingDeg)) {
    params.bearing = normalizeBearingDeg(snapshot.orientation.bearingDeg!);
  }

  if (!isZeroish(snapshot.orientation.pitchDeg)) {
    params.pitch = toMapLibrePitchDeg(
      snapshot.orientation.pitchDeg!,
      minPitchDeg,
      maxPitchDeg
    );
  }

  if (
    isFiniteNumber(effectiveFovDeg) &&
    !isZeroish(effectiveFovDeg - defaultFovDeg)
  ) {
    params.fov = effectiveFovDeg;
  }

  if (isFiniteNumber(zoom)) {
    params.zoom = zoom;
  }

  return params;
}

export const readMapLibreCompatHashParamsFromSceneAdapter =
  readMapLibreCompatHashParamsFromSceneDescriptor;

export type SceneDescriptorHashSyncCameraLike = CesiumCameraLike;
export type SceneDescriptorHashSyncSceneLike = CesiumSceneLike;

export { readSceneDescriptorHashSnapshotFromSceneState };
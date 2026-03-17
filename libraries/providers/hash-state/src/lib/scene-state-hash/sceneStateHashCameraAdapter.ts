import { mercatorZoomFromDistanceAtLatitudeDeg } from "@carma/geo/utils";
import type { SceneStateSnapshot } from "@carma/types";
import type { Meters, Radians } from "@carma/units/types";
import {
  DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
  DEFAULT_MAPLIBRE_FOV_DEG,
  DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
  DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  type MapLibreCompatHashParams,
  type SceneStateHashSnapshot,
} from "./sceneStateHashTypes";
import { readMapLibrePlusElevationHashValuesFromSceneState } from "./sceneStateHashMapLibreAdapter";
import type { CameraLike, SceneLike } from "./sceneStateHashCameraTypes";
import {
  isFiniteNumber,
  isZeroish,
  negativePiToPi,
  radToDegNumeric,
  zeroToTwoPi,
} from "./sceneStateHashHelpers";
import { toMapLibrePitchDeg } from "./sceneStateHashMapLibreAdapter";
import {
  readSceneStateHashSnapshotFromSceneState,
  type SceneStateAnchorMode,
} from "./sceneStateHashSceneAdapter";

const normalizeBearing = (rad: number): number =>
  zeroToTwoPi(rad as Radians) as number;

const MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;

const normalizeSigned = (rad: number): number => {
  const normalized = negativePiToPi(rad as Radians) as number;
  return normalized === -Math.PI ? Math.PI : normalized;
};

const readAspectRatio = (
  scene: SceneLike | null | undefined
): number | undefined => {
  const width = scene?.canvas?.clientWidth;
  const height = scene?.canvas?.clientHeight;
  if (!isFiniteNumber(width) || !isFiniteNumber(height) || height <= 0) {
    return undefined;
  }

  const aspect = width / height;
  return isFiniteNumber(aspect) && aspect > 0 ? aspect : undefined;
};

const readVerticalFovRad = ({
  camera,
  scene,
}: {
  camera?: CameraLike | null;
  scene?: SceneLike | null;
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
  camera: CameraLike | null | undefined,
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
  scene?: SceneLike | null;
  camera?: CameraLike | null;
  anchor: SceneStateHashSnapshot["anchor"];
}): number | undefined => {
  const canvasWidth = scene?.canvas?.clientWidth;
  const canvasHeight = scene?.canvas?.clientHeight;
  if (!isFiniteNumber(canvasWidth) || !isFiniteNumber(canvasHeight)) {
    return undefined;
  }

  const lineOfSightDistanceM =
    (sceneState ? readSceneStateOrbitDistanceM(sceneState) : undefined) ??
    (sceneState
      ? readFallbackAnchorDistanceM(sceneState, anchor.heightM)
      : undefined) ??
    readFallbackAnchorDistanceFromCameraM(camera, anchor.heightM);
  if (!isFiniteNumber(lineOfSightDistanceM) || lineOfSightDistanceM <= 0) {
    return undefined;
  }

  const fovVertical =
    sceneState?.camera.fovVertical ??
    readVerticalFovRad({
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
  camera: CameraLike,
  fallbackHeightM: number
): SceneStateHashSnapshot["anchor"] | null => {
  const position = camera.positionCartographic;
  if (!position) {
    return null;
  }

  const lngDeg = radToDegNumeric(position.longitude)!;
  const latDeg = radToDegNumeric(position.latitude)!;
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
  };
};

const sampleScreenCenterAnchor = (
  scene: SceneLike,
  camera: CameraLike,
  fallbackHeightM: number
): SceneStateHashSnapshot["anchor"] | null => {
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

  const lngDeg = radToDegNumeric(pickedCartographic.longitude)!;
  const latDeg = radToDegNumeric(pickedCartographic.latitude)!;
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
  };
};

export const readSceneStateHashSnapshotFromCamera = ({
  camera,
  scene,
  anchorMode = "screen-center",
  fallbackHeightM = 200,
}: {
  camera: CameraLike;
  scene?: SceneLike | null;
  anchorMode?: SceneStateAnchorMode;
  fallbackHeightM?: number;
}): SceneStateHashSnapshot | null => {
  const anchor =
    anchorMode === "screen-center" && scene
      ? sampleScreenCenterAnchor(scene, camera, fallbackHeightM) ??
        readCameraPositionAnchor(camera, fallbackHeightM)
      : readCameraPositionAnchor(camera, fallbackHeightM);

  if (!anchor) {
    return null;
  }

  const orientation: SceneStateHashSnapshot["orientation"] = {};
  if (isFiniteNumber(camera.heading))
    orientation.bearingRad = normalizeBearing(camera.heading);
  if (isFiniteNumber(camera.pitch))
    orientation.pitchRad = normalizeSigned(camera.pitch);
  if (isFiniteNumber(camera.roll))
    orientation.rollRad = normalizeSigned(camera.roll);
  const fovVerticalRad = readVerticalFovRad({ camera, scene });
  if (isFiniteNumber(fovVerticalRad))
    orientation.fovVerticalRad = fovVerticalRad;
  if (anchorMode === "screen-center") {
    const rangeM = readFallbackAnchorDistanceFromCameraM(
      camera,
      anchor.heightM
    );
    if (isFiniteNumber(rangeM)) orientation.rangeM = rangeM;
  }

  return { anchor, orientation };
};

export function readMapLibreCompatHashParamsFromSceneState({
  snapshot,
  sceneState,
  scene,
  camera,
  includeAltitude = false,
  altitudeKey = DEFAULT_SCENE_STATE_ALTITUDE_HASH_KEY,
  defaultFovDeg = DEFAULT_MAPLIBRE_FOV_DEG,
  minPitchDeg = DEFAULT_MAPLIBRE_PITCH_MIN_DEG,
  maxPitchDeg = DEFAULT_MAPLIBRE_PITCH_MAX_DEG,
}: {
  snapshot: SceneStateHashSnapshot;
  sceneState?: SceneStateSnapshot | null;
  scene?: SceneLike | null;
  camera?: CameraLike | null;
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

  const cameraVerticalFovRad = readVerticalFovRad({
    camera,
    scene,
  });
  const effectiveFovRad =
    sceneState?.camera.fovVertical ??
    snapshot.orientation.fovVerticalRad ??
    cameraVerticalFovRad;
  const effectiveFovDeg = isFiniteNumber(effectiveFovRad)
    ? radToDegNumeric(effectiveFovRad)!
    : undefined;

  const snapshotForMapLibreProjection =
    isFiniteNumber(effectiveFovRad) &&
    (!isFiniteNumber(snapshot.orientation.fovVerticalRad) ||
      Math.abs(effectiveFovRad - snapshot.orientation.fovVerticalRad) > 1e-9)
      ? {
          ...snapshot,
          orientation: {
            ...snapshot.orientation,
            fovVerticalRad: effectiveFovRad,
          },
        }
      : snapshot;

  const sceneWidth = scene?.canvas?.clientWidth;
  const sceneHeight = scene?.canvas?.clientHeight;
  const paramsFromSnapshot =
    isFiniteNumber(sceneWidth) && isFiniteNumber(sceneHeight)
      ? readMapLibrePlusElevationHashValuesFromSceneState({
          snapshot: snapshotForMapLibreProjection,
          viewportWidthPx: sceneWidth,
          viewportHeightPx: sceneHeight,
          options: {
            defaultFovDeg,
            minPitchDeg,
            maxPitchDeg,
          },
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

  const bearingDeg = isFiniteNumber(snapshot.orientation.bearingRad)
    ? radToDegNumeric(snapshot.orientation.bearingRad)!
    : undefined;
  if (!isZeroish(bearingDeg)) {
    params.bearing = bearingDeg!;
  }

  const pitchDeg = isFiniteNumber(snapshot.orientation.pitchRad)
    ? radToDegNumeric(snapshot.orientation.pitchRad)!
    : undefined;
  if (!isZeroish(pitchDeg)) {
    params.pitch = toMapLibrePitchDeg(pitchDeg!, {
      minPitchDeg,
      maxPitchDeg,
    });
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

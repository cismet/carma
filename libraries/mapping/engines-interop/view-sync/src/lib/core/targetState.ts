import { isFiniteNumber, PI_OVER_TWO } from "@carma/math";
import type {
  CameraLike,
  SceneLike,
  SceneState,
} from "@carma-mapping/engines/cesium/api";
import type { Radians, Meters } from "@carma/units/types";
import type { ViewState } from "./types";

// Cesium HeadingPitchRange pitch is measured from the local EN plane:
// -PI/2 = nadir, 0 = horizon. The shared view-sync pitch uses the MapLibre-style
// orbit convention: 0 = nadir, +PI/2 = horizon.
export const toViewSyncPitchFromCesiumPitch = (cesiumPitch: number): Radians =>
  (cesiumPitch + PI_OVER_TWO) as Radians;

export const toCesiumPitchFromViewSyncPitch = (
  viewSyncPitch: number
): Radians => (viewSyncPitch - PI_OVER_TWO) as Radians;

export const readViewSyncVerticalFov = (
  target: Pick<ViewState, "fovVertical" | "fovHorizontal">
): Radians | null => {
  if (isFiniteNumber(target.fovVertical)) {
    return target.fovVertical as Radians;
  }

  return null;
};

export const readViewSyncHorizontalFov = (
  target: Pick<ViewState, "fovVertical" | "fovHorizontal">
): Radians | null => {
  if (isFiniteNumber(target.fovHorizontal)) {
    return target.fovHorizontal as Radians;
  }

  return null;
};

export const readVerticalFovRad = (
  camera?: CameraLike | null,
  scene?: SceneLike | null
): number | undefined => {
  const frustum = camera?.frustum;
  if (isFiniteNumber(frustum?.fovy) && frustum.fovy > 0) {
    return frustum.fovy;
  }

  if (!isFiniteNumber(frustum?.fov) || frustum.fov <= 0) {
    return undefined;
  }

  const viewportWidthPx = scene?.canvas?.clientWidth;
  const viewportHeightPx = scene?.canvas?.clientHeight;
  const aspect =
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportHeightPx > 0
      ? viewportWidthPx / viewportHeightPx
      : undefined;

  if (isFiniteNumber(aspect) && aspect > 1) {
    return Math.atan(Math.tan(frustum.fov * 0.5) / aspect) * 2;
  }

  return frustum.fov;
};

const MIN_RANGE_M = 0.01;

const readLineOfSightDistance = (sceneState: SceneState): number | null => {
  const orbitPoint = sceneState.orbitPoint?.worldPosition;
  const camera = sceneState.camera.worldPosition;
  if (!orbitPoint) {
    return null;
  }

  const distance = Math.hypot(
    camera.x - orbitPoint.x,
    camera.y - orbitPoint.y,
    camera.z - orbitPoint.z
  );
  return isFiniteNumber(distance) && distance >= MIN_RANGE_M ? distance : null;
};

export const readViewStateFromSceneState = (
  sceneState: SceneState | null | undefined
): ViewState | null => {
  const objectCentricPose = sceneState?.camera.cameraModel?.pose;
  const intrinsics = sceneState?.camera.cameraModel?.intrinsics;

  const hasObjectCentricPose =
    !!objectCentricPose &&
    !!objectCentricPose.anchor &&
    isFiniteNumber(objectCentricPose.anchor.longitude) &&
    isFiniteNumber(objectCentricPose.anchor.latitude) &&
    isFiniteNumber(objectCentricPose.anchor.altitude) &&
    isFiniteNumber(objectCentricPose.bearing) &&
    isFiniteNumber(objectCentricPose.pitch) &&
    isFiniteNumber(objectCentricPose.range);

  const anchor = hasObjectCentricPose
    ? objectCentricPose.anchor
    : sceneState?.orbitPoint?.cartographic;
  const bearing = hasObjectCentricPose
    ? objectCentricPose.bearing
    : sceneState?.camera.bearingRad;
  const pitch = hasObjectCentricPose
    ? objectCentricPose.pitch
    : isFiniteNumber(sceneState?.camera.pitchRad)
    ? toViewSyncPitchFromCesiumPitch(sceneState.camera.pitchRad)
    : sceneState?.camera.pitchRad;
  const rangeM = hasObjectCentricPose
    ? objectCentricPose.range
    : sceneState
    ? readLineOfSightDistance(sceneState)
    : null;

  if (
    !anchor ||
    !isFiniteNumber(anchor.longitude) ||
    !isFiniteNumber(anchor.latitude) ||
    !isFiniteNumber(anchor.altitude) ||
    !isFiniteNumber(bearing) ||
    !isFiniteNumber(pitch) ||
    !isFiniteNumber(rangeM)
  ) {
    return null;
  }

  return {
    longitude: anchor.longitude,
    latitude: anchor.latitude,
    altitude: anchor.altitude as Meters,
    bearing: bearing as Radians,
    pitch: pitch as Radians,
    ...(isFiniteNumber(objectCentricPose?.roll)
      ? { roll: objectCentricPose.roll as Radians }
      : isFiniteNumber(sceneState.camera.rollRad)
      ? { roll: sceneState.camera.rollRad as Radians }
      : {}),
    range: rangeM as Meters,
    ...(isFiniteNumber(intrinsics?.fov)
      ? { fovVertical: intrinsics.fov as Radians }
      : {}),
    ...(isFiniteNumber(intrinsics?.fovHorizontal)
      ? { fovHorizontal: intrinsics.fovHorizontal as Radians }
      : {}),
    ...(sceneState.camera.cameraModel
      ? {
          cameraModel:
            sceneState.camera.cameraModel as unknown as ViewState["cameraModel"],
        }
      : {}),
    };
};

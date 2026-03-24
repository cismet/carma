import { isFiniteNumber, PI_OVER_TWO } from "@carma/math";
import { getZoomFromPixelResolutionAtLatitudeRad } from "@carma/geo/utils";
import type { CameraLike, SceneLike } from "@carma-mapping/engines/cesium/api";
import type { Radians, Meters } from "@carma/units/types";
import { readMetersPerCssPixel } from "../adapters/sharedProjection";
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

export const readViewSyncLongerEdgeFov = (
  target: Pick<ViewState, "fovVertical" | "fovHorizontal" | "fovLongerEdge">
): Radians | null => {
  if (isFiniteNumber(target.fovLongerEdge)) {
    return target.fovLongerEdge as Radians;
  }

  const finiteCandidates = [target.fovVertical, target.fovHorizontal].filter(
    isFiniteNumber
  ) as number[];

  if (finiteCandidates.length === 0) {
    return null;
  }

  return Math.max(...finiteCandidates) as Radians;
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

export const readLongerEdgeFovRad = (
  camera?: CameraLike | null,
  scene?: SceneLike | null
): number | undefined => {
  const frustum = camera?.frustum;
  if (isFiniteNumber(frustum?.fov) && frustum.fov > 0) {
    return frustum.fov;
  }

  return readVerticalFovRad(camera, scene);
};

const MIN_RANGE_M = 0.01;
const CANONICAL_MAPLIBRE_TILE_SIZE_PX = 512;

type Vec3Like = {
  x: number;
  y: number;
  z: number;
};

type CartographicLike = {
  longitude?: number;
  latitude?: number;
  altitude?: number;
};

type CameraModelPoseLike = {
  anchor?: CartographicLike;
  bearing?: number;
  pitch?: number;
  range?: number;
  roll?: number;
};

type CameraModelIntrinsicsLike = {
  fov?: number;
  fovHorizontal?: number;
};

type CameraModelLike = {
  pose?: CameraModelPoseLike;
  intrinsics?: CameraModelIntrinsicsLike;
};

// Structural shape so callers from both cesium/api and react/scene-state can use this helper.
type SceneStateLike = {
  camera: {
    worldPosition: Vec3Like;
    bearingRad?: number;
    pitchRad?: number;
    rollRad?: number;
    cameraModel?: CameraModelLike;
  };
  orbitPoint?: {
    worldPosition?: Vec3Like;
    cartographic?: CartographicLike;
  } | null;
};

const readLineOfSightDistance = (sceneState: SceneStateLike): number | null => {
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
  sceneState: SceneStateLike | null | undefined,
  scene?: SceneLike | null
): ViewState | null => {
  const sceneCamera = sceneState?.camera;
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

  const viewportWidthPx = scene?.canvas?.clientWidth;
  const viewportHeightPx = scene?.canvas?.clientHeight;
  const hasViewportDimensions =
    isFiniteNumber(viewportWidthPx) &&
    isFiniteNumber(viewportHeightPx) &&
    viewportWidthPx > 0 &&
    viewportHeightPx > 0;
  const resolvedFovVertical =
    readVerticalFovRad(scene?.camera, scene) ??
    (isFiniteNumber(intrinsics?.fov) ? intrinsics.fov : null);
  const resolvedFovLongerEdge =
    readLongerEdgeFovRad(scene?.camera, scene) ??
    (() => {
      const finiteCandidates = [
        intrinsics?.fov,
        intrinsics?.fovHorizontal,
      ].filter(isFiniteNumber) as number[];
      return finiteCandidates.length > 0 ? Math.max(...finiteCandidates) : null;
    })();
  const metersPerCssPixel =
    hasViewportDimensions &&
    isFiniteNumber(resolvedFovLongerEdge) &&
    isFiniteNumber(rangeM)
      ? readMetersPerCssPixel({
          rangeM,
          fovRad: resolvedFovLongerEdge,
          viewportWidthPx,
          viewportHeightPx,
        })
      : null;
  const zoom =
    isFiniteNumber(metersPerCssPixel) && isFiniteNumber(anchor.latitude)
      ? getZoomFromPixelResolutionAtLatitudeRad(
          metersPerCssPixel as Meters,
          anchor.latitude as Radians,
          { tileSize: CANONICAL_MAPLIBRE_TILE_SIZE_PX }
        )
      : null;

  return {
    longitude: anchor.longitude as Radians,
    latitude: anchor.latitude as Radians,
    altitude: anchor.altitude as Meters,
    bearing: bearing as Radians,
    pitch: pitch as Radians,
    ...(isFiniteNumber(objectCentricPose?.roll)
      ? { roll: objectCentricPose.roll as Radians }
      : isFiniteNumber(sceneCamera?.rollRad)
      ? { roll: sceneCamera.rollRad as Radians }
      : {}),
    ...(isFiniteNumber(zoom) ? { zoom } : {}),
    range: rangeM as Meters,
    ...(isFiniteNumber(resolvedFovVertical)
      ? { fovVertical: resolvedFovVertical as Radians }
      : {}),
    ...(isFiniteNumber(resolvedFovLongerEdge)
      ? { fovLongerEdge: resolvedFovLongerEdge as Radians }
      : {}),
    ...(isFiniteNumber(intrinsics?.fovHorizontal)
      ? { fovHorizontal: intrinsics.fovHorizontal as Radians }
      : {}),
    ...(sceneCamera?.cameraModel
      ? {
          cameraModel:
            sceneCamera.cameraModel as unknown as ViewState["cameraModel"],
        }
      : {}),
  };
};

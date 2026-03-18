import { isFiniteNumber } from "@carma/math";
import type { SceneState } from "./sceneState";
import type { Radians } from "@carma/units/types";
import { negativePiToPi, zeroToTwoPi } from "@carma/units/helpers";
import type { CameraLike, SceneLike } from "./sceneStateTypes";

export const DEFAULT_MIN_LINE_OF_SIGHT_DISTANCE_M = 0.01;

export const normalizeBearingRad = (rad: number): number =>
  zeroToTwoPi(rad as Radians) as number;

export const normalizeSignedRad = (rad: number): number => {
  const normalized = negativePiToPi(rad as Radians) as number;
  return normalized === -Math.PI ? Math.PI : normalized;
};

export const coerceFiniteNumber = (value: unknown): number | undefined => {
  if (isFiniteNumber(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return isFiniteNumber(parsed) ? parsed : undefined;
  }

  return undefined;
};

export const readAbsoluteHeightDeltaDistanceM = (
  cameraHeightM: number | null | undefined,
  anchorHeightM: number,
  minDistanceM: number = DEFAULT_MIN_LINE_OF_SIGHT_DISTANCE_M
): number | undefined => {
  if (!isFiniteNumber(cameraHeightM)) {
    return undefined;
  }

  return Math.max(Math.abs(cameraHeightM - anchorHeightM), minDistanceM);
};

export const readSceneStateOrbitDistanceM = (
  sceneState: SceneState,
  minDistanceM: number = DEFAULT_MIN_LINE_OF_SIGHT_DISTANCE_M
): number | undefined => {
  const cameraPosition = sceneState.camera.worldPosition;
  const orbitPosition = sceneState.orbitPoint?.worldPosition;
  if (!orbitPosition) {
    return undefined;
  }

  const distance = Math.hypot(
    cameraPosition.x - orbitPosition.x,
    cameraPosition.y - orbitPosition.y,
    cameraPosition.z - orbitPosition.z
  );

  return isFiniteNumber(distance)
    ? Math.max(distance, minDistanceM)
    : undefined;
};

export const readAspectRatioFromViewport = (
  viewportWidthPx: number | null | undefined,
  viewportHeightPx: number | null | undefined
): number | undefined => {
  if (
    !isFiniteNumber(viewportWidthPx) ||
    !isFiniteNumber(viewportHeightPx) ||
    viewportHeightPx <= 0
  ) {
    return undefined;
  }

  const aspect = viewportWidthPx / viewportHeightPx;
  return isFiniteNumber(aspect) && aspect > 0 ? aspect : undefined;
};

export const readAspectRatioFromScene = (
  scene: SceneLike | null | undefined
): number | undefined => {
  return readAspectRatioFromViewport(
    scene?.canvas?.clientWidth,
    scene?.canvas?.clientHeight
  );
};

export const readVerticalFovRadFromHorizontal = (
  horizontalFovRad: number,
  aspect: number | null | undefined
): number | undefined => {
  if (!isFiniteNumber(horizontalFovRad) || horizontalFovRad <= 0) {
    return undefined;
  }

  if (isFiniteNumber(aspect) && aspect > 1) {
    return Math.atan(Math.tan(horizontalFovRad * 0.5) / aspect) * 2;
  }

  return horizontalFovRad;
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

  return readVerticalFovRadFromHorizontal(
    frustum.fov,
    readAspectRatioFromScene(scene)
  );
};

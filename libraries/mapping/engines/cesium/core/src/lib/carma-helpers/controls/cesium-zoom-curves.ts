import {
  readFovFromLogTanHalfFov,
  readLogTanHalfFov,
  readLongerEdgeFovFromIntrinsics,
  readVerticalFovFromLongerEdge,
} from "@carma-commons/camera/model";
import {
  Easing,
  readTimedInterpolationEasedProgress,
  readTimedInterpolationProgress,
} from "@carma-commons/math";
import { PerspectiveFrustum, type Scene } from "@carma-cesium";
import type { Radians } from "@carma-units";

import { readPerspectiveFrustumLongerEdgeFov } from "../camera";

export const DEFAULT_CESIUM_ZOOM_EASING = Easing.CUBIC_OUT;

export type TimedCesiumFovCurve = {
  startedAtMs: number;
  durationMs: number;
  easing?: (time: number) => number;
  startFovRad: number;
  targetFovRad: number;
  startLongerEdgeFovRad: number | null;
  targetLongerEdgeFovRad: number | null;
  startLogTanHalfLongerEdgeFov: number | null;
  targetLogTanHalfLongerEdgeFov: number | null;
};

export const readSceneAspectRatio = (scene: Scene): number | null => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const frustumAspectRatio = scene.camera.frustum.aspectRatio;
  if (
    typeof frustumAspectRatio === "number" &&
    Number.isFinite(frustumAspectRatio) &&
    frustumAspectRatio > 0
  ) {
    return frustumAspectRatio;
  }

  const width = scene.canvas?.clientWidth;
  const height = scene.canvas?.clientHeight;
  return typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0
    ? width / height
    : null;
};

export const buildTimedCesiumFovCurve = ({
  scene,
  startedAtMs,
  durationMs,
  easing,
  startFovRad,
  targetFovRad,
}: {
  scene: Scene;
  startedAtMs: number;
  durationMs: number;
  easing?: (time: number) => number;
  startFovRad: number;
  targetFovRad: number;
}): TimedCesiumFovCurve => {
  const aspectRatio = readSceneAspectRatio(scene);
  const startLongerEdgeFov =
    aspectRatio !== null
      ? readLongerEdgeFovFromIntrinsics(
          {
            fov: startFovRad as Radians,
          },
          { aspect: aspectRatio }
        )
      : undefined;
  const targetLongerEdgeFov =
    aspectRatio !== null
      ? readLongerEdgeFovFromIntrinsics(
          {
            fov: targetFovRad as Radians,
          },
          { aspect: aspectRatio }
        )
      : undefined;

  return {
    startedAtMs,
    durationMs,
    easing,
    startFovRad,
    targetFovRad,
    startLongerEdgeFovRad:
      typeof startLongerEdgeFov === "number" ? startLongerEdgeFov : null,
    targetLongerEdgeFovRad:
      typeof targetLongerEdgeFov === "number" ? targetLongerEdgeFov : null,
    startLogTanHalfLongerEdgeFov:
      typeof startLongerEdgeFov === "number"
        ? readLogTanHalfFov(startLongerEdgeFov)
        : null,
    targetLogTanHalfLongerEdgeFov:
      typeof targetLongerEdgeFov === "number"
        ? readLogTanHalfFov(targetLongerEdgeFov)
        : null,
  };
};

export const readCurrentCesiumLongerEdgeFov = ({
  scene,
  curve,
  nowMs,
}: {
  scene: Scene;
  curve?: TimedCesiumFovCurve | null;
  nowMs: number;
}): number | null => {
  if (curve) {
    return readTimedCesiumLongerEdgeFov({ curve, nowMs });
  }

  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  return readPerspectiveFrustumLongerEdgeFov(scene.camera.frustum) ?? null;
};

export const readTimedCesiumAnimationProgress = ({
  startedAtMs,
  durationMs,
  nowMs,
}: {
  startedAtMs: number;
  durationMs: number;
  nowMs: number;
}) =>
  readTimedInterpolationProgress({
    startedAtMs,
    durationMs,
    nowMs,
  });

export const readTimedCesiumVerticalFov = ({
  scene,
  curve,
  nowMs,
}: {
  scene: Scene;
  curve: TimedCesiumFovCurve;
  nowMs: number;
}): number | null => {
  const interpolatedLongerEdgeFov = readTimedCesiumLongerEdgeFov({
    curve,
    nowMs,
  });
  const currentAspectRatio = readSceneAspectRatio(scene);

  if (
    typeof interpolatedLongerEdgeFov === "number" &&
    currentAspectRatio !== null
  ) {
    const interpolatedVerticalFov = readVerticalFovFromLongerEdge(
      interpolatedLongerEdgeFov,
      currentAspectRatio
    );
    return typeof interpolatedVerticalFov === "number"
      ? interpolatedVerticalFov
      : null;
  }

  const easedProgress = readTimedInterpolationEasedProgress({
    startedAtMs: curve.startedAtMs,
    durationMs: curve.durationMs,
    nowMs,
    easing: curve.easing ?? DEFAULT_CESIUM_ZOOM_EASING,
  });
  if (easedProgress === null) {
    return null;
  }

  return (
    curve.startFovRad + (curve.targetFovRad - curve.startFovRad) * easedProgress
  );
};

export const readTimedCesiumLongerEdgeFov = ({
  curve,
  nowMs,
}: {
  curve: TimedCesiumFovCurve;
  nowMs: number;
}): number | null => {
  const easedProgress = readTimedInterpolationEasedProgress({
    startedAtMs: curve.startedAtMs,
    durationMs: curve.durationMs,
    nowMs,
    easing: curve.easing ?? DEFAULT_CESIUM_ZOOM_EASING,
  });
  if (easedProgress === null) {
    return null;
  }

  if (
    typeof curve.startLogTanHalfLongerEdgeFov === "number" &&
    typeof curve.targetLogTanHalfLongerEdgeFov === "number"
  ) {
    const interpolatedLogTanHalfLongerEdgeFov =
      curve.startLogTanHalfLongerEdgeFov +
      (curve.targetLogTanHalfLongerEdgeFov -
        curve.startLogTanHalfLongerEdgeFov) *
        easedProgress;
    const interpolatedLongerEdgeFovRad = readFovFromLogTanHalfFov(
      interpolatedLogTanHalfLongerEdgeFov
    );
    return typeof interpolatedLongerEdgeFovRad === "number"
      ? interpolatedLongerEdgeFovRad
      : null;
  }

  if (
    typeof curve.startLongerEdgeFovRad === "number" &&
    typeof curve.targetLongerEdgeFovRad === "number"
  ) {
    return (
      curve.startLongerEdgeFovRad +
      (curve.targetLongerEdgeFovRad - curve.startLongerEdgeFovRad) *
        easedProgress
    );
  }

  return null;
};

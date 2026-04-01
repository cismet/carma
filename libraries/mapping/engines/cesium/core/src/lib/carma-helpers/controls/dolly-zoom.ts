import {
  readDollyCompensatedRange,
  interpolateDollyCompensatedRange,
  readLongerEdgeFovFromIntrinsics,
} from "@carma-commons/camera/model";
import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  PerspectiveFrustum,
  type Scene,
} from "@carma-cesium";
import {
  clamp,
  readTimedInterpolationEasedProgress,
} from "@carma-commons/math";
import type { Radians } from "@carma-units";

import { writePerspectiveFrustumVerticalFov } from "../camera";
import {
  endCesiumAdaptiveRenderScaleActivity,
  beginCesiumAdaptiveRenderScaleActivity,
} from "./adaptive-render-scale";
import { cancelCesiumSceneTravelZoom } from "./travel-zoom";
import {
  buildTimedCesiumFovCurve,
  DEFAULT_CESIUM_ZOOM_EASING,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import { cancelCesiumSceneFovZoom } from "./fov-zoom";
import {
  readCesiumSceneZoomState,
  readCesiumSceneZoomTargetFov,
} from "./scene-zoom-state";
import {
  CESIUM_PRE_RENDER_STOP_REASONS,
  startCesiumPreRenderTimeline,
} from "./scene-runtime";
import type { CesiumTransitionLifecycle } from "./transition-lifecycle";
const DOLLY_ZOOM_RENDER_SCALE_ACTIVITY_KEY = "dolly-zoom";

type ActiveCesiumSceneDollyZoom = {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
  startedAtMs: number;
  durationMs: number;
  targetPoint: Cartesian3;
  startHeadingRad: number;
  targetHeadingRad: number;
  startPitchRad: number;
  targetPitchRad: number;
  startRangeM: number;
  targetRangeM: number;
  minimumRangeM: number;
  curve: TimedCesiumFovCurve;
} & CesiumTransitionLifecycle & {
    settled: boolean;
    started: boolean;
  };

const cesiumSceneDollyZoomAnimations = new WeakMap<
  Scene,
  ActiveCesiumSceneDollyZoom
>();

export const readCesiumSceneDollyZoomTargetRange = (
  scene: Scene,
  targetFovRad: number,
  {
    minimumRangeM = 0.01,
  }: {
    minimumRangeM?: number;
  } = {}
) => {
  const currentState = readCesiumSceneZoomState(scene, performance.now());
  if (!currentState) {
    return null;
  }
  const targetLongerEdgeFov = readLongerEdgeFovFromIntrinsics(
    {
      fov: targetFovRad as Radians,
    },
    {
      viewportWidthPx: scene.canvas?.clientWidth,
      viewportHeightPx: scene.canvas?.clientHeight,
    }
  );

  if (
    typeof targetLongerEdgeFov !== "number" ||
    !Number.isFinite(targetLongerEdgeFov)
  ) {
    return null;
  }

  return readDollyCompensatedRange({
    currentRangeM: currentState.currentRangeM,
    currentFovRad: currentState.currentLongerEdgeFovRad,
    targetFovRad: targetLongerEdgeFov,
    minRangeM: minimumRangeM,
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
};

export const cancelCesiumSceneDollyZoom = (scene: Scene) => {
  const activeAnimation = cesiumSceneDollyZoomAnimations.get(scene);
  if (!activeAnimation) {
    return;
  }

  if (activeAnimation.removePreRenderListener) {
    activeAnimation.removePreRenderListener();
    activeAnimation.removePreRenderListener = null;
  }

  activeAnimation.renderRequested = false;
  cesiumSceneDollyZoomAnimations.delete(scene);
  endCesiumAdaptiveRenderScaleActivity(
    scene,
    DOLLY_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );

  try {
    scene.camera.lookAtTransform(Matrix4.IDENTITY);
  } catch {
    // Ignore transient teardown races.
  }

  if (!activeAnimation.settled) {
    activeAnimation.settled = true;
    activeAnimation.onCanceled?.();
  }
};

export const animateCesiumSceneDollyZoom = (
  scene: Scene,
  {
    targetFovRad,
    targetRangeM,
    targetPoint,
    targetHeadingRad,
    targetPitchRad,
    durationMs = 500,
    minimumFovRad,
    maximumFovRad,
    minimumRangeM = 0.01,
    onStarted,
    onCompleted,
    onCanceled,
  }: CesiumTransitionLifecycle & {
    targetFovRad?: number;
    targetRangeM?: number;
    targetPoint?: Cartesian3 | null;
    targetHeadingRad?: number;
    targetPitchRad?: number;
    durationMs?: number;
    minimumFovRad?: number;
    maximumFovRad?: number;
    minimumRangeM?: number;
  }
): boolean => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return false;
  }

  const nowMs = performance.now();
  const currentState = readCesiumSceneZoomState(scene, nowMs, {
    targetPoint,
  });
  if (!currentState) {
    return false;
  }

  const resolvedTargetPoint = currentState.targetPoint;
  const startFovRad = currentState.currentVerticalFovRad;
  const startRangeM = currentState.currentRangeM;

  const resolvedTargetFovRad =
    typeof targetFovRad === "number" && Number.isFinite(targetFovRad)
      ? typeof minimumFovRad === "number" &&
        Number.isFinite(minimumFovRad) &&
        typeof maximumFovRad === "number" &&
        Number.isFinite(maximumFovRad)
        ? clamp(targetFovRad, minimumFovRad, maximumFovRad)
        : targetFovRad
      : typeof targetRangeM === "number" &&
        Number.isFinite(targetRangeM) &&
        typeof minimumFovRad === "number" &&
        Number.isFinite(minimumFovRad) &&
        typeof maximumFovRad === "number" &&
        Number.isFinite(maximumFovRad)
      ? readCesiumSceneZoomTargetFov(scene, targetRangeM, {
          minimumFovRad,
          maximumFovRad,
        })
      : null;

  const resolvedTargetRangeM =
    typeof targetRangeM === "number" && Number.isFinite(targetRangeM)
      ? Math.max(targetRangeM, minimumRangeM)
      : typeof resolvedTargetFovRad === "number" &&
        Number.isFinite(resolvedTargetFovRad)
      ? readCesiumSceneDollyZoomTargetRange(scene, resolvedTargetFovRad, {
          minimumRangeM,
        })
      : null;

  if (
    typeof resolvedTargetFovRad !== "number" ||
    !Number.isFinite(resolvedTargetFovRad) ||
    typeof resolvedTargetRangeM !== "number" ||
    !Number.isFinite(resolvedTargetRangeM)
  ) {
    return false;
  }

  const resolvedDurationMs =
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? durationMs
      : 0;

  const nextAnimation: ActiveCesiumSceneDollyZoom = {
    removePreRenderListener: null,
    renderRequested: false,
    startedAtMs: nowMs,
    durationMs: resolvedDurationMs,
    targetPoint: resolvedTargetPoint,
    startHeadingRad: scene.camera.heading,
    targetHeadingRad:
      typeof targetHeadingRad === "number" && Number.isFinite(targetHeadingRad)
        ? targetHeadingRad
        : scene.camera.heading,
    startPitchRad: scene.camera.pitch,
    targetPitchRad:
      typeof targetPitchRad === "number" && Number.isFinite(targetPitchRad)
        ? targetPitchRad
        : scene.camera.pitch,
    startRangeM,
    targetRangeM: resolvedTargetRangeM,
    minimumRangeM,
    curve: buildTimedCesiumFovCurve({
      scene,
      startedAtMs: nowMs,
      durationMs: resolvedDurationMs,
      startFovRad,
      targetFovRad: resolvedTargetFovRad,
    }),
    onStarted,
    onCompleted,
    onCanceled,
    settled: false,
    started: false,
  };

  const applyState = (frameNowMs: number, easedProgress: number) => {
    const nextVerticalFov =
      readTimedCesiumVerticalFov({
        scene,
        curve: nextAnimation.curve,
        nowMs: frameNowMs,
      }) ?? nextAnimation.curve.targetFovRad;
    const compensatedStartFov =
      typeof nextAnimation.curve.startLongerEdgeFovRad === "number"
        ? nextAnimation.curve.startLongerEdgeFovRad
        : nextAnimation.curve.startFovRad;
    const compensatedTargetFov =
      typeof nextAnimation.curve.targetLongerEdgeFovRad === "number"
        ? nextAnimation.curve.targetLongerEdgeFovRad
        : nextAnimation.curve.targetFovRad;
    const nextRangeM =
      interpolateDollyCompensatedRange({
        startRangeM: nextAnimation.startRangeM,
        startFovRad: compensatedStartFov,
        targetFovRad: compensatedTargetFov,
        progress: easedProgress,
        minRangeM: nextAnimation.minimumRangeM,
        viewportWidthPx: scene.canvas?.clientWidth,
        viewportHeightPx: scene.canvas?.clientHeight,
      }) ?? nextAnimation.targetRangeM;
    const nextHeadingRad =
      nextAnimation.startHeadingRad +
      (nextAnimation.targetHeadingRad - nextAnimation.startHeadingRad) *
        easedProgress;
    const nextPitchRad =
      nextAnimation.startPitchRad +
      (nextAnimation.targetPitchRad - nextAnimation.startPitchRad) *
        easedProgress;

    scene.camera.lookAt(
      nextAnimation.targetPoint,
      new HeadingPitchRange(nextHeadingRad, nextPitchRad, nextRangeM)
    );

    try {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races.
    }

    if (scene.camera.frustum instanceof PerspectiveFrustum) {
      writePerspectiveFrustumVerticalFov(scene.camera.frustum, nextVerticalFov);
    }
  };

  if (resolvedDurationMs <= 0) {
    cancelCesiumSceneFovZoom(scene);
    cancelCesiumSceneTravelZoom(scene);
    cancelCesiumSceneDollyZoom(scene);
    onStarted?.();
    applyState(nowMs, 1);
    scene.requestRender();
    onCompleted?.();
    return true;
  }

  cancelCesiumSceneFovZoom(scene);
  cancelCesiumSceneTravelZoom(scene);
  cancelCesiumSceneDollyZoom(scene);
  cesiumSceneDollyZoomAnimations.set(scene, nextAnimation);
  if (!nextAnimation.started) {
    nextAnimation.started = true;
    nextAnimation.onStarted?.();
  }
  beginCesiumAdaptiveRenderScaleActivity(
    scene,
    DOLLY_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );

  const finish = (commitFinalState: boolean) => {
    if (nextAnimation.removePreRenderListener) {
      nextAnimation.removePreRenderListener();
      nextAnimation.removePreRenderListener = null;
    }

    nextAnimation.renderRequested = false;
    cesiumSceneDollyZoomAnimations.delete(scene);
    endCesiumAdaptiveRenderScaleActivity(
      scene,
      DOLLY_ZOOM_RENDER_SCALE_ACTIVITY_KEY
    );

    if (commitFinalState) {
      applyState(performance.now(), 1);
    }

    try {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    } catch {
      // Ignore transient teardown races.
    }

    scene.requestRender();

    if (!nextAnimation.settled) {
      nextAnimation.settled = true;
      if (commitFinalState) {
        nextAnimation.onCompleted?.();
      } else {
        nextAnimation.onCanceled?.();
      }
    }
  };

  startCesiumPreRenderTimeline(scene, nextAnimation, {
    startedAtMs: nextAnimation.startedAtMs,
    durationMs: nextAnimation.durationMs,
    onStep: ({ nowMs, progress }) => {
      const easedProgress =
        readTimedInterpolationEasedProgress({
          startedAtMs: nextAnimation.startedAtMs,
          durationMs: nextAnimation.durationMs,
          nowMs,
          easing: DEFAULT_CESIUM_ZOOM_EASING,
        }) ?? 1;

      applyState(nowMs, easedProgress);

      return progress < 1
        ? undefined
        : CESIUM_PRE_RENDER_STOP_REASONS.COMPLETED;
    },
    onStop: (reason) => {
      finish(reason === CESIUM_PRE_RENDER_STOP_REASONS.COMPLETED);
    },
  });
  return true;
};

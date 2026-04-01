import { readVerticalFovFromLongerEdge } from "@carma-commons/camera/model";
import { PerspectiveFrustum, type Scene } from "@carma-cesium";

import {
  readPerspectiveFrustumVerticalFov,
  writePerspectiveFrustumVerticalFov,
} from "../camera";
import {
  beginCesiumAdaptiveRenderScaleActivity,
  endCesiumAdaptiveRenderScaleActivity,
} from "./adaptive-render-scale";
import {
  buildTimedCesiumFovCurve,
  readCurrentCesiumLongerEdgeFov,
  readSceneAspectRatio,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import {
  clearCesiumSceneActiveFovCurve,
  computeNextCesiumSceneFov,
  setCesiumSceneActiveFovCurve,
} from "./scene-zoom-state";
import {
  CESIUM_PRE_RENDER_STOP_REASONS,
  startCesiumPreRenderTimeline,
} from "./scene-runtime";
import type { CesiumTransitionLifecycle } from "./transition-lifecycle";

const FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY = "fov-zoom";

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

type ActiveCesiumFovZoom = {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
  curve: TimedCesiumFovCurve;
} & CesiumTransitionLifecycle & {
    settled: boolean;
    started: boolean;
  };

const cesiumFovZoomAnimations = new WeakMap<Scene, ActiveCesiumFovZoom>();

export const computeNextCesiumFov = (
  scene: Scene,
  direction: "in" | "out",
  {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    currentVerticalFovRadOverride,
  }: {
    zoomDelta?: number;
    minimumFovRad: number;
    maximumFovRad: number;
    currentVerticalFovRadOverride?: number;
  }
) =>
  computeNextCesiumSceneFov(scene, direction, {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    currentVerticalFovRadOverride,
  });

export const cancelCesiumSceneFovZoom = (scene: Scene) => {
  const activeAnimation = cesiumFovZoomAnimations.get(scene);
  if (!activeAnimation) {
    clearCesiumSceneActiveFovCurve(scene);
    return;
  }

  if (activeAnimation.removePreRenderListener) {
    activeAnimation.removePreRenderListener();
    activeAnimation.removePreRenderListener = null;
  }

  activeAnimation.renderRequested = false;
  cesiumFovZoomAnimations.delete(scene);
  clearCesiumSceneActiveFovCurve(scene);
  endCesiumAdaptiveRenderScaleActivity(
    scene,
    FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );
  if (!activeAnimation.settled) {
    activeAnimation.settled = true;
    activeAnimation.onCanceled?.();
  }
};

export const animateCesiumFov = (
  scene: Scene,
  targetFovRad: number,
  durationMs: number,
  callbacks: CesiumTransitionLifecycle = {}
) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return () => {};
  }

  const nowMs = performance.now();
  const activeAnimation = cesiumFovZoomAnimations.get(scene);
  const startLongerEdgeFovRad = readCurrentCesiumLongerEdgeFov({
    scene,
    curve: activeAnimation?.curve,
    nowMs,
  });
  const aspectRatio = readSceneAspectRatio(scene);
  const startFovRad =
    isFiniteNumber(startLongerEdgeFovRad) && aspectRatio !== null
      ? readVerticalFovFromLongerEdge(startLongerEdgeFovRad, aspectRatio) ??
        null
      : activeAnimation
      ? readTimedCesiumVerticalFov({
          scene,
          curve: activeAnimation.curve,
          nowMs,
        }) ?? null
      : readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null;
  if (
    typeof startFovRad !== "number" ||
    !Number.isFinite(startFovRad) ||
    !Number.isFinite(targetFovRad) ||
    durationMs <= 0
  ) {
    callbacks.onStarted?.();
    writePerspectiveFrustumVerticalFov(scene.camera.frustum, targetFovRad);
    scene.requestRender();
    callbacks.onCompleted?.();
    return () => {};
  }

  cancelCesiumSceneFovZoom(scene);

  const nextAnimation: ActiveCesiumFovZoom = {
    removePreRenderListener: null,
    renderRequested: false,
    onStarted: callbacks.onStarted,
    onCompleted: callbacks.onCompleted,
    onCanceled: callbacks.onCanceled,
    settled: false,
    started: false,
    curve: buildTimedCesiumFovCurve({
      scene,
      startedAtMs: nowMs,
      durationMs,
      startFovRad,
      targetFovRad,
    }),
  };
  cesiumFovZoomAnimations.set(scene, nextAnimation);
  setCesiumSceneActiveFovCurve(scene, nextAnimation.curve);
  if (!nextAnimation.started) {
    nextAnimation.started = true;
    nextAnimation.onStarted?.();
  }
  beginCesiumAdaptiveRenderScaleActivity(
    scene,
    FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );

  startCesiumPreRenderTimeline(scene, nextAnimation, {
    startedAtMs: nextAnimation.curve.startedAtMs,
    durationMs: nextAnimation.curve.durationMs,
    onStep: ({ nowMs, progress }) => {
      if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
        return CESIUM_PRE_RENDER_STOP_REASONS.DESTROYED;
      }

      const nextVerticalFov = readTimedCesiumVerticalFov({
        scene,
        curve: nextAnimation.curve,
        nowMs,
      });

      writePerspectiveFrustumVerticalFov(
        scene.camera.frustum,
        typeof nextVerticalFov === "number" &&
          Number.isFinite(nextVerticalFov) &&
          nextVerticalFov > 0
          ? nextVerticalFov
          : nextAnimation.curve.targetFovRad
      );

      return progress < 1
        ? undefined
        : CESIUM_PRE_RENDER_STOP_REASONS.COMPLETED;
    },
    onStop: (reason) => {
      if (nextAnimation.removePreRenderListener) {
        nextAnimation.removePreRenderListener();
        nextAnimation.removePreRenderListener = null;
      }

      nextAnimation.renderRequested = false;
      cesiumFovZoomAnimations.delete(scene);
      clearCesiumSceneActiveFovCurve(scene);
      endCesiumAdaptiveRenderScaleActivity(
        scene,
        FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
      );

      if (
        reason === CESIUM_PRE_RENDER_STOP_REASONS.COMPLETED &&
        !nextAnimation.settled
      ) {
        nextAnimation.settled = true;
        nextAnimation.onCompleted?.();
        return;
      }

      if (
        reason === CESIUM_PRE_RENDER_STOP_REASONS.CANCELED &&
        !nextAnimation.settled
      ) {
        nextAnimation.settled = true;
        nextAnimation.onCanceled?.();
      }
    },
  });

  return () => {
    cancelCesiumSceneFovZoom(scene);
  };
};

export const flyCesiumSceneFovZoom = (
  scene: Scene,
  {
    direction,
    durationMs = 250,
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    currentVerticalFovRadOverride,
    onStarted,
    onCompleted,
    onCanceled,
  }: CesiumTransitionLifecycle & {
    direction: "in" | "out";
    durationMs?: number;
    zoomDelta?: number;
    minimumFovRad: number;
    maximumFovRad: number;
    currentVerticalFovRadOverride?: number;
  }
): boolean => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return false;
  }

  const resolvedTargetFov = computeNextCesiumFov(scene, direction, {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
    currentVerticalFovRadOverride,
  });

  if (
    typeof resolvedTargetFov !== "number" ||
    !Number.isFinite(resolvedTargetFov)
  ) {
    return false;
  }

  const resolvedDurationMs =
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
      ? durationMs
      : 0;

  if (resolvedDurationMs <= 0) {
    cancelCesiumSceneFovZoom(scene);
    onStarted?.();
    writePerspectiveFrustumVerticalFov(scene.camera.frustum, resolvedTargetFov);
    scene.requestRender();
    onCompleted?.();
    return true;
  }

  animateCesiumFov(scene, resolvedTargetFov, resolvedDurationMs, {
    onStarted,
    onCompleted,
    onCanceled,
  });
  return true;
};

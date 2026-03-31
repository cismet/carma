import {
  readVerticalFovFromLongerEdge,
  readTargetLongerEdgeFovForZoomStepFromIntrinsics,
} from "@carma-commons/camera/model";
import { Cartesian3, PerspectiveFrustum, type Scene } from "@carma/cesium";
import { clamp } from "@carma/math";
import type { Radians } from "@carma/units/types";

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
  readSceneAspectRatio,
  readTimedCesiumAnimationProgress,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import { readCachedCesiumViewportCenterZoomAnchor } from "./per-frame-cache";
import type { CesiumTransitionLifecycle } from "./transition-lifecycle";
const DEFAULT_CESIUM_FOV_ZOOM_DELTA = 1;
const FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY = "fov-zoom";

type ActiveCesiumFovZoom = {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
  curve: TimedCesiumFovCurve;
} & CesiumTransitionLifecycle & {
    settled: boolean;
    started: boolean;
  };

const cesiumFovZoomAnimations = new WeakMap<Scene, ActiveCesiumFovZoom>();

const readCurrentAnimatedVerticalFov = (
  scene: Scene,
  nowMs: number
): number | null => {
  const activeAnimation = cesiumFovZoomAnimations.get(scene);
  return activeAnimation
    ? readTimedCesiumVerticalFov({
        scene,
        curve: activeAnimation.curve,
        nowMs,
      }) ?? null
    : scene.camera.frustum instanceof PerspectiveFrustum
    ? readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null
    : null;
};

export const computeNextCesiumFov = (
  scene: Scene,
  direction: "in" | "out",
  {
    zoomDelta = DEFAULT_CESIUM_FOV_ZOOM_DELTA,
    minimumFovRad,
    maximumFovRad,
  }: {
    zoomDelta?: number;
    minimumFovRad: number;
    maximumFovRad: number;
  }
) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const currentVerticalFov = readCurrentAnimatedVerticalFov(
    scene,
    performance.now()
  );
  if (
    typeof currentVerticalFov !== "number" ||
    !Number.isFinite(currentVerticalFov)
  ) {
    return null;
  }
  const zoomAnchor = readCachedCesiumViewportCenterZoomAnchor(scene);
  if (!zoomAnchor.point) {
    return null;
  }

  const currentRangeM = Cartesian3.distance(
    scene.camera.positionWC,
    zoomAnchor.point
  );
  const targetLongerEdgeFov = readTargetLongerEdgeFovForZoomStepFromIntrinsics({
    intrinsics: {
      type: "PerspectiveCamera",
      fov: currentVerticalFov as Radians,
    },
    currentRangeM,
    direction,
    zoomDelta,
    viewportWidthPx: scene.canvas?.clientWidth,
    viewportHeightPx: scene.canvas?.clientHeight,
  });
  const aspectRatio = readSceneAspectRatio(scene);
  const targetVerticalFov =
    targetLongerEdgeFov !== null && aspectRatio !== null
      ? readVerticalFovFromLongerEdge(targetLongerEdgeFov, aspectRatio)
      : null;

  return typeof targetVerticalFov === "number" &&
    Number.isFinite(targetVerticalFov)
    ? clamp(targetVerticalFov, minimumFovRad, maximumFovRad)
    : null;
};

export const cancelCesiumSceneFovZoom = (scene: Scene) => {
  const activeAnimation = cesiumFovZoomAnimations.get(scene);
  if (!activeAnimation) {
    return;
  }

  if (activeAnimation.removePreRenderListener) {
    activeAnimation.removePreRenderListener();
    activeAnimation.removePreRenderListener = null;
  }

  activeAnimation.renderRequested = false;
  cesiumFovZoomAnimations.delete(scene);
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
  const startFovRad = readCurrentAnimatedVerticalFov(scene, nowMs);
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
  if (!nextAnimation.started) {
    nextAnimation.started = true;
    nextAnimation.onStarted?.();
  }
  beginCesiumAdaptiveRenderScaleActivity(
    scene,
    FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );

  const requestNextRender = () => {
    if (nextAnimation.renderRequested) {
      return;
    }

    nextAnimation.renderRequested = true;
    scene.requestRender();
  };

  const step = () => {
    nextAnimation.renderRequested = false;

    const frameNowMs = performance.now();
    const progress = readTimedCesiumAnimationProgress({
      startedAtMs: nextAnimation.curve.startedAtMs,
      durationMs: nextAnimation.curve.durationMs,
      nowMs: frameNowMs,
    });

    if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
      if (nextAnimation.removePreRenderListener) {
        nextAnimation.removePreRenderListener();
        nextAnimation.removePreRenderListener = null;
      }
      cesiumFovZoomAnimations.delete(scene);
      endCesiumAdaptiveRenderScaleActivity(
        scene,
        FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
      );
      return;
    }

    const nextVerticalFov = readTimedCesiumVerticalFov({
      scene,
      curve: nextAnimation.curve,
      nowMs: frameNowMs,
    });

    writePerspectiveFrustumVerticalFov(
      scene.camera.frustum,
      typeof nextVerticalFov === "number" &&
        Number.isFinite(nextVerticalFov) &&
        nextVerticalFov > 0
        ? nextVerticalFov
        : nextAnimation.curve.targetFovRad
    );

    if ((progress ?? 1) < 1) {
      requestNextRender();
      return;
    }

    if (nextAnimation.removePreRenderListener) {
      nextAnimation.removePreRenderListener();
      nextAnimation.removePreRenderListener = null;
    }
    cesiumFovZoomAnimations.delete(scene);
    endCesiumAdaptiveRenderScaleActivity(
      scene,
      FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY
    );
    if (!nextAnimation.settled) {
      nextAnimation.settled = true;
      nextAnimation.onCompleted?.();
    }
  };

  nextAnimation.removePreRenderListener = scene.preRender.addEventListener(
    () => {
      step();
    }
  );
  requestNextRender();

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
    onStarted,
    onCompleted,
    onCanceled,
  }: CesiumTransitionLifecycle & {
    direction: "in" | "out";
    durationMs?: number;
    zoomDelta?: number;
    minimumFovRad: number;
    maximumFovRad: number;
  }
): boolean => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return false;
  }

  const resolvedTargetFov = computeNextCesiumFov(scene, direction, {
    zoomDelta,
    minimumFovRad,
    maximumFovRad,
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

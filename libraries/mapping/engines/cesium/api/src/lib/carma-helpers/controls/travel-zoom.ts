import {
  readDollyCompensatedRange,
  readLongerEdgeFovFromIntrinsics,
  readTargetRangeForZoomStepFromIntrinsics,
  interpolateDollyCompensatedRange,
} from "@carma-commons/camera/model";
import {
  clamp,
  interpolateTimedNumber,
  readTimedInterpolationEasedProgress,
} from "@carma/math";
import type { Radians } from "@carma/units/types";

import {
  readPerspectiveFrustumVerticalFov,
  writePerspectiveFrustumVerticalFov,
} from "../camera";
import { Cartesian3, PerspectiveFrustum, type Scene } from "../../cesium";
import {
  beginCesiumAdaptiveRenderScaleActivity,
  endCesiumAdaptiveRenderScaleActivity,
} from "./adaptive-render-scale";
import {
  buildTimedCesiumFovCurve,
  DEFAULT_CESIUM_ZOOM_EASING,
  readTimedCesiumAnimationProgress,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import { readCachedCesiumViewportCenterZoomAnchor } from "./per-frame-cache";
import type { CesiumTransitionLifecycle } from "./transition-lifecycle";
export type CesiumSceneTravelZoomOptions = CesiumTransitionLifecycle & {
  direction: "in" | "out";
  durationMs?: number;
  zoomDelta?: number;
  synchronizedFovTargetRad?: number;
};

type SceneZoomTarget = {
  targetPoint: Cartesian3;
  distanceBiasM: number;
  minDistanceM: number;
  maxDistanceM: number;
};

type SceneZoomContext = {
  viewDirection: Cartesian3;
  currentDistanceM: number;
  distanceBiasM: number;
  minDistanceM: number;
  maxDistanceM: number;
};

type ActiveCesiumSceneZoom = SceneZoomTarget & {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
  startedAtMs: number;
  durationMs: number;
  startDistanceM: number;
  targetDistanceM: number;
  fovCurve?: TimedCesiumFovCurve;
} & CesiumTransitionLifecycle & {
    settled: boolean;
    started: boolean;
  };

const sceneZoomAnimations = new WeakMap<Scene, ActiveCesiumSceneZoom>();

// Keep enough distance to the globe fallback so the camera does not dive below
// likely terrain elevations when no scene content was picked.
const FALLBACK_MIN_DISTANCE_TO_GLOBE = 2500;
const DEFAULT_ZOOM_DURATION_MS = 500;
const DEFAULT_ZOOM_DELTA = 1;
const MIN_DURATION_MS = 80;
const TRAVEL_ZOOM_RENDER_SCALE_ACTIVITY_KEY = "travel-zoom";

const sceneHasTweens = (scene: Scene) => {
  const sceneWithTweens = scene as Scene & { tweens?: unknown[] };
  return (
    Array.isArray(sceneWithTweens.tweens) && sceneWithTweens.tweens.length > 0
  );
};

const readZoomDelta = (zoomDelta?: number) => {
  if (
    typeof zoomDelta === "number" &&
    Number.isFinite(zoomDelta) &&
    zoomDelta > 0
  ) {
    return zoomDelta;
  }

  return DEFAULT_ZOOM_DELTA;
};

const readDurationMs = (durationMs?: number) => {
  if (durationMs === 0) {
    return 0;
  }

  if (
    typeof durationMs === "number" &&
    Number.isFinite(durationMs) &&
    durationMs > 0
  ) {
    return Math.max(durationMs, MIN_DURATION_MS);
  }

  return DEFAULT_ZOOM_DURATION_MS;
};

const readSceneZoomTarget = (scene: Scene): SceneZoomTarget | null => {
  const camera = scene.camera;
  const canvas = scene.canvas;
  const globe = scene.globe;

  if (!camera || !canvas || !globe) {
    return null;
  }

  const zoomAnchor = readCachedCesiumViewportCenterZoomAnchor(scene);
  if (!zoomAnchor.point) {
    return null;
  }

  return {
    targetPoint: Cartesian3.clone(zoomAnchor.point, new Cartesian3()),
    distanceBiasM: zoomAnchor.usedGlobeFallback
      ? FALLBACK_MIN_DISTANCE_TO_GLOBE
      : 0,
    minDistanceM: scene.screenSpaceCameraController.minimumZoomDistance,
    maxDistanceM: scene.screenSpaceCameraController.maximumZoomDistance,
  };
};

const readSceneZoomContext = (
  scene: Scene,
  zoomTarget: SceneZoomTarget
): SceneZoomContext | null => {
  const camera = scene.camera;
  if (!camera) {
    return null;
  }

  const offsetToTarget = Cartesian3.subtract(
    zoomTarget.targetPoint,
    camera.positionWC,
    new Cartesian3()
  );
  const currentDistanceM = Cartesian3.magnitude(offsetToTarget);
  if (!Number.isFinite(currentDistanceM) || currentDistanceM <= 0) {
    return null;
  }

  return {
    viewDirection: Cartesian3.normalize(offsetToTarget, new Cartesian3()),
    currentDistanceM,
    distanceBiasM: zoomTarget.distanceBiasM,
    minDistanceM: zoomTarget.minDistanceM,
    maxDistanceM: zoomTarget.maxDistanceM,
  };
};

const applySceneZoomTargetDistance = (
  scene: Scene,
  context: SceneZoomContext,
  targetDistanceM: number
) => {
  const minActualDistanceM = context.distanceBiasM + context.minDistanceM;
  const maxActualDistanceM = context.distanceBiasM + context.maxDistanceM;
  const clampedTargetDistanceM = clamp(
    targetDistanceM,
    minActualDistanceM,
    maxActualDistanceM
  );
  const appliedDistanceDeltaM =
    clampedTargetDistanceM - context.currentDistanceM;

  if (Math.abs(appliedDistanceDeltaM) > 0) {
    scene.camera.move(context.viewDirection, -appliedDistanceDeltaM);
  }

  return clampedTargetDistanceM;
};

const readCurrentScheduledDistance = (
  scene: Scene,
  activeAnimation: ActiveCesiumSceneZoom | undefined,
  fallbackDistanceM: number,
  nowMs: number
) => {
  if (!activeAnimation) {
    return fallbackDistanceM;
  }

  if (
    activeAnimation.fovCurve &&
    typeof activeAnimation.fovCurve.startLongerEdgeFovRad === "number" &&
    typeof activeAnimation.fovCurve.targetLongerEdgeFovRad === "number"
  ) {
    const easedProgress = readTimedInterpolationEasedProgress({
      startedAtMs: activeAnimation.fovCurve.startedAtMs,
      durationMs: activeAnimation.fovCurve.durationMs,
      nowMs,
      easing: DEFAULT_CESIUM_ZOOM_EASING,
    });
    const dollyDistanceM =
      easedProgress !== null
        ? interpolateDollyCompensatedRange({
            startRangeM: activeAnimation.startDistanceM,
            startFovRad: activeAnimation.fovCurve.startLongerEdgeFovRad,
            targetFovRad: activeAnimation.fovCurve.targetLongerEdgeFovRad,
            progress: easedProgress,
            minRangeM:
              activeAnimation.distanceBiasM + activeAnimation.minDistanceM,
            viewportWidthPx: scene.canvas?.clientWidth,
            viewportHeightPx: scene.canvas?.clientHeight,
          })
        : null;

    if (typeof dollyDistanceM === "number" && Number.isFinite(dollyDistanceM)) {
      return clamp(
        dollyDistanceM,
        activeAnimation.distanceBiasM + activeAnimation.minDistanceM,
        activeAnimation.distanceBiasM + activeAnimation.maxDistanceM
      );
    }
  }

  return (
    interpolateTimedNumber({
      start: activeAnimation.startDistanceM,
      target: activeAnimation.targetDistanceM,
      startedAtMs: activeAnimation.startedAtMs,
      durationMs: activeAnimation.durationMs,
      nowMs,
      easing: DEFAULT_CESIUM_ZOOM_EASING,
    }) ?? activeAnimation.targetDistanceM
  );
};

const readCurrentScheduledVerticalFov = (
  scene: Scene,
  activeAnimation: ActiveCesiumSceneZoom | undefined,
  nowMs: number
): number | null => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  if (activeAnimation?.fovCurve) {
    return (
      readTimedCesiumVerticalFov({
        scene,
        curve: activeAnimation.fovCurve,
        nowMs,
      }) ?? activeAnimation.fovCurve.targetFovRad
    );
  }

  return readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null;
};

const computeTargetDistanceM = ({
  scene,
  currentDistanceM,
  currentVerticalFovRad,
  direction,
  zoomDelta,
  minDistanceM,
  maxDistanceM,
  distanceBiasM,
  synchronizedFovTargetRad,
}: {
  scene: Scene;
  currentDistanceM: number;
  currentVerticalFovRad: number | null;
  direction: "in" | "out";
  zoomDelta: number;
  minDistanceM: number;
  maxDistanceM: number;
  distanceBiasM: number;
  synchronizedFovTargetRad?: number;
}) => {
  if (
    typeof currentVerticalFovRad !== "number" ||
    !Number.isFinite(currentVerticalFovRad)
  ) {
    return null;
  }

  const unclampedTargetDistanceM =
    typeof synchronizedFovTargetRad === "number" &&
    Number.isFinite(synchronizedFovTargetRad)
      ? (() => {
          const currentLongerEdgeFovRad = readLongerEdgeFovFromIntrinsics(
            {
              fov: currentVerticalFovRad as Radians,
            },
            {
              viewportWidthPx: scene.canvas?.clientWidth,
              viewportHeightPx: scene.canvas?.clientHeight,
            }
          );
          const targetLongerEdgeFovRad = readLongerEdgeFovFromIntrinsics(
            {
              fov: synchronizedFovTargetRad as Radians,
            },
            {
              viewportWidthPx: scene.canvas?.clientWidth,
              viewportHeightPx: scene.canvas?.clientHeight,
            }
          );

          return typeof currentLongerEdgeFovRad === "number" &&
            typeof targetLongerEdgeFovRad === "number"
            ? readDollyCompensatedRange({
                currentRangeM: currentDistanceM,
                currentFovRad: currentLongerEdgeFovRad,
                targetFovRad: targetLongerEdgeFovRad,
                minRangeM: distanceBiasM + minDistanceM,
                viewportWidthPx: scene.canvas?.clientWidth,
                viewportHeightPx: scene.canvas?.clientHeight,
              })
            : null;
        })()
      : readTargetRangeForZoomStepFromIntrinsics({
          intrinsics: {
            fov: currentVerticalFovRad as Radians,
          },
          currentRangeM: currentDistanceM,
          direction,
          zoomDelta,
          minRangeM: distanceBiasM + minDistanceM,
          viewportWidthPx: scene.canvas?.clientWidth,
          viewportHeightPx: scene.canvas?.clientHeight,
        });

  if (unclampedTargetDistanceM === null) {
    return null;
  }

  return clamp(
    unclampedTargetDistanceM,
    distanceBiasM + minDistanceM,
    distanceBiasM + maxDistanceM
  );
};

const stopSceneZoomLoop = (
  scene: Scene,
  activeAnimation: ActiveCesiumSceneZoom,
  { commitFinalState }: { commitFinalState: boolean }
) => {
  if (activeAnimation.removePreRenderListener) {
    activeAnimation.removePreRenderListener();
    activeAnimation.removePreRenderListener = null;
  }

  activeAnimation.renderRequested = false;

  if (commitFinalState) {
    const context = readSceneZoomContext(scene, activeAnimation);
    if (context) {
      applySceneZoomTargetDistance(
        scene,
        context,
        activeAnimation.targetDistanceM
      );
    }

    if (
      scene.camera.frustum instanceof PerspectiveFrustum &&
      activeAnimation.fovCurve
    ) {
      writePerspectiveFrustumVerticalFov(
        scene.camera.frustum,
        activeAnimation.fovCurve.targetFovRad
      );
    }

    scene.requestRender();
  }

  sceneZoomAnimations.delete(scene);
  endCesiumAdaptiveRenderScaleActivity(
    scene,
    TRAVEL_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );

  if (!activeAnimation.settled) {
    activeAnimation.settled = true;
    if (commitFinalState) {
      activeAnimation.onCompleted?.();
    } else {
      activeAnimation.onCanceled?.();
    }
  }
};

const ensureSceneZoomLoop = (
  scene: Scene,
  activeAnimation: ActiveCesiumSceneZoom
) => {
  if (activeAnimation.removePreRenderListener) {
    return;
  }

  const requestNextRender = () => {
    if (activeAnimation.renderRequested) {
      return;
    }

    activeAnimation.renderRequested = true;
    scene.requestRender();
  };

  const step = () => {
    activeAnimation.renderRequested = false;

    if (scene.isDestroyed()) {
      endCesiumAdaptiveRenderScaleActivity(
        scene,
        TRAVEL_ZOOM_RENDER_SCALE_ACTIVITY_KEY
      );
      sceneZoomAnimations.delete(scene);
      return;
    }

    const frameNowMs = performance.now();
    const progress = readTimedCesiumAnimationProgress({
      startedAtMs: activeAnimation.startedAtMs,
      durationMs: activeAnimation.durationMs,
      nowMs: frameNowMs,
    });

    const context = readSceneZoomContext(scene, activeAnimation);
    if (!context) {
      stopSceneZoomLoop(scene, activeAnimation, { commitFinalState: false });
      return;
    }

    const targetDistanceM = readCurrentScheduledDistance(
      scene,
      activeAnimation,
      activeAnimation.targetDistanceM,
      frameNowMs
    );

    applySceneZoomTargetDistance(scene, context, targetDistanceM);

    if (
      scene.camera.frustum instanceof PerspectiveFrustum &&
      activeAnimation.fovCurve
    ) {
      const nextVerticalFov =
        readTimedCesiumVerticalFov({
          scene,
          curve: activeAnimation.fovCurve,
          nowMs: frameNowMs,
        }) ?? activeAnimation.fovCurve.targetFovRad;
      writePerspectiveFrustumVerticalFov(scene.camera.frustum, nextVerticalFov);
    }

    if ((progress ?? 1) < 1) {
      requestNextRender();
      return;
    }

    stopSceneZoomLoop(scene, activeAnimation, { commitFinalState: true });
  };

  activeAnimation.removePreRenderListener = scene.preRender.addEventListener(
    () => {
      step();
    }
  );
  requestNextRender();
};

export const cancelCesiumSceneTravelZoom = (scene: Scene) => {
  const activeAnimation = sceneZoomAnimations.get(scene);
  if (!activeAnimation) {
    return;
  }

  stopSceneZoomLoop(scene, activeAnimation, { commitFinalState: false });
};

export const applyCesiumSceneTravelZoomStep = (
  scene: Scene,
  {
    direction,
    zoomDelta,
    synchronizedFovTargetRad,
  }: Pick<
    CesiumSceneTravelZoomOptions,
    "direction" | "zoomDelta" | "synchronizedFovTargetRad"
  >
): boolean => {
  const camera = scene.camera;
  const canvas = scene.canvas;
  const globe = scene.globe;

  if (!camera || !canvas || !globe) {
    return false;
  }

  if (sceneHasTweens(scene)) {
    camera.cancelFlight();
  }

  const nowMs = performance.now();
  const activeAnimation = sceneZoomAnimations.get(scene);
  const zoomTarget = activeAnimation ?? readSceneZoomTarget(scene);
  if (!zoomTarget) {
    return false;
  }

  const liveContext = readSceneZoomContext(scene, zoomTarget);
  if (!liveContext) {
    return false;
  }

  const startDistanceM = readCurrentScheduledDistance(
    scene,
    activeAnimation,
    liveContext.currentDistanceM,
    nowMs
  );
  const startVerticalFovRad = readCurrentScheduledVerticalFov(
    scene,
    activeAnimation,
    nowMs
  );
  const targetDistanceM = computeTargetDistanceM({
    scene,
    currentDistanceM: startDistanceM,
    currentVerticalFovRad: startVerticalFovRad,
    direction,
    zoomDelta: readZoomDelta(zoomDelta),
    minDistanceM: zoomTarget.minDistanceM,
    maxDistanceM: zoomTarget.maxDistanceM,
    distanceBiasM: zoomTarget.distanceBiasM,
    synchronizedFovTargetRad,
  });

  if (targetDistanceM === null) {
    return false;
  }

  cancelCesiumSceneTravelZoom(scene);
  applySceneZoomTargetDistance(scene, liveContext, targetDistanceM);
  if (
    scene.camera.frustum instanceof PerspectiveFrustum &&
    typeof synchronizedFovTargetRad === "number" &&
    Number.isFinite(synchronizedFovTargetRad)
  ) {
    writePerspectiveFrustumVerticalFov(
      scene.camera.frustum,
      synchronizedFovTargetRad
    );
  }
  scene.requestRender();
  return true;
};

export const animateCesiumSceneTravelZoom = (
  scene: Scene,
  {
    direction,
    durationMs = DEFAULT_ZOOM_DURATION_MS,
    zoomDelta,
    synchronizedFovTargetRad,
    onStarted,
    onCompleted,
    onCanceled,
  }: CesiumSceneTravelZoomOptions
): boolean => {
  const camera = scene.camera;
  const canvas = scene.canvas;
  const globe = scene.globe;

  if (!camera || !canvas || !globe) {
    return false;
  }

  if (sceneHasTweens(scene)) {
    camera.cancelFlight();
  }

  const nowMs = performance.now();
  const activeAnimation = sceneZoomAnimations.get(scene);
  const zoomTarget = activeAnimation ?? readSceneZoomTarget(scene);
  if (!zoomTarget) {
    return false;
  }

  const liveContext = readSceneZoomContext(scene, zoomTarget);
  if (!liveContext) {
    return false;
  }

  const startDistanceM = readCurrentScheduledDistance(
    scene,
    activeAnimation,
    liveContext.currentDistanceM,
    nowMs
  );
  const startVerticalFovRad = readCurrentScheduledVerticalFov(
    scene,
    activeAnimation,
    nowMs
  );

  const resolvedZoomDelta = readZoomDelta(zoomDelta);
  const resolvedDurationMs = readDurationMs(durationMs);
  const targetDistanceM = computeTargetDistanceM({
    scene,
    currentDistanceM: startDistanceM,
    currentVerticalFovRad: startVerticalFovRad,
    direction,
    zoomDelta: resolvedZoomDelta,
    minDistanceM: zoomTarget.minDistanceM,
    maxDistanceM: zoomTarget.maxDistanceM,
    distanceBiasM: zoomTarget.distanceBiasM,
    synchronizedFovTargetRad,
  });

  if (targetDistanceM === null) {
    return false;
  }

  if (resolvedDurationMs <= 0) {
    cancelCesiumSceneTravelZoom(scene);
    onStarted?.();
    applySceneZoomTargetDistance(scene, liveContext, targetDistanceM);
    if (
      scene.camera.frustum instanceof PerspectiveFrustum &&
      typeof synchronizedFovTargetRad === "number" &&
      Number.isFinite(synchronizedFovTargetRad)
    ) {
      writePerspectiveFrustumVerticalFov(
        scene.camera.frustum,
        synchronizedFovTargetRad
      );
    }
    scene.requestRender();
    onCompleted?.();
    return true;
  }

  cancelCesiumSceneTravelZoom(scene);

  const nextAnimation: ActiveCesiumSceneZoom = {
    removePreRenderListener: null,
    renderRequested: false,
    startedAtMs: nowMs,
    durationMs: resolvedDurationMs,
    startDistanceM,
    targetDistanceM,
    targetPoint: Cartesian3.clone(zoomTarget.targetPoint, new Cartesian3()),
    distanceBiasM: zoomTarget.distanceBiasM,
    minDistanceM: zoomTarget.minDistanceM,
    maxDistanceM: zoomTarget.maxDistanceM,
    onStarted,
    onCompleted,
    onCanceled,
    settled: false,
    started: false,
    fovCurve:
      typeof synchronizedFovTargetRad === "number" &&
      Number.isFinite(synchronizedFovTargetRad) &&
      typeof startVerticalFovRad === "number" &&
      Number.isFinite(startVerticalFovRad)
        ? buildTimedCesiumFovCurve({
            scene,
            startedAtMs: nowMs,
            durationMs: resolvedDurationMs,
            startFovRad: startVerticalFovRad,
            targetFovRad: synchronizedFovTargetRad,
          })
        : undefined,
  };

  sceneZoomAnimations.set(scene, nextAnimation);
  if (!nextAnimation.started) {
    nextAnimation.started = true;
    nextAnimation.onStarted?.();
  }
  beginCesiumAdaptiveRenderScaleActivity(
    scene,
    TRAVEL_ZOOM_RENDER_SCALE_ACTIVITY_KEY
  );
  ensureSceneZoomLoop(scene, nextAnimation);
  scene.requestRender();
  return true;
};

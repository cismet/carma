import {
  readVerticalFovFromLongerEdge,
  readTargetLongerEdgeFovForZoomStepFromIntrinsics,
} from "@carma-commons/camera/model";
import { Cartesian3, PerspectiveFrustum, type Scene } from "@carma/cesium";
import { clamp } from "@carma/math";
import {
  readPerspectiveFrustumVerticalFov,
  writePerspectiveFrustumVerticalFov,
} from "../camera";
import { readCachedCesiumViewportCenterZoomAnchor } from "./per-frame-cache";
import {
  buildTimedCesiumFovCurve,
  readSceneAspectRatio,
  readTimedCesiumAnimationProgress,
  readTimedCesiumVerticalFov,
  type TimedCesiumFovCurve,
} from "./cesium-zoom-curves";
import {
  beginCesiumAdaptiveRenderScaleActivity,
  endCesiumAdaptiveRenderScaleActivity,
} from "./adaptive-render-scale";
import type { Radians } from "@carma/units/types";

const DEFAULT_CESIUM_FOV_ZOOM_DELTA = 1;
const FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY = "fov-zoom";

type ActiveCesiumFovZoom = {
  removePreRenderListener: (() => void) | null;
  renderRequested: boolean;
  curve: TimedCesiumFovCurve;
};

const cesiumFovZoomAnimations = new WeakMap<Scene, ActiveCesiumFovZoom>();

const readCurrentAnimatedVerticalFov = (
  scene: Scene,
  nowMs: number
): number | null => {
  const activeAnimation = cesiumFovZoomAnimations.get(scene);
  return activeAnimation
    ? (readTimedCesiumVerticalFov({
        scene,
        curve: activeAnimation.curve,
        nowMs,
      }) ?? null)
    : scene.camera.frustum instanceof PerspectiveFrustum
      ? (readPerspectiveFrustumVerticalFov(scene.camera.frustum) ?? null)
      : null;
};

export const computeNextCesiumFov = ({
  scene,
  direction,
  zoomDelta = DEFAULT_CESIUM_FOV_ZOOM_DELTA,
  minimumFovRad,
  maximumFovRad,
}: {
  scene: Scene;
  direction: "in" | "out";
  zoomDelta?: number;
  minimumFovRad: number;
  maximumFovRad: number;
}) => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return null;
  }

  const currentVerticalFov = readCurrentAnimatedVerticalFov(scene, performance.now());
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

  return typeof targetVerticalFov === "number" && Number.isFinite(targetVerticalFov)
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
  endCesiumAdaptiveRenderScaleActivity(scene, FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY);
};

export const animateCesiumFov = (
  scene: Scene,
  targetFovRad: number,
  durationMs: number
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
    writePerspectiveFrustumVerticalFov(scene.camera.frustum, targetFovRad);
    scene.requestRender();
    return () => {};
  }

  cancelCesiumSceneFovZoom(scene);

  const nextAnimation: ActiveCesiumFovZoom = {
    removePreRenderListener: null,
    renderRequested: false,
    curve: buildTimedCesiumFovCurve({
      scene,
      startedAtMs: nowMs,
      durationMs,
      startFovRad,
      targetFovRad,
    }),
  };
  cesiumFovZoomAnimations.set(scene, nextAnimation);
  beginCesiumAdaptiveRenderScaleActivity(scene, FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY);

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
    endCesiumAdaptiveRenderScaleActivity(scene, FOV_ZOOM_RENDER_SCALE_ACTIVITY_KEY);
  };

  nextAnimation.removePreRenderListener = scene.preRender.addEventListener(() => {
    step();
  });
  requestNextRender();

  return () => {
    cancelCesiumSceneFovZoom(scene);
  };
};

export const flyCesiumSceneFovZoom = (
  scene: Scene,
  {
    direction,
    durationSeconds = 0.25,
    zoomDelta,
    targetFovRad,
    minimumFovRad,
    maximumFovRad,
  }: {
    direction: "in" | "out";
    durationSeconds?: number;
    zoomDelta?: number;
    targetFovRad?: number;
    minimumFovRad: number;
    maximumFovRad: number;
  }
): boolean => {
  if (!(scene.camera.frustum instanceof PerspectiveFrustum)) {
    return false;
  }

  const resolvedTargetFov =
    typeof targetFovRad === "number" && Number.isFinite(targetFovRad)
      ? clamp(targetFovRad, minimumFovRad, maximumFovRad)
      : computeNextCesiumFov({
          scene,
          direction,
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

  const durationMs =
    typeof durationSeconds === "number" &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 0
      ? durationSeconds * 1000
      : 0;

  if (durationMs <= 0) {
    cancelCesiumSceneFovZoom(scene);
    writePerspectiveFrustumVerticalFov(scene.camera.frustum, resolvedTargetFov);
    scene.requestRender();
    return true;
  }

  animateCesiumFov(scene, resolvedTargetFov, durationMs);
  return true;
};

import { useCallback } from "react";

import { Easing } from "@carma-commons/math";
import {
  cancelCesiumSceneTravelZoom,
  animateCesiumSceneTravelZoom,
} from "@carma-mapping/engines/cesium/api";
import { PerspectiveFrustum } from "@carma/cesium";
import type { Ratio, Radians } from "@carma/units/types";

import type { CesiumContextType } from "../CesiumContext";
import { cesiumAnimateFov } from "../utils/cesiumAnimateFov";
import { DEFAULT_MAX_FOV, DEFAULT_MIN_FOV, computeNextFov } from "../utils/fov";
import { cancelSceneAnimation } from "../utils/sceneAnimationMap";
type ZoomOptions = {
  duration?: number;
  zoomDelta?: number;
  moveRateFactor?: number;
  fovMode?: boolean;
};

const MOVE_RATE_EQUIVALENT_FACTOR = 0.5;

const defaultZoomOptions: Required<ZoomOptions> = {
  duration: 0.5,
  zoomDelta: 1,
  moveRateFactor: 1,
  fovMode: false,
};

const readZoomDelta = ({
  zoomDelta,
  moveRateFactor,
}: Pick<ZoomOptions, "zoomDelta" | "moveRateFactor">) =>
  typeof zoomDelta === "number" && Number.isFinite(zoomDelta) && zoomDelta > 0
    ? zoomDelta
    : typeof moveRateFactor === "number" &&
      Number.isFinite(moveRateFactor) &&
      moveRateFactor > 0
    ? moveRateFactor
    : defaultZoomOptions.zoomDelta;

const zoom = (
  ctx: CesiumContextType,
  isZoomOut = false,
  duration: number,
  zoomDelta: number
): void => {
  ctx.withScene((scene) => {
    if (!ctx.sceneAnimationMapRef.current) return;

    if (ctx.sceneAnimationMapRef.current.get(scene)) {
      cancelSceneAnimation(scene, ctx.sceneAnimationMapRef.current);
    }

    animateCesiumSceneTravelZoom(scene, {
      direction: isZoomOut ? "out" : "in",
      durationMs: duration * 1000,
      zoomDelta,
    });
  });
};

const fovZoom = (
  ctx: CesiumContextType,
  zoomIn: boolean,
  duration: number,
  zoomDelta: number,
  maxFov = DEFAULT_MAX_FOV,
  minFov = DEFAULT_MIN_FOV
) => {
  const hasScene = ctx.withScene((scene) => {
    cancelSceneAnimation(scene, ctx.sceneAnimationMapRef.current);
    cancelCesiumSceneTravelZoom(scene);
  });
  if (!hasScene) return;
  ctx.withCamera((camera) => {
    if (!(camera.frustum instanceof PerspectiveFrustum)) {
      console.debug("Camera frustum is not PerspectiveFrustum");
      return;
    }

    if (!camera.frustum.fov) return;

    const currentFov = camera.frustum.fov as Radians;
    const step = zoomIn ? 1 : -1;
    const stepFraction = (zoomDelta * MOVE_RATE_EQUIVALENT_FACTOR) as Ratio;
    const targetFov = computeNextFov(
      currentFov,
      step,
      minFov,
      maxFov,
      stepFraction
    );

    // Use the same per-frame animation helper; it updates on each render
    cesiumAnimateFov(ctx, {
      startFov: currentFov,
      targetFov,
      duration,
      easingFunction: Easing.SINUSOIDAL_IN_OUT,
    });
  });
};

/**
 * @param ctx - Cesium context
 * @param zoomOptions - Options for the zoom animation.
 * @param zoomOptions.fovMode - The mode of the zoom animation. Default is "zoom".
 * @param zoomOptions.duration - The duration of the animation in milliseconds. Default is 0.5.
 * @param zoomOptions.zoomDelta - Shared zoom-step size; `1` doubles/halves center resolution per click.
 * @param zoomOptions.moveRateFactor - Legacy alias for `zoomDelta`.
 */

// TODO remove ctx dependency when switching to context hook, pass pure needed cesium objects or getters instead
export function useZoomControls(
  ctx: CesiumContextType,
  zoomOptions: Partial<ZoomOptions> = {}
) {
  const { duration, fovMode, zoomDelta, moveRateFactor } = {
    ...defaultZoomOptions,
    ...zoomOptions,
  };
  const resolvedZoomDelta = readZoomDelta({ zoomDelta, moveRateFactor });

  const handleZoomIn = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      fovMode
        ? fovZoom(ctx, false, duration * 1000, resolvedZoomDelta)
        : zoom(ctx, false, duration, resolvedZoomDelta);
    },
    [ctx, duration, fovMode, resolvedZoomDelta]
  );

  const handleZoomOut = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      fovMode
        ? fovZoom(ctx, true, duration * 1000, resolvedZoomDelta)
        : zoom(ctx, true, duration, resolvedZoomDelta);
    },
    [ctx, duration, fovMode, resolvedZoomDelta]
  );

  return { handleZoomIn, handleZoomOut };
}

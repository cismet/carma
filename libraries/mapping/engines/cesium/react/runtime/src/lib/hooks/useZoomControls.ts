import { useCallback } from "react";

import { CesiumMath } from "@carma-cesium";
import {
  cancelCesiumSceneTravelZoom,
  animateCesiumSceneTravelZoom,
  cancelSceneAnimation,
  flyCesiumSceneFovZoom,
} from "@carma-mapping/engines/cesium/core";
import type { Radians } from "@carma-units";

import type { CesiumContextType } from "../CesiumContext";
type ZoomOptions = {
  duration?: number;
  zoomDelta?: number;
  fovMode?: boolean;
};

const DEFAULT_MIN_FOV = CesiumMath.toRadians(10) as Radians;
const DEFAULT_MAX_FOV = CesiumMath.toRadians(120) as Radians;

const defaultZoomOptions: Required<ZoomOptions> = {
  duration: 0.5,
  zoomDelta: 1,
  fovMode: false,
};

const readZoomDelta = ({ zoomDelta }: Pick<ZoomOptions, "zoomDelta">) =>
  typeof zoomDelta === "number" && Number.isFinite(zoomDelta) && zoomDelta > 0
    ? zoomDelta
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
  zoomOut: boolean,
  duration: number,
  zoomDelta: number,
  maxFov = DEFAULT_MAX_FOV,
  minFov = DEFAULT_MIN_FOV
) => {
  const hasScene = ctx.withScene((scene) => {
    cancelSceneAnimation(scene, ctx.sceneAnimationMapRef.current);
    cancelCesiumSceneTravelZoom(scene);
    flyCesiumSceneFovZoom(scene, {
      direction: zoomOut ? "out" : "in",
      durationMs: duration,
      zoomDelta,
      minimumFovRad: minFov,
      maximumFovRad: maxFov,
    });
    return true;
  });

  if (!hasScene) return;
};

/**
 * @param ctx - Cesium context
 * @param zoomOptions - Options for the zoom animation.
 * @param zoomOptions.fovMode - The mode of the zoom animation. Default is "zoom".
 * @param zoomOptions.duration - The duration of the animation in milliseconds. Default is 0.5.
 * @param zoomOptions.zoomDelta - Shared zoom-step size; `1` doubles/halves center resolution per click.
 */

// TODO remove ctx dependency when switching to context hook, pass pure needed cesium objects or getters instead
export function useZoomControls(
  ctx: CesiumContextType,
  zoomOptions: Partial<ZoomOptions> = {}
) {
  const { duration, fovMode, zoomDelta } = {
    ...defaultZoomOptions,
    ...zoomOptions,
  };
  const resolvedZoomDelta = readZoomDelta({ zoomDelta });

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

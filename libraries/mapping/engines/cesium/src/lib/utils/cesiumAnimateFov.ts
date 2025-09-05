import { EasingFunction, PerspectiveFrustum, type Viewer } from "cesium";
import { cesiumSafeRequestRender } from "./cesiumHelpers";
import {
  type ViewerAnimationMap,
  cancelViewerAnimation,
  AnimationType,
} from "./viewerAnimationMap";

export interface CesiumAnimateFovOptions {
  viewer: Viewer;
  viewerAnimationMap: ViewerAnimationMap;
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onComplete?: () => void;
}

export const cesiumAnimateFov = ({
  viewer,
  viewerAnimationMap,
  startFov,
  targetFov,
  duration = 300,
  easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
  onComplete,
}: CesiumAnimateFovOptions): (() => void) => {
  // Cancel any existing animation for this viewer when a new one starts
  cancelViewerAnimation(viewer, viewerAnimationMap);

  const startTime = performance.now();
  let animationFrameId: number;

  const animate = (timestamp: number) => {
    if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunction(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer.camera.frustum.fov = newFov;
    cesiumSafeRequestRender(viewer);

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);

      // Update the animation ID in the map
      if (viewerAnimationMap) {
        viewerAnimationMap.set(viewer, {
          id: animationFrameId,
          type: AnimationType.FovChange,
          cancelable: true,
        });
      }
    } else {
      // Animation complete, remove from map
      if (viewerAnimationMap) {
        viewerAnimationMap.delete(viewer);
      }

      if (onComplete) {
        onComplete();
      }
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  // Store initial animation ID in the map
  if (viewerAnimationMap) {
    viewerAnimationMap.set(viewer, {
      id: animationFrameId,
      type: AnimationType.FovChange,
      cancelable: true,
    });
  }

  // Return cleanup function
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);

      // Remove from animation map on cleanup
      if (viewerAnimationMap) {
        viewerAnimationMap.delete(viewer);
      }
    }
  };
};

// Context-based variant using full Cesium context
import type { CesiumContextType } from "../CesiumContext";

export const cesiumAnimateFovCtx = (
  ctx: CesiumContextType,
  opts: Omit<CesiumAnimateFovOptions, "viewer"> & { viewer?: Viewer }
): (() => void) => {
  const viewer = opts.viewer ?? ctx.viewerRef.current;
  if (!viewer) return () => {};

  const { viewerAnimationMap, startFov, targetFov, duration, easingFunction, onComplete } = opts;

  // Cancel any existing animation for this viewer when a new one starts
  cancelViewerAnimation(viewer, viewerAnimationMap);

  const startTime = performance.now();
  let animationFrameId: number;

  const animate = (timestamp: number) => {
    if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / (duration ?? 300), 1);
    const easedProgress = (easingFunction ?? EasingFunction.SINUSOIDAL_IN_OUT)(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer.camera.frustum.fov = newFov;
    ctx.requestRender();

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
      if (viewerAnimationMap) {
        viewerAnimationMap.set(viewer, {
          id: animationFrameId,
          type: AnimationType.FovChange,
          cancelable: true,
        });
      }
    } else {
      if (viewerAnimationMap) {
        viewerAnimationMap.delete(viewer);
      }
      onComplete && onComplete();
    }
  };

  animationFrameId = requestAnimationFrame(animate);
  if (viewerAnimationMap) {
    viewerAnimationMap.set(viewer, {
      id: animationFrameId,
      type: AnimationType.FovChange,
      cancelable: true,
    });
  }

  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      if (viewerAnimationMap) viewerAnimationMap.delete(viewer);
    }
  };
};

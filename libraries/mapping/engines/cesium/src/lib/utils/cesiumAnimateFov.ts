import { EasingFunction, PerspectiveFrustum, type Viewer } from "cesium";
import { cancelViewerAnimation, AnimationType } from "./viewerAnimationMap";
import type { CesiumContextType } from "../CesiumContext";

export interface CesiumAnimateFovOptions {
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onComplete?: () => void;
}

// Context-first FOV animation
export const cesiumAnimateFov = (
  ctx: CesiumContextType,
  {
    startFov,
    targetFov,
    duration = 300,
    easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
    onComplete,
  }: CesiumAnimateFovOptions
): (() => void) => {
  let viewer: Viewer | null = null;
  ctx.withViewer((v) => {
    viewer = v;
  });

  if (!viewer) return () => {};

  const viewerAnimationMap = ctx.viewerAnimationMapRef.current;
  if (viewerAnimationMap) {
    cancelViewerAnimation(viewer, viewerAnimationMap);
  }

  const startTime = performance.now();
  let animationFrameId: number;

  const animate = (timestamp: number) => {
    if (!(viewer!.camera.frustum instanceof PerspectiveFrustum)) {
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunction(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer!.camera.frustum.fov = newFov;
    ctx.requestRender();

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
      if (viewerAnimationMap) {
        viewerAnimationMap.set(viewer!, {
          id: animationFrameId,
          type: AnimationType.FovChange,
          cancelable: true,
        });
      }
    } else {
      if (viewerAnimationMap) {
        viewerAnimationMap.delete(viewer!);
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
      if (viewerAnimationMap) viewerAnimationMap.delete(viewer!);
    }
  };
};

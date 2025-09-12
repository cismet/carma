import { EasingFunction, PerspectiveFrustum, type Viewer } from "cesium";
import { cancelViewerAnimation, AnimationType } from "./viewerAnimationMap";
import type { CesiumContextType } from "../CesiumContext";

export interface CesiumAnimateFovOptions {
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onRender?: (currentFov: number) => void;
  onComplete?: () => void;
}

export const cesiumAnimateFov = (
  ctx: CesiumContextType,
  {
    startFov,
    targetFov,
    duration = 300,
    easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
    onRender,
    onComplete,
  }: CesiumAnimateFovOptions
): void => {
  ctx.withViewer((v: Viewer) => {
    const viewer = v;

    const viewerAnimationMap = ctx.viewerAnimationMapRef.current;
    if (viewerAnimationMap) {
      cancelViewerAnimation(viewer, viewerAnimationMap);
    }

    const startTime = performance.now();
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFunction(progress);
      const newFov = startFov + easedProgress * (targetFov - startFov);

      ctx.withCamera((camera) => {
        if (!(camera.frustum instanceof PerspectiveFrustum)) {
          return;
        }
        camera.frustum.fov = newFov;
      });
      ctx.requestRender();
      onRender && onRender(newFov);

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
        if (viewerAnimationMap) {
          ctx.withViewer((viewer) => {
            viewerAnimationMap.delete(viewer);
          });
        }
      }
    };
  });
};

import { EasingFunction, PerspectiveFrustum, type Viewer } from "cesium";
import { cancelAnimation, AnimationType } from "./AnimationMap";
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
  ctx.withWidget((w: Viewer) => {
    const viewer = w;

    const AnimationMap = ctx.AnimationMapRef.current;
    if (AnimationMap) {
      cancelAnimation(viewer, AnimationMap);
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
      onRender?.(newFov);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
        if (AnimationMap) {
          AnimationMap.set(viewer!, {
            id: animationFrameId,
            type: AnimationType.FovChange,
            cancelable: true,
          });
        }
      } else {
        if (AnimationMap) {
          AnimationMap.delete(viewer!);
        }
        onComplete?.();
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    if (AnimationMap) {
      AnimationMap.set(viewer, {
        id: animationFrameId,
        type: AnimationType.FovChange,
        cancelable: true,
      });
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        if (AnimationMap) {
          ctx.withWidget((w) => {
            AnimationMap.delete(w);
          });
        }
      }
    };
  });
};

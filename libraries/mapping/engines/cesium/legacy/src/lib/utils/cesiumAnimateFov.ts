import { EasingFunction, PerspectiveFrustum } from "cesium";
import { cancelSceneAnimation, AnimationType } from "./sceneAnimationMap";
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
  ctx.withScene((scene) => {
    const sceneAnimationMap = ctx.sceneAnimationMapRef.current;
    if (sceneAnimationMap) {
      cancelSceneAnimation(scene, sceneAnimationMap);
    }

    const startTime = performance.now();
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFunction(progress);
      const newFov = startFov + easedProgress * (targetFov - startFov);

      const camera = scene.camera;
      if (!(camera.frustum instanceof PerspectiveFrustum)) {
        return;
      }
      camera.frustum.fov = newFov;

      scene.requestRender();
      onRender?.(newFov);
      // Emit per-frame FOV changes via Cesium context bus
      // should be ref with getter setter for fast updationg thing like fov
      // ctx.emit?.(CtxEvent.FovChange, newFov);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
        if (sceneAnimationMap) {
          sceneAnimationMap.set(scene, {
            id: animationFrameId,
            type: AnimationType.FovChange,
            cancelable: true,
          });
        }
      } else {
        if (sceneAnimationMap) {
          sceneAnimationMap.delete(scene);
        }
        onComplete?.();
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    if (sceneAnimationMap) {
      sceneAnimationMap.set(scene, {
        id: animationFrameId,
        type: AnimationType.FovChange,
        cancelable: true,
      });
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        if (sceneAnimationMap) {
          sceneAnimationMap.delete(scene);
        }
      }
    };
  });
};

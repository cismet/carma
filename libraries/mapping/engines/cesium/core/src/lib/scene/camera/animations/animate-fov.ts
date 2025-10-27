import { PerspectiveFrustum, type Scene } from "@carma/cesium";
import { Easing } from "@carma-commons/math";
import { AnimationMap, AnimationTypes } from "@carma/types";

import { cancelAnimation } from "./animation-map";
// Event system removed - using direct callbacks instead
import { tryWithValidCamera, tryWithValidScene } from "@carma/cesium";
import { sceneRequestRender } from "../../scene-request-render";

export interface CesiumAnimateFovOptions {
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onRender?: (currentFov: number) => void;
  onComplete?: () => void;
}

export const cesiumAnimateFov = (
  scene: Scene,
  animationMap: AnimationMap,
  onFovChange?: (fov: number) => void,
  {
    startFov,
    targetFov,
    duration = 300,
    easingFunction = Easing.SINUSOIDAL_IN_OUT,
    onRender,
    onComplete,
  }: CesiumAnimateFovOptions
): void => {
  tryWithValidScene(scene, (scene) => {
    const { camera } = scene;

    cancelAnimation(scene, animationMap);

    const startTime = performance.now();
    let animationFrameId: number;

    const animate = (timestamp: number) => {
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easingFunction(progress);
      const newFov = startFov + easedProgress * (targetFov - startFov);

      tryWithValidCamera(camera, (camera) => {
        if (!(camera.frustum instanceof PerspectiveFrustum)) {
          return;
        }
        camera.frustum.fov = newFov;
      });
      sceneRequestRender(scene);
      onRender?.(newFov);
      // Direct callback instead of event emission
      onFovChange?.(newFov);

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(animate);
        if (animationMap) {
          animationMap.set(scene, {
            id: animationFrameId,
            type: AnimationTypes.FovChange,
            cancelable: true,
          });
        }
      } else {
        if (animationMap) {
          animationMap.delete(scene);
        }
        onComplete?.();
      }
    };

    animationFrameId = requestAnimationFrame(animate);
    if (animationMap) {
      animationMap.set(scene, {
        id: animationFrameId,
        type: AnimationTypes.FovChange,
        cancelable: true,
      });
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        if (animationMap) {
          animationMap.delete(scene);
        }
      }
    };
  });
};

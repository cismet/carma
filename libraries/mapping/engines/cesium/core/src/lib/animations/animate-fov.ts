import { EasingFunction, PerspectiveFrustum, type Scene } from "cesium";
import { AnimationMap, AnimationTypes } from "@carma/types";

import { cancelAnimation } from "./animation-map";
import {
  CtxEvent,
  type EmitCesiumCtxFn,
} from "../context/cesiumContextEventMap";
import {
  tryWithValidCamera,
  tryWithValidScene,
} from "@carma-mapping/engines/cesium/api";
import { sceneRequestRender } from "../scene-utilities";

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
  emit: EmitCesiumCtxFn,
  {
    startFov,
    targetFov,
    duration = 300,
    easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
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
      // Emit per-frame FOV changes via Cesium context bus
      emit?.(CtxEvent.FovChange, newFov);

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

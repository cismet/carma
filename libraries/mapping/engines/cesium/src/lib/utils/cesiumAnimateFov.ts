import { EasingFunction, PerspectiveFrustum, type Viewer } from "cesium";

export interface CesiumAnimateFovOptions {
  viewer: Viewer;
  startFov: number;
  targetFov: number;
  duration?: number;
  easingFunction?: (time: number) => number;
  onComplete?: () => void;
}

export const cesiumAnimateFov = ({
  viewer,
  startFov,
  targetFov,
  duration = 300,
  easingFunction = EasingFunction.SINUSOIDAL_IN_OUT,
  onComplete,
}: CesiumAnimateFovOptions): (() => void) => {
  const startTime = performance.now();
  let animationFrameId: number;

  const animate = (timestamp: number) => {
    if (!(viewer.camera.frustum instanceof PerspectiveFrustum)) {
      //resetCamera(viewer);
      return;
    }

    const elapsed = timestamp - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easedProgress = easingFunction(progress);
    const newFov = startFov + easedProgress * (targetFov - startFov);

    viewer.camera.frustum.fov = newFov;

    if (progress < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      //resetCamera(viewer);
      if (onComplete) {
        onComplete();
      }
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  // Return cleanup function
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      //resetCamera(viewer);
    }
  };
};

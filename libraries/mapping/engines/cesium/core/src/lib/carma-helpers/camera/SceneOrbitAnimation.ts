import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  type Scene,
} from "@carma-cesium";

import {
  AnimationType,
  type SceneAnimationMap,
} from "../controls/scene-animation-map";

function runAnimation(
  scene: Scene,
  animationMap: SceneAnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType
) {
  const startTime = performance.now();
  const startHeading = scene.camera.heading || 0;
  const startPitch = scene.camera.pitch || 0;

  const animate = (time: number) => {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1);
    const easeInOutQuad = t * (2 - t);

    let headingDifference = targetHeading - startHeading;
    if (headingDifference > Math.PI) headingDifference -= 2 * Math.PI;
    if (headingDifference < -Math.PI) headingDifference += 2 * Math.PI;

    const currentHeading = startHeading + headingDifference * easeInOutQuad;
    const currentPitch =
      startPitch + (targetPitch - startPitch) * easeInOutQuad;

    scene.camera.lookAt(
      target,
      new HeadingPitchRange(currentHeading, currentPitch, initialRange)
    );

    if (t < 1) {
      const animationFrameId = requestAnimationFrame(animate);
      animationMap.set(scene, {
        id: animationFrameId,
        type: animationType,
        cancelable: true,
      });
    } else {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      animationMap.delete(scene);
    }
  };
  animate(performance.now());
}

export const animateCamera = (
  scene: Scene,
  animationMap: SceneAnimationMap,
  target: Cartesian3,
  targetHeading: number,
  targetPitch: number,
  initialRange: number,
  duration: number,
  animationType: AnimationType = AnimationType.ResetView
) => {
  const previousAnimation = animationMap.get(scene);
  if (previousAnimation) {
    if (previousAnimation.cancelable) {
      console.info(`Canceling previous ${previousAnimation.type} animation`);
      cancelAnimationFrame(previousAnimation.id);
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      runAnimation(
        scene,
        animationMap,
        target,
        targetHeading,
        targetPitch,
        initialRange,
        duration,
        animationType
      );
    } else {
      console.info(
        `Scheduling ${animationType} animation after ${previousAnimation.type}`
      );
      setTimeout(() => {
        runAnimation(
          scene,
          animationMap,
          target,
          targetHeading,
          targetPitch,
          initialRange,
          duration,
          animationType
        );
      }, duration);
    }
  } else {
    runAnimation(
      scene,
      animationMap,
      target,
      targetHeading,
      targetPitch,
      initialRange,
      duration,
      animationType
    );
  }
};

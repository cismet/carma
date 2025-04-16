import {
  Viewer,
  Cartesian3,
  Matrix4,
  Math as CesiumMath,
  HeadingPitchRange,
  EasingFunction,
  Scene,
} from "cesium";

/**
 * Rotates and tilts the Cesium camera around the center of the screen.
 * @param viewer - The Cesium viewer instance.
 * @param destination - The position to look at.
 * @param hpr - the target heading, pitch, and range of the camera.
 * @param options - Options for the completion of the animation.
 * @param options.duration - The duration of the animation in milliseconds. Defaults to 1000.
 * @param options.cancelable - If true, the animation can be canceled by user interaction. Defaults to true.
 * @param options.easing - The easing function to use for the animation. Defaults to EasingFunction.CUBIC_IN_OUT.
 * @param options.onCancel - A callback function to be called when the animation is canceled.
 * @param options.onComplete - A callback function to be called when the animation completes.
 * @param options.setPrevious - A callback function to be called with the initial heading, pitch, and range of the camera.
 * @param options.useCurrentDistance - use current Distance/Range instead of last views one.
 */
export function animateInterpolateHeadingPitchRange(
  viewer: Viewer,
  destination: Cartesian3,
  hpr: HeadingPitchRange = new HeadingPitchRange(0, -Math.PI / 2, 0),
  {
    delay = 0,
    duration = 1000,
    onComplete,
    onCancel,
    cancelable = true,
    useCurrentDistance = true,
    easing = EasingFunction.CUBIC_IN_OUT,
    setPrevious,
  }: {
    setPrevious?: (hpr: HeadingPitchRange) => void;
    duration?: number;
    delay?: number; // ms
    onComplete?: () => void;
    cancelable?: boolean;
    onCancel?: () => void;
    useCurrentDistance?: boolean;
    easing?: (time: number) => number;
  } = {}
): () => void {
  const { heading, pitch, range } = hpr;

  // get HPR from camera in relation to LookAt in order to interpolate to target HPR

  let initialHeading = viewer.camera.heading;
  const initialPitch = viewer.camera.pitch;
  const initialRange = Cartesian3.distance(viewer.camera.position, destination);

  setPrevious &&
    setPrevious({
      heading: initialHeading,
      pitch: initialPitch,
      range: initialRange,
    });

  // Animation control variables
  let animationFrameId: number | null = null;
  let isCanceled = false;

  // Animation start time
  const startTime = performance.now() + delay; // delay the animation for other animations to finish

  const onUserInteraction = () => {
    if (cancelable) {
      console.info("Animation canceled due to user interaction.");
      cancelAnimation();
    }
  };

  const cancelAnimation = () => {
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
      isCanceled = true;
      viewer.canvas.removeEventListener("pointerdown", onUserInteraction);
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      onCancel?.();
    }
  };

  viewer.canvas.addEventListener("pointerdown", onUserInteraction);

  const interpolateAngle = (start: number, end: number, t: number): number => {
    const delta = CesiumMath.negativePiToPi(end - start);
    return start + delta * t;
  };

  const animate = (time: number) => {
    if (isCanceled) return;
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1); // normalize to [0, 1]
    //console.debug('animate', duration, elapsed, t, frameIndex);

    // Interpolate heading and pitch over time
    const currentHeading = interpolateAngle(initialHeading, heading, easing(t));
    const currentPitch = CesiumMath.lerp(initialPitch, pitch, easing(t));
    const currentRange = CesiumMath.clamp(
      useCurrentDistance
        ? initialRange
        : CesiumMath.lerp(initialRange, range, easing(t)),
      10,
      40000
    );

    const orientation = new HeadingPitchRange(
      currentHeading,
      currentPitch,
      currentRange
    );

    // Update the camera's orientation
    viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    viewer.camera.lookAt(destination, orientation);
    // explicit render call due to cesium request render mode.
    viewer.scene.render();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      // Animation complete, reset the transformation matrix
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      viewer.canvas.removeEventListener("pointerdown", onUserInteraction);
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

// undocumented cesium function to get if animation is running
// https://community.cesium.com/t/cancel-a-camera-flyto-intentionally/1371/6
export const cesiumSceneHasTweens = (viewer: Viewer) => {
  const scene = viewer.scene as Scene & { tweens: [] };
  return scene && scene.tweens && scene.tweens.length > 0;
};

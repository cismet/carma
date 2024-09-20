import {
  Viewer,
  Cartesian3,
  Matrix4,
  Math as CeMath,
  HeadingPitchRange,
  EasingFunction,
} from "cesium";

/**
 * Rotates and tilts the Cesium camera around the center of the screen.
 * @param viewer - The Cesium viewer instance.
 * @param destionation - The position to look at.
 * @param hpr - the target heading, pitch, and range of the camera.
 * @param options - Options for the completion of the animation.
 * @param options.duration - The duration of the animation in milliseconds. Defaults to 1000.
 * @param options.onComplete - A callback function to be called when the animation completes.
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
    useCurrentDistance = true,
    easing = EasingFunction.CUBIC_IN_OUT,
  }: {
    duration?: number;
    delay?: number; // ms
    onComplete?: () => void;
    useCurrentDistance?: boolean;
    easing?: (time: number) => number;
  } = {},
) {
  const { heading, pitch, range } = hpr;

  // get HPR from camera in relation to LookAt in order to interpolate to target HPR

  let initialHeading = viewer.camera.heading;
  const initialPitch = viewer.camera.pitch;
  const initialRange = Cartesian3.distance(viewer.camera.position, destination);

  const headingDifference = initialHeading - heading;
  // Check if adding 2π (or 360 degrees) makes the path shorter
  if (Math.abs(headingDifference) > Math.PI) {
    if (headingDifference > 0) {
      initialHeading -= 2 * Math.PI;
    }
  }

  // Animation start time
  const startTime = performance.now() + delay; // delay the animation for other animations to finish
  let frameIndex = 0;

  const animate = (time: number) => {
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1); // normalize to [0, 1]
    //console.log('animate', duration, elapsed, t, frameIndex);

    // Interpolate heading and pitch over time
    const currentHeading = CeMath.lerp(initialHeading, heading, easing(t));
    const currentPitch = CeMath.lerp(initialPitch, pitch, easing(t));
    const currentRange = useCurrentDistance
      ? initialRange
      : CeMath.lerp(initialRange, range, easing(t));

    const orientation = new HeadingPitchRange(
      currentHeading,
      currentPitch,
      currentRange,
    );

    // Update the camera's orientation
    viewer.camera.lookAt(destination, orientation);

    if (t < 1) {
      requestAnimationFrame(animate);
    } else {
      // Animation complete, reset the transformation matrix
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
      onComplete?.();
    }
    frameIndex++;
  };

  requestAnimationFrame(animate);

  return new HeadingPitchRange(initialHeading, initialPitch, initialRange);
}

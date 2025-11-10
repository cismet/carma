import {
  Cartesian3,
  Matrix4,
  CesiumMath,
  HeadingPitchRange,
  Scene,
  isValidCamera,
} from "@carma/cesium";
import { Easing } from "@carma-commons/math";

const DEFAULT_MIN_RANGE = 10;
const DEFAULT_MAX_RANGE = 40000;

interface CesiumAnimateOrbitsOptions {
  duration?: number;
  delay?: number; // ms
  onComplete?: () => void;
  cancelable?: boolean;
  onCancel?: () => void;
  useCurrentDistance?: boolean;
  easing?: (time: number) => number;
  minRange?: number;
  maxRange?: number;
}

export function animateInterpolateHeadingPitchRange(
  scene: Scene,
  destination: Cartesian3,
  hpr: HeadingPitchRange = new HeadingPitchRange(0, -Math.PI / 2, 0),
  {
    delay = 0,
    duration = 1000,
    onComplete,
    onCancel,
    cancelable = true,
    useCurrentDistance = true,
    easing = Easing.CUBIC_IN_OUT,
    minRange = DEFAULT_MIN_RANGE,
    maxRange = DEFAULT_MAX_RANGE,
  }: CesiumAnimateOrbitsOptions = {}
): () => void {
  const { camera, canvas } = scene;
  if (!isValidCamera(camera)) {
    console.warn(
      "[CESIUM|ANIMATE] Cannot animate camera - camera is not valid"
    );
    return () => {};
  }
  // Get current camera state
  let initialHPR: HeadingPitchRange | null = null;
  const range = Cartesian3.distance(camera.position, destination);
  initialHPR = new HeadingPitchRange(camera.heading, camera.pitch, range);

  if (!initialHPR) {
    return () => {};
  }

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
    }
    canvas.removeEventListener("pointerdown", onUserInteraction);
    camera.lookAtTransform(Matrix4.IDENTITY);
    onCancel?.();
  };

  canvas.addEventListener("pointerdown", onUserInteraction);

  const interpolateHpr = (
    startHpr: HeadingPitchRange,
    endHpr: HeadingPitchRange,
    t: number
  ): HeadingPitchRange => {
    const interpolateAngle = (
      start: number,
      end: number,
      t: number
    ): number => {
      const delta = CesiumMath.negativePiToPi(end - start);
      return start + delta * t;
    };

    const currentHeading = interpolateAngle(
      startHpr.heading,
      endHpr.heading,
      t
    );
    const currentPitch = CesiumMath.lerp(startHpr.pitch, endHpr.pitch, t);
    const currentRange = CesiumMath.clamp(
      useCurrentDistance
        ? startHpr.range
        : CesiumMath.lerp(startHpr.range, endHpr.range, t),
      minRange,
      maxRange
    );

    return new HeadingPitchRange(currentHeading, currentPitch, currentRange);
  };

  const animate = (time: number) => {
    if (isCanceled || !initialHPR) return;
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1); // normalize to [0, 1]
    //console.debug('animate', duration, elapsed, t, frameIndex);

    const orientation = interpolateHpr(initialHPR, hpr, easing(t));

    camera.lookAtTransform(Matrix4.IDENTITY);
    camera.lookAt(destination, orientation);

    scene.requestRender();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      camera.lookAtTransform(Matrix4.IDENTITY);
      canvas.removeEventListener("pointerdown", onUserInteraction);
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

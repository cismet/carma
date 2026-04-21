import {
  CESIUM_LOCAL_NORTH_HEADING_RAD,
  CESIUM_NADIR_PITCH_RAD,
} from "@carma-commons/camera/model";
import { Easing } from "@carma-commons/math";

import { isValidCamera } from "../../carma-guards";
import {
  Cartesian3,
  CesiumMath,
  HeadingPitchRange,
  Matrix4,
  Scene,
} from "@carma-cesium";

const DEFAULT_MIN_RANGE = 10;
const DEFAULT_MAX_RANGE = 40000;

interface CesiumAnimateOrbitsOptions {
  duration?: number;
  delay?: number;
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
  hpr: HeadingPitchRange = new HeadingPitchRange(
    CESIUM_LOCAL_NORTH_HEADING_RAD,
    CESIUM_NADIR_PITCH_RAD,
    0
  ),
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

  const range = Cartesian3.distance(camera.position, destination);
  const initialHPR = new HeadingPitchRange(camera.heading, camera.pitch, range);

  let animationFrameId: number | null = null;
  let isCanceled = false;

  const startTime = performance.now() + delay;

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
    progress: number
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
      progress
    );
    const currentPitch = CesiumMath.lerp(
      startHpr.pitch,
      endHpr.pitch,
      progress
    );
    const currentRange = CesiumMath.clamp(
      useCurrentDistance
        ? startHpr.range
        : CesiumMath.lerp(startHpr.range, endHpr.range, progress),
      minRange,
      maxRange
    );

    return new HeadingPitchRange(currentHeading, currentPitch, currentRange);
  };

  const animate = (time: number) => {
    if (isCanceled) return;

    const elapsed = time - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const orientation = interpolateHpr(initialHPR, hpr, easing(progress));

    camera.lookAtTransform(Matrix4.IDENTITY);
    camera.lookAt(destination, orientation);
    scene.requestRender();

    if (progress < 1) {
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

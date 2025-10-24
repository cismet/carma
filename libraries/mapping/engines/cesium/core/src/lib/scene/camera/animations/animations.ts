import {
  Cartesian3,
  HeadingPitchRange,
  Matrix4,
  type Scene,
} from "@carma/cesium";
import { PI_OVER_TWO } from "@carma/units/helpers";
import { Easing, lerp, clamp, lerpAngle } from "@carma-commons/math";
import { tryWithValidScene } from "@carma/cesium";
import { sceneRequestRender } from "../../scene-request-render";

const DEFAULT_MIN_RANGE = 10;
const DEFAULT_MAX_RANGE = 40000;

interface CesiumAnimateOrbitsOptions {
  setPrevious?: (hpr: HeadingPitchRange) => void;
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

/**
 * Rotates and tilts the Cesium camera around the center of the screen.
 * @param ctx - The Cesium context instance.
 * @param destination - The position to look at.
 * @param hpr - the target heading, pitch, and range of the camera.
 * @param options - Options for the completion of the animation.
 * @param options.duration - The duration of the animation in milliseconds. Defaults to 1000.
 * @param options.cancelable - If true, the animation can be canceled by user interaction. Defaults to true.
 * @param options.minRange - Minimum camera range in meters. Defaults to 10.
 * @param options.maxRange - Maximum camera range in meters. Defaults to 40000.
 * @param options.easing - The easing function to use for the animation. Defaults to Easing.CUBIC_IN_OUT.
 * @param options.onCancel - A callback function to be called when the animation is canceled.
 * @param options.onComplete - A callback function to be called when the animation completes.
 * @param options.setPrevious - A callback function to be called with the initial heading, pitch, and range of the camera.
 * @param options.useCurrentDistance - use current Distance/Range instead of last views one.
 */
export function animateInterpolateHeadingPitchRange(
  scene: Scene,
  destination: Cartesian3,
  hpr: HeadingPitchRange = new HeadingPitchRange(0, -PI_OVER_TWO, 0),
  {
    delay = 0,
    duration = 1000,
    onComplete,
    onCancel,
    cancelable = true,
    useCurrentDistance = true,
    easing = Easing.CUBIC_IN_OUT,
    setPrevious,
    minRange = DEFAULT_MIN_RANGE,
    maxRange = DEFAULT_MAX_RANGE,
  }: CesiumAnimateOrbitsOptions = {}
): () => void {
  // Get current camera state
  const camera = scene.camera;
  let initialHPR: HeadingPitchRange | null = null;
  const range = Cartesian3.distance(camera.position, destination);
  initialHPR = new HeadingPitchRange(camera.heading, camera.pitch, range);

  if (!initialHPR) {
    return () => {};
  }

  setPrevious?.(initialHPR);

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
    tryWithValidScene(scene, () => {
      scene.canvas.removeEventListener("pointerdown", onUserInteraction);
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
    });
    onCancel?.();
  };

  tryWithValidScene(scene, () => {
    scene.canvas.addEventListener("pointerdown", onUserInteraction);
  });

  const interpolateHpr = (
    startHpr: HeadingPitchRange,
    endHpr: HeadingPitchRange,
    t: number
  ): HeadingPitchRange => {
    const currentHeading = lerpAngle(startHpr.heading, endHpr.heading, t);
    const currentPitch = lerp(startHpr.pitch, endHpr.pitch, t);
    const currentRange = clamp(
      useCurrentDistance
        ? startHpr.range
        : lerp(startHpr.range, endHpr.range, t),
      minRange,
      maxRange
    );

    return new HeadingPitchRange(currentHeading, currentPitch, currentRange);
  };
  const animate = (time: number) => {
    if (isCanceled || !initialHPR) return;
    const elapsed = time - startTime;
    const t = Math.min(elapsed / duration, 1); // normalize to [0, 1]
    const easedT = easing(t);

    const orientation = interpolateHpr(initialHPR, hpr, easedT);

    //console.debug(`[ANIM] currentHPR: h=${orientation.heading.toFixed(3)}, p=${orientation.pitch.toFixed(3)}, r=${orientation.range.toFixed(2)}`);

    tryWithValidScene(scene, (scene) => {
      scene.camera.lookAtTransform(Matrix4.IDENTITY);
      scene.camera.lookAt(destination, orientation);
    });

    sceneRequestRender(scene);

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      tryWithValidScene(scene, () => {
        scene.camera.lookAtTransform(Matrix4.IDENTITY);
        scene.canvas.removeEventListener("pointerdown", onUserInteraction);
      });
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

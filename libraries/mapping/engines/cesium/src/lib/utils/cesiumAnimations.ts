import {
  Cartesian3,
  Matrix4,
  Math as CesiumMath,
  HeadingPitchRange,
  EasingFunction,
} from "cesium";
import { CesiumContextType } from "../CesiumContext";

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
 * @param options.easing - The easing function to use for the animation. Defaults to EasingFunction.CUBIC_IN_OUT.
 * @param options.onCancel - A callback function to be called when the animation is canceled.
 * @param options.onComplete - A callback function to be called when the animation completes.
 * @param options.setPrevious - A callback function to be called with the initial heading, pitch, and range of the camera.
 * @param options.useCurrentDistance - use current Distance/Range instead of last views one.
 */
export function animateInterpolateHeadingPitchRange(
  ctx: CesiumContextType,
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
    minRange = DEFAULT_MIN_RANGE,
    maxRange = DEFAULT_MAX_RANGE,
  }: CesiumAnimateOrbitsOptions = {}
): () => void {
  // Get current camera state
  let initialHPR: HeadingPitchRange | null = null;
  ctx.withCamera((camera) => {
    const range = Cartesian3.distance(camera.position, destination);
    initialHPR = new HeadingPitchRange(camera.heading, camera.pitch, range);
  });

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
    ctx.withViewer((viewer) => {
      viewer.canvas.removeEventListener("pointerdown", onUserInteraction);
      viewer.camera.lookAtTransform(Matrix4.IDENTITY);
    });
    onCancel?.();
  };

  ctx.withCanvas((canvas) => {
    canvas.addEventListener("pointerdown", onUserInteraction);
  });

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

    ctx.withCamera((camera) => {
      camera.lookAtTransform(Matrix4.IDENTITY);
      camera.lookAt(destination, orientation);
    });

    ctx.requestRender();

    if (t < 1) {
      animationFrameId = requestAnimationFrame(animate);
    } else {
      ctx.withCamera((camera) => {
        camera.lookAtTransform(Matrix4.IDENTITY);
      });
      ctx.withCanvas((canvas) => {
        canvas.removeEventListener("pointerdown", onUserInteraction);
      });
      onComplete?.();
    }
  };

  animationFrameId = requestAnimationFrame(animate);

  return cancelAnimation;
}

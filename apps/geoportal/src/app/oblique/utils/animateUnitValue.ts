import { EasingFunction, Math as CesiumMath } from "cesium";
import { cesiumSafeRequestRender } from "@carma-mapping/cesium-engine";

const DEFAULT_ANIMATION_DURATION = 500; // milliseconds

export interface AnimationState<T> {
  isAnimating: boolean;
  startTime: number | null;
  startValue: T;
  targetValue: T;
  onComplete?: () => void;
  duration: number;
  delay?: number;
  easingFunction: (time: number) => number;
}

export function createAnimationState<T>(
  params: Partial<AnimationState<T>> & { startValue: T; targetValue: T }
): AnimationState<T> {
  return {
    isAnimating: false,
    startTime: null,
    duration: DEFAULT_ANIMATION_DURATION,
    delay: 0,
    easingFunction: EasingFunction.LINEAR_NONE,
    ...params,
  };
}

/**
 * Generic animation processor that updates an animation state and returns the interpolated value
 */
export function processAnimation<T extends number>(
  animState: AnimationState<T>,
  viewer: unknown
): T {
  if (!animState.isAnimating || animState.startTime === null) {
    return animState.targetValue;
  }

  const elapsed =
    performance.now() - animState.startTime - (animState.delay || 0);
  const duration = animState.duration;
  const progress = CesiumMath.clamp(elapsed / duration, 0, 1);
  const easedProgress = animState.easingFunction(progress);
  // Calculate interpolated value
  const newValue =
    animState.startValue +
    (animState.targetValue - animState.startValue) * easedProgress;

  // Check for animation completion
  if (progress >= 1) {
    animState.isAnimating = false;
    animState.onComplete && animState.onComplete();
  }

  cesiumSafeRequestRender(viewer);

  return newValue as T;
}

export function startAnimation<T extends number>(
  animState: AnimationState<T>,
  startValue: T,
  targetValue: T,
  options?: Partial<AnimationState<T>> & { forceStart?: boolean }
): void {
  // Skip animation if the values are already very close and not forced
  if (!options?.forceStart && Math.abs(startValue - targetValue) < 0.1) {
    animState.targetValue = targetValue;
    animState.isAnimating = false;
    return;
  }

  animState.startValue = startValue;
  animState.targetValue = targetValue;
  animState.startTime = performance.now();
  animState.isAnimating = true;

  // Apply any additional options
  if (options) {
    Object.assign(animState, options);
  }
}
